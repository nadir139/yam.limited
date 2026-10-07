import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { CONNECTION_KINDS, PAGE_KINDS, PART_KINDS } from "./proposal.ts";

// Reads a boat's documents and proposes her parts.
//
// Two stages, called by the app one request at a time so no single request
// runs long:
//
//   map   - every document at once: what each page is (prose, a schematic
//           sheet, a copy of a sheet that is also in the set, photos), the
//           vessel, her systems and her spaces.
//   parts - a few pages of one document, with the map as context: the
//           components drawn or described there, where they sit, the
//           designations the drawings use, and how they connect.
//
// Nothing is written here. The app merges the passes (proposal.ts), a person
// reviews the result, and action_apply_part_import commits it. Like the agent,
// this runs as the caller: documents are read through their JWT, so a
// document from a project they are not on is simply not found.

const MODEL = "claude-opus-5-5";
const KEEPALIVE_MS = 15_000;
const MAX_DOCUMENT_BYTES = 30 * 1024 * 1024;

const ALLOWED_ORIGINS = new Set([
  "https://yam.limited",
  "https://www.yam.limited",
  "http://localhost:8080",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://yam.limited";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const CATEGORIES = [
  "STRUCTURAL", "HULL", "MECHANICAL", "ELECTRICAL", "RIGGING", "INTERIOR", "PAINT",
  "CLASS", "SAFETY", "PLANNING", "CADASTRAL", "ENERGY", "LANDSCAPE",
];

// Strict tool schemas: every property required, optional values as null.
const str = { type: "string" };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableInt = { anyOf: [{ type: "integer" }, { type: "null" }] };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const MAP_TOOL = {
  name: "record_document_map",
  description: "Record what the document set contains. Call it exactly once, with everything.",
  strict: true,
  input_schema: obj({
    vessel: obj({ name: nullableStr, vessel_type: nullableStr, build_yard: nullableStr, year_built: nullableStr }),
    pages: {
      type: "array",
      items: obj({
        doc: { type: "integer" },
        page: { type: "integer" },
        kind: { type: "string", enum: [...PAGE_KINDS] },
        sheet: nullableStr,
        title: nullableStr,
        revision: nullableStr,
        system_key: nullableStr,
      }),
    },
    systems: {
      type: "array",
      items: obj({
        key: str,
        name: str,
        parent_key: nullableStr,
        category: { anyOf: [{ type: "string", enum: CATEGORIES }, { type: "null" }] },
      }),
    },
    spaces: { type: "array", items: obj({ key: str, name: str, parent_key: nullableStr }) },
    notes: { type: "array", items: str },
  }),
};

const PARTS_TOOL = {
  name: "record_parts",
  description: "Record the parts, connections and new spaces found on these pages. Call it exactly once.",
  strict: true,
  input_schema: obj({
    parts: {
      type: "array",
      items: obj({
        id: str,
        name: str,
        kind: { type: "string", enum: [...PART_KINDS] },
        system_key: nullableStr,
        parent_id: nullableStr,
        space_key: nullableStr,
        designation: nullableStr,
        manufacturer: nullableStr,
        model: nullableStr,
        serial_number: nullableStr,
        location: nullableStr,
        safety_critical: { type: "boolean" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        refs: {
          type: "array",
          items: obj({
            page: { type: "integer" },
            grid: nullableStr,
            bbox: { anyOf: [{ type: "array", items: { type: "number" } }, { type: "null" }] },
            note: nullableStr,
          }),
        },
      }),
    },
    connections: {
      type: "array",
      items: obj({
        from: str,
        to: str,
        kind: { type: "string", enum: [...CONNECTION_KINDS] },
        label: nullableStr,
        page: nullableInt,
      }),
    },
    new_spaces: { type: "array", items: obj({ key: str, name: str, parent_key: nullableStr }) },
  }),
};

const MAP_PROMPT = `You are reading the technical documents of a vessel (or building) for an asset register. The documents are attached in order; the first is document 0.

Call record_document_map once with:

- vessel: the asset's name, type/model, builder and year if any document states them; null where not stated. Do not guess.
- pages: one entry for EVERY page of EVERY document (doc = document index, page = 1-based page number in that document). kind:
  TEXT = prose describing systems or procedures (it may include small photos or diagrams);
  SCHEMATIC = a technical drawing sheet;
  SCHEMATIC_COPY = a reproduction of a drawing sheet that is ALSO present as its own page elsewhere in the set (for example a manual embedding the schematics); compare sheet numbers and titles to decide;
  PHOTOS = photographs only; INDEX = a contents page; OTHER = anything else.
  sheet = the drawing number from the title block or caption (e.g. "10.1", "50.4"); title and revision/date as printed; system_key = the system the page is about.
- systems: the asset's systems as a tree of at most three levels, using the documents' own grouping and names (e.g. Electrical > DC system > DC distribution; Plumbing > Bilge; Propulsion > Cooling water). Keys are short stable slugs ("dc", "dc_distribution", "bilge"). category is the closest discipline.
- spaces: the physical places the documents mention (compartments, cabins, lockers, panels' locations such as "aft peak SB", "engine room", "wet cell", "owner's cabin", "navigation area"), as a tree where one contains another. Normalise names (one entry per real place) but keep side markers (PS/SB) when they distinguish two places.
- notes: anything a reviewer should know (unreadable pages, conflicting revisions, a sheet referenced but missing).`;

function partsPrompt(map: unknown, docTitle: string, pages: number[]) {
  return `You are extracting the physical parts of an asset from pages ${pages.join(", ")} of "${docTitle}" (attached; the attachment contains only these pages, in this order: ${pages.map((p, i) => `attachment page ${i + 1} = page ${p}`).join("; ")}). Always report the ORIGINAL page numbers.

The whole document set was already mapped; use these system and space keys and do not invent parallel ones:
${JSON.stringify(map)}

Call record_parts once with:

- parts: every physical component, assembly or sub-system drawn or described on these pages: batteries, chargers, inverters, alternators, regulators, switches, breakers and fuses (with their numbers), panels, pumps, valves and seacocks, strainers, filters, tanks, sensors and gauges, lights, winches, thrusters, appliances, hoses only when they are a named item. Not: wires, labels, the waterline, the hull outline, title blocks.
  id: unique within this call. name: what a person on board would call it ("Bilge pump engine room", "Breaker bilge pump E/R", "Shore power connection"), not a bare code. kind: COMPONENT for a single item, ASSEMBLY for a group with its own parts (a panel, a box of breakers), SYSTEM only for a system from the map.
  system_key from the map. parent_id: another id from THIS call when the part sits inside it (a breaker inside the DC distribution panel), else null.
  space_key: where it physically is, from the map's spaces or new_spaces; null if not stated.
  designation: the tag the drawing uses (breaker "11.1Q21", fuse "F3"), else null.
  manufacturer / model / serial_number only when printed. location: the documents' own words for where it is.
  safety_critical: true for through-hull fittings, seacocks, overboard and shut-off valves below the waterline, fuel shut-offs, gas, fire and bilge alarm equipment.
  confidence: low when the drawing is hard to read or you inferred the item.
  refs: where it appears on these pages. grid = the drawing's grid cell as printed on the border (column letter + row number, e.g. "F8"), or the row number alone for a list row; bbox = [x0, y0, x1, y1] as fractions 0-1 of the page AS DISPLAYED (origin top-left), tight around the symbol and its label.
- connections: how parts relate, as drawn or described. kind: POWERS (supply to consumer), PROTECTS (breaker/fuse to the circuit it protects), CONTROLS (switch/panel to what it operates), SIGNALS (sensor to gauge or alarm), FLOWS_TO (water, fuel or waste, upstream to downstream), CONNECTED otherwise. from/to: a part id from this call; "@<designation>" for a part known only by its tag; or "=><sheet>/<row>" exactly as a drawing cross-reference prints it (e.g. "=>11.1/21") when the other end is on another sheet. label: breaker number, cable section or hose diameter if printed. page: original page number.
- new_spaces: places on these pages that are not in the map's spaces (same key/name/parent_key shape).

Read carefully: these drawings are dense and often rotated. Prefer fewer, correct parts over many guessed ones.`;
}

/** The first record_* tool call in a response, or null. */
function toolInput(message: Anthropic.Beta.BetaMessage, name: string): unknown {
  for (const block of message.content) {
    if (block.type === "tool_use" && block.name === name) return block.input;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json({ error: "Document reading is not configured on this project." }, 500, origin);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Not signed in." }, 401, origin);

  let body: {
    projectId?: unknown;
    stage?: unknown;
    documentIds?: unknown;
    documentIndex?: unknown;
    pages?: unknown;
    map?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const stage = body.stage === "map" || body.stage === "parts" ? body.stage : null;
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((d): d is string => typeof d === "string").slice(0, 10)
    : [];
  if (!projectId || !stage || documentIds.length === 0) {
    return json({ error: "Give projectId, stage (map or parts) and documentIds." }, 400, origin);
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return json({ error: "Your session has expired. Sign in again." }, 401, origin);

  // Read through the caller's own JWT: RLS is the membership check.
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, title, file_url, mime_type, project_id")
    .eq("project_id", projectId)
    .in("id", documentIds);
  if (docsError) return json({ error: docsError.message }, 500, origin);
  const ordered = documentIds.map((id) => docs?.find((d) => d.id === id)).filter(Boolean) as Array<{
    id: string; title: string; file_url: string | null; mime_type: string | null;
  }>;
  if (ordered.length !== documentIds.length) {
    return json({ error: "One of those documents is not on this project." }, 404, origin);
  }
  for (const d of ordered) {
    if (!d.file_url) return json({ error: `"${d.title}" has no file.` }, 400, origin);
    if (d.mime_type && d.mime_type !== "application/pdf") {
      return json({ error: `"${d.title}" is not a PDF. Only PDFs can be read for parts.` }, 400, origin);
    }
  }

  async function fetchPdf(d: { title: string; file_url: string | null }): Promise<Uint8Array> {
    const res = await fetch(d.file_url!);
    if (!res.ok) throw new Error(`Could not download "${d.title}" (${res.status}).`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error(`"${d.title}" is larger than 30 MB.`);
    return bytes;
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  async function run(): Promise<Record<string, unknown>> {
    if (stage === "map") {
      // Page counting is left to the model: parsing every PDF here would spend
      // the function's CPU budget before the read even starts.
      const pdfs = await Promise.all(ordered.map(fetchPdf));
      const total = pdfs.reduce((sum, b) => sum + b.byteLength, 0);
      if (total > MAX_DOCUMENT_BYTES) {
        throw new Error("These documents are over 30 MB together. Import them in smaller sets.");
      }
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      ordered.forEach((d, i) => {
        content.push({
          type: "document",
          title: `Document ${i}: ${d.title}`,
          source: { type: "base64", media_type: "application/pdf", data: toBase64(pdfs[i]) },
        } as Anthropic.Beta.BetaContentBlockParam);
      });
      content.push({ type: "text", text: MAP_PROMPT });

      const message = await ask(content, MAP_TOOL, "medium");
      const map = toolInput(message, MAP_TOOL.name);
      if (!map) throw new Error("The documents could not be mapped. Try again.");
      return { map, usage: message.usage };
    }

    // stage === "parts": a few pages of one document.
    const index = typeof body.documentIndex === "number" ? body.documentIndex : -1;
    const pages = Array.isArray(body.pages)
      ? [...new Set(body.pages.filter((p): p is number => Number.isInteger(p) && p >= 1))].sort((a, b) => a - b)
      : [];
    if (index < 0 || index >= ordered.length || pages.length === 0 || pages.length > 6) {
      throw new Error("Give documentIndex and 1-6 pages.");
    }
    const source = await PDFDocument.load(await fetchPdf(ordered[index]), { ignoreEncryption: true, updateMetadata: false });
    if (pages.some((p) => p > source.getPageCount())) throw new Error("A page is past the end of the document.");
    const slice = await PDFDocument.create();
    const copied = await slice.copyPages(source, pages.map((p) => p - 1));
    for (const page of copied) slice.addPage(page);
    const sliced = await slice.save();

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      {
        type: "document",
        title: `${ordered[index].title}, pages ${pages.join(", ")}`,
        source: { type: "base64", media_type: "application/pdf", data: toBase64(sliced) },
      } as Anthropic.Beta.BetaContentBlockParam,
      { type: "text", text: partsPrompt(compactMap(body.map), ordered[index].title, pages) },
    ];
    const message = await ask(content, PARTS_TOOL, "high");
    const result = toolInput(message, PARTS_TOOL.name);
    if (!result) throw new Error(`Pages ${pages.join(", ")} could not be read. Try again.`);
    return { result, usage: message.usage };
  }

  /** One model call that must end in the given tool. Retries once if it does not. */
  async function ask(
    content: Anthropic.Beta.BetaContentBlockParam[],
    tool: typeof MAP_TOOL | typeof PARTS_TOOL,
    effort: "medium" | "high",
  ): Promise<Anthropic.Beta.BetaMessage> {
    let last: Anthropic.Beta.BetaMessage | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort },
        // Forced tool choice is not available on this model: the prompt asks
        // for the call, and a response without it is retried once.
        tool_choice: { type: "auto" },
        tools: [tool],
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [{ role: "user", content }],
      } as unknown as Anthropic.Beta.MessageCreateParamsStreaming);
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") throw new Error("The model declined to read these pages.");
      if (message.stop_reason === "max_tokens") throw new Error("Too much on these pages for one pass; read fewer at a time.");
      last = message;
      if (toolInput(message, tool.name)) return message;
    }
    return last!;
  }

  // Streamed so a long read is not cut off as an idle connection: keepalives
  // while the model works, then one result line.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (event: Record<string, unknown>) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      const keepalive = setInterval(() => write({ type: "ping" }), KEEPALIVE_MS);
      try {
        write({ type: "result", ok: true, ...(await run()) });
      } catch (err) {
        console.error("extract-parts failed", err);
        write({ type: "result", ok: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        clearInterval(keepalive);
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", ...corsHeaders(origin) },
  });
});

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** The map without its per-page list: systems, spaces and the sheet index are what a pass needs. */
function compactMap(map: unknown) {
  if (!map || typeof map !== "object") return {};
  const m = map as Record<string, unknown>;
  const pages = Array.isArray(m.pages) ? m.pages : [];
  return {
    systems: m.systems ?? [],
    spaces: m.spaces ?? [],
    sheets: pages
      .filter((p: Record<string, unknown>) => p && p.sheet)
      .map((p: Record<string, unknown>) => ({ doc: p.doc, page: p.page, sheet: p.sheet, title: p.title })),
  };
}
