// deno test supabase/functions/extract-parts/proposal_test.ts
import { assertEquals, assert } from "jsr:@std/assert@1";
import { buildProposal, normaliseName, planChunks, type DocumentMap, type Chunk } from "./proposal.ts";

// A slice of Lucky Bird's set: the manual (doc 0) embeds sheet 50.4, which is
// also its own page in the schematics (doc 1); sheet 11.1 holds the breakers.
const map: DocumentMap = {
  vessel: { name: "Lucky Bird", vessel_type: "Sens 48", build_yard: null, year_built: null },
  pages: [
    { doc: 0, page: 1, kind: "INDEX", sheet: null, title: "Inhoud", revision: null, system_key: null },
    { doc: 0, page: 8, kind: "TEXT", sheet: null, title: "Bilge system", revision: null, system_key: "bilge" },
    { doc: 0, page: 9, kind: "SCHEMATIC_COPY", sheet: "50.4", title: "Bilge pumps", revision: null, system_key: "bilge" },
    { doc: 1, page: 2, kind: "SCHEMATIC", sheet: "11.1", title: "24VDC distribution", revision: "v3", system_key: "dc" },
    { doc: 1, page: 8, kind: "SCHEMATIC", sheet: "50.4", title: "Bilge pumps", revision: "v2", system_key: "bilge" },
    { doc: 1, page: 9, kind: "SCHEMATIC", sheet: "50.5", title: "Cooling water", revision: "v2", system_key: "cooling" },
    { doc: 1, page: 11, kind: "SCHEMATIC", sheet: "50.7", title: "Fresh water", revision: "v2", system_key: null },
  ],
  systems: [
    { key: "electrical", name: "Electrical", parent_key: null, category: "ELECTRICAL" },
    { key: "dc", name: "DC system", parent_key: "electrical", category: "ELECTRICAL" },
    { key: "plumbing", name: "Plumbing", parent_key: null, category: "MECHANICAL" },
    { key: "bilge", name: "Bilge", parent_key: "plumbing", category: "MECHANICAL" },
    { key: "cooling", name: "Cooling water", parent_key: "plumbing", category: "MECHANICAL" },
  ],
  spaces: [
    { key: "er", name: "Engine room", parent_key: null },
    { key: "aft", name: "Aft peak SB", parent_key: null },
  ],
  notes: [],
};

const empty = { parts: [], connections: [], new_spaces: [] };
const chunks: Chunk[] = [
  { // manual text, page 8
    documentId: "doc-manual", sheets: { 8: null },
    result: {
      ...empty,
      parts: [
        { id: "a", name: "Bilge pump engine room", kind: "COMPONENT", system_key: "bilge", parent_id: null, space_key: "er", designation: null, manufacturer: null, model: null, serial_number: null, location: "in the engine room", safety_critical: false, confidence: "high", refs: [{ page: 8, grid: null, bbox: null, note: null }] },
      ],
    },
  },
  { // schematic 11.1, page 2: breakers
    documentId: "doc-schem", sheets: { 2: "11.1" },
    result: {
      ...empty,
      parts: [
        { id: "p", name: "DC distribution panel", kind: "ASSEMBLY", system_key: "dc", parent_id: null, space_key: null, designation: null, manufacturer: null, model: null, serial_number: null, location: "RCP", safety_critical: false, confidence: "high", refs: [{ page: 2, grid: null, bbox: [0.6, 0.05, 0.7, 0.9], note: null }] },
        { id: "q21", name: "Breaker bilge pump E/R", kind: "COMPONENT", system_key: "dc", parent_id: "p", space_key: null, designation: "11.1Q21", manufacturer: null, model: null, serial_number: null, location: null, safety_critical: false, confidence: "high", refs: [{ page: 2, grid: "B21", bbox: [0.62, 0.64, 0.68, 0.66], note: null }] },
        { id: "q20", name: "Breaker bilge pump", kind: "COMPONENT", system_key: "dc", parent_id: "p", space_key: null, designation: "11.1Q20", manufacturer: null, model: null, serial_number: null, location: null, safety_critical: false, confidence: "medium", refs: [{ page: 2, grid: "B20", bbox: [2, 0.6, 0.1, 0.62], note: null }] },
      ],
      connections: [{ from: "q21", to: "=>50.4/8", kind: "PROTECTS", label: "11.1Q21", page: 2 }],
    },
  },
  { // schematic 50.4, page 8
    documentId: "doc-schem", sheets: { 8: "50.4" },
    result: {
      parts: [
        { id: "x", name: "Bilge pump E/R", kind: "COMPONENT", system_key: "bilge", parent_id: null, space_key: "er", designation: null, manufacturer: "Whale", model: "Gulper", serial_number: null, location: null, safety_critical: false, confidence: "high", refs: [{ page: 8, grid: "G8", bbox: [0.38, 0.47, 0.43, 0.51], note: null }] },
        { id: "y", name: "Bilge pump between fresh water tanks", kind: "COMPONENT", system_key: "bilge", parent_id: null, space_key: null, designation: null, manufacturer: "Whale", model: "Gulper", serial_number: null, location: null, safety_critical: false, confidence: "high", refs: [{ page: 8, grid: "G10", bbox: null, note: null }] },
        { id: "o", name: "Overboard aft peak SB", kind: "COMPONENT", system_key: "bilge", parent_id: null, space_key: "aft", designation: null, manufacturer: null, model: null, serial_number: null, location: null, safety_critical: true, confidence: "medium", refs: [{ page: 8, grid: "F3", bbox: null, note: null }] },
      ],
      connections: [
        { from: "=>11.1/21", to: "x", kind: "PROTECTS", label: null, page: 8 },
        { from: "=>11.1/20", to: "y", kind: "PROTECTS", label: null, page: 8 },
        { from: "x", to: "o", kind: "FLOWS_TO", label: "Ø19mm", page: 8 },
        { from: "y", to: "o", kind: "FLOWS_TO", label: "Ø19mm", page: 8 },
        { from: "y", to: "@NOPE", kind: "SIGNALS", label: null, page: 8 },
      ],
      new_spaces: [{ key: "aft2", name: "aft peak SB", parent_key: null }, { key: "ft", name: "Between fresh water tanks", parent_key: null }],
    },
  },
];

Deno.test("names fold case, punctuation and side words", () => {
  assertEquals(normaliseName("Bilge pump E/R"), "bilge pump er");
  assertEquals(normaliseName("Bilge pump engine room"), "bilge pump er");
  assertEquals(normaliseName("Winch Port Aft"), normaliseName("winch PS aft"));
  assertEquals(normaliseName("Starboard light"), normaliseName("SB light"));
});

Deno.test("plan reads each sheet once and skips copies, photos and indexes", () => {
  const plan = planChunks(map, 2);
  assertEquals(plan, [
    { documentIndex: 0, pages: [8] },
    { documentIndex: 1, pages: [2] },
    { documentIndex: 1, pages: [8, 9] },
    { documentIndex: 1, pages: [11] },
  ]);
});

Deno.test("the merge folds, resolves and keeps provenance", () => {
  const p = buildProposal({
    documentIds: ["doc-manual", "doc-schem"],
    map,
    chunks,
    existing: {
      parts: [{ id: "existing-electrical", name: "electrical", parent_id: null, removed_at: null }],
      spaces: [{ id: "existing-er", name: "Engine Room", parent_id: null, removed_at: null }],
    },
  });
  const byName = (n: string) => p.parts.find((x) => x.name === n)!;

  // Systems first, nested as the map said; an existing system is reused.
  assertEquals(byName("DC system").parent_key, byName("Electrical").key);
  assertEquals(byName("Electrical").existing_id, "existing-electrical");
  assertEquals(p.spaces.find((s) => s.name === "Engine room")!.existing_id, "existing-er");

  // "Bilge pump engine room" (manual) and "Bilge pump E/R" (sheet) are one pump.
  const pumps = p.parts.filter((x) => /^bilge pump (engine room|e\/r)$/i.test(x.name))
  assertEquals(pumps.length, 1);
  const pump = pumps[0];
  assertEquals(pump.manufacturer, "Whale");
  assertEquals(pump.refs.length, 2);
  assert(pump.aliases.length === 1);

  // The breaker sits in the panel, keeps its tag and its sheet.
  const q21 = byName("Breaker bilge pump E/R");
  assertEquals(q21.parent_key, byName("DC distribution panel").key);
  assertEquals(q21.refs[0].sheet, "11.1");
  // A box outside the page is dropped, not stored.
  assertEquals(byName("Breaker bilge pump").refs[0].bbox, null);

  // Cross-sheet references resolve to the breakers.
  const protects = p.connections.filter((c) => c.kind === "PROTECTS");
  assert(protects.some((c) => c.from_key === q21.key && c.to_key === pump.key));
  assert(protects.some((c) => c.from_key === byName("Breaker bilge pump").key && c.to_key === byName("Bilge pump between fresh water tanks").key));
  // The "=>50.4/8" end from sheet 11.1 resolves to the pump drawn in row 8 of 50.4; same link as above, kept once.
  assertEquals(protects.filter((c) => c.from_key === q21.key).length, 1);

  // Spaces fold by name; the overboard is safety-critical and in the aft peak.
  assertEquals(p.spaces.filter((s) => normaliseName(s.name) === "aft peak sb").length, 1);
  const ob = byName("Overboard aft peak SB");
  assert(ob.safety_critical);
  assertEquals(p.spaces.find((s) => s.key === ob.space_key)!.name, "Aft peak SB");

  // Unresolvable ends become warnings, not guesses.
  assert(p.warnings.some((w) => w.includes("@NOPE")));
  assertEquals(p.vessel?.name, "Lucky Bird");
});
