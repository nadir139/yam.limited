import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

// The world-model agent.
//
// The security design is the whole point: this function builds a Supabase
// client from the CALLER's JWT, never from the service-role key. Every tool the
// model invokes therefore runs with exactly the caller's permissions -- the
// Actions layer's write guard applies unchanged, and world_model_events records
// the real human as the actor, not "the agent". An agent that cannot escalate
// past its user is safe by construction; there is no other write path for it to
// reach for.
//
// Tool definitions are generated from the ontology_actions registry rather than
// hardcoded, so an Action added in SQL becomes available to the agent without
// touching this file.

const MODEL = "claude-opus-5";
const MAX_TURNS = 8;
const MAX_ROWS = 50;

const ALLOWED_ORIGINS = new Set([
  "https://yam.limited",
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

interface OntologyType {
  key: string;
  label: string;
  table_name: string;
  description: string;
}
interface OntologyLink {
  from_type: string;
  to_type: string;
  label: string;
  cardinality: string;
}
interface OntologyAction {
  key: string;
  label: string;
  description: string;
  target_type: string;
  parameters: Array<{
    name: string;
    type: string;
    required?: boolean;
    values?: string[];
  }>;
  cascades: string[];
}

/** Maps a registry parameter's declared type onto a JSON Schema fragment. */
function paramSchema(p: OntologyAction["parameters"][number]) {
  if (p.type === "enum" && p.values?.length) {
    return { type: "string", enum: p.values };
  }
  switch (p.type) {
    case "integer":
      return { type: "integer" };
    case "numeric":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "uuid":
      return { type: "string", description: "UUID of an existing object" };
    case "date":
      return { type: "string", description: "ISO date, YYYY-MM-DD" };
    default:
      return { type: "string" };
  }
}

function buildTools(types: OntologyType[], actions: OntologyAction[]) {
  const typeKeys = types.map((t) => t.key);

  const readTools = [
    {
      name: "list_objects",
      description:
        "List objects of one type from the world model. Use this to find an object's id before acting on it, and to answer questions about current project state. Returns at most " +
        MAX_ROWS +
        " rows.",
      input_schema: {
        type: "object",
        properties: {
          object_type: { type: "string", enum: typeKeys },
          limit: { type: "integer", description: "Max rows, 1-" + MAX_ROWS },
        },
        required: ["object_type"],
      },
    },
    {
      name: "get_object",
      description:
        "Fetch one object in full by its id. Use after list_objects when you need every field.",
      input_schema: {
        type: "object",
        properties: {
          object_type: { type: "string", enum: typeKeys },
          id: { type: "string", description: "The object's UUID" },
        },
        required: ["object_type", "id"],
      },
    },
    {
      name: "get_event_history",
      description:
        "Read the world model's append-only event log, newest first. Every state change is recorded here with before/after state and the actor who caused it. cascade_from_event_id links a consequence back to the event that triggered it.",
      input_schema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max events, 1-" + MAX_ROWS },
        },
        required: [],
      },
    },
  ];

  const actionTools = actions.map((a) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of a.parameters ?? []) {
      properties[p.name] = paramSchema(p);
      if (p.required) required.push(p.name);
    }
    const cascadeNote = a.cascades?.length
      ? ` Side effects: this automatically creates or updates ${a.cascades.join(" and ")} when its rules fire -- tell the user what else moved.`
      : "";
    return {
      name: a.key,
      description: `${a.label}. ${a.description}${cascadeNote}`,
      input_schema: { type: "object", properties, required },
    };
  });

  return [...readTools, ...actionTools];
}

function buildSystemPrompt(
  types: OntologyType[],
  links: OntologyLink[],
  actorName: string,
) {
  const typeLines = types
    .map((t) => `- ${t.key} (${t.label}): ${t.description}`)
    .join("\n");
  const linkLines = links
    .map((l) => `- ${l.from_type} ${l.label} ${l.to_type}`)
    .join("\n");

  return `You are the world-model agent for YAM, a maritime intelligence platform for yacht refit and survey projects. You are assisting ${actorName} on Project ZERO, a 55m sailing ketch undergoing a RINA 5-year special survey at Pendennis Shipyard.

The system is not a task tracker. It maintains a world model: every survey finding, change order and owner approval is a typed object linked to other objects, and state changes propagate automatically.

## Object types
${typeLines}

## How objects link
${linkLines}

## How to work
Read before you write. Use list_objects and get_object to ground yourself in real data -- never guess an id, a number, or a status.

The action_* tools are the only way to change anything. They run with ${actorName}'s own permissions and record them as the actor, so you cannot do anything they could not do themselves. Each one validates its input server-side and writes an audit event in the same transaction.

Several actions cascade. Raising a HIGH or CRITICAL defect that carries a cost impact automatically raises the Change Order and the Owner Approval it requires. Deciding an approval propagates that decision to the Change Order it gates. When a cascade fires, say plainly what else changed -- that propagation is the point of the system, and the user needs to know an approval is now waiting on them.

Before taking an action that is not clearly implied by the request, say what you are about to do and why. If the request is ambiguous in a way that would change what you do -- which work package, what severity, whose approval -- ask rather than assume. If an action fails, report the error as given; do not retry it with altered inputs hoping it lands.

Answer in plain prose. Money in euros, dates as written. Reference objects by their human number (NCR-2026-001, CO-2026-003) rather than UUIDs, which mean nothing to the reader.`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, origin);
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return json({ error: "The agent is not configured on this project." }, 500, origin);
  }

  // The caller's bearer token. Everything below runs as them.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Not signed in." }, 401, origin);
  }

  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 2 || prompt.length > 2000) {
    return json({ error: "Ask a question between 2 and 2000 characters." }, 400, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Bound to the caller's JWT -- NOT the service role key. This is what makes
  // the agent safe: RLS and the Actions write guard both apply to it exactly as
  // they apply to the human, and auth.uid() inside each Action resolves to them.
  const supabase: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "Your session has expired. Sign in again." }, 401, origin);
  }
  const actorEmail = userData.user.email ?? "Unknown";

  // Load the ontology registry -- the agent's tool manifest is generated from
  // the same table that documents the object model.
  const [typesRes, linksRes, actionsRes, memberRes] = await Promise.all([
    supabase.from("ontology_object_types").select("*").order("display_order"),
    supabase.from("ontology_links").select("*"),
    supabase.from("ontology_actions").select("*").eq("is_agent_usable", true),
    supabase.from("project_members").select("name").ilike("email", actorEmail).limit(1),
  ]);

  if (typesRes.error || linksRes.error || actionsRes.error) {
    console.error("Failed to load ontology registry", typesRes.error ?? linksRes.error ?? actionsRes.error);
    return json({ error: "Could not load the object model." }, 500, origin);
  }

  const types = (typesRes.data ?? []) as OntologyType[];
  const links = (linksRes.data ?? []) as OntologyLink[];
  const actions = (actionsRes.data ?? []) as OntologyAction[];
  const actorName = memberRes.data?.[0]?.name ?? actorEmail;

  const tableFor = new Map(types.map((t) => [t.key, t.table_name]));
  const actionKeys = new Set(actions.map((a) => a.key));
  const tools = buildTools(types, actions);

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  /** Dispatches one tool call. Table names come from the registry, never the model. */
  async function runTool(name: string, input: Record<string, unknown>) {
    if (name === "list_objects") {
      const table = tableFor.get(String(input.object_type));
      if (!table) return { error: `Unknown object type: ${input.object_type}` };
      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), MAX_ROWS);
      const { data, error } = await supabase.from(table).select("*").limit(limit);
      return error ? { error: error.message } : { rows: data };
    }

    if (name === "get_object") {
      const table = tableFor.get(String(input.object_type));
      if (!table) return { error: `Unknown object type: ${input.object_type}` };
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("id", String(input.id))
        .maybeSingle();
      if (error) return { error: error.message };
      return data ? { object: data } : { error: "No object with that id." };
    }

    if (name === "get_event_history") {
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), MAX_ROWS);
      const { data, error } = await supabase
        .from("world_model_events")
        .select("*")
        .order("triggered_at", { ascending: false })
        .limit(limit);
      return error ? { error: error.message } : { events: data };
    }

    if (actionKeys.has(name)) {
      // Goes through PostgREST as the caller. The Action validates, mutates and
      // logs atomically; a rejection here is the database refusing, not us.
      const { data, error } = await supabase.rpc(name, input);
      return error ? { error: error.message } : { result: data };
    }

    return { error: `Unknown tool: ${name}` };
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: prompt },
  ];
  const system = buildSystemPrompt(types, links, actorName);
  const trace: Array<{ tool: string; input: unknown; ok: boolean }> = [];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system,
        tools,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        // Opus 5's safety classifiers can decline a request outright. "default"
        // lets the API re-run it on the recommended fallback rather than
        // returning the refusal, routed by refusal category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);

      if (response.stop_reason === "refusal") {
        return json(
          { error: "That request was declined. Try rephrasing it.", trace },
          200,
          origin,
        );
      }

      // Push the whole content array, not just text -- thinking blocks must be
      // replayed unchanged on the next turn or the request is rejected.
      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        const reply = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return json({ reply, trace }, 200, origin);
      }

      // Parallel tool calls must all come back in ONE user message, or the model
      // learns to stop issuing them in parallel.
      const results = await Promise.all(
        toolUses.map(async (call) => {
          const out = await runTool(call.name, (call.input ?? {}) as Record<string, unknown>);
          const failed = typeof out === "object" && out !== null && "error" in out;
          trace.push({ tool: call.name, input: call.input, ok: !failed });
          return {
            type: "tool_result" as const,
            tool_use_id: call.id,
            content: JSON.stringify(out),
            is_error: failed,
          };
        }),
      );

      messages.push({ role: "user", content: results });
    }

    return json(
      { reply: "I ran out of steps before finishing. Try narrowing the request.", trace },
      200,
      origin,
    );
  } catch (err) {
    console.error("Agent turn failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: `The agent failed: ${message}`, trace }, 500, origin);
  }
});
