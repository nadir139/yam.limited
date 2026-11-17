import { useEffect, useMemo, useRef, useState } from "react";

// The record as a graph, for the public site: eighteen of the ontology's
// object types in five groups, joined by the link names the database stores
// (ontology_links, Nov 2026). Hover or tap a type to see what it touches.
// Until someone does, it walks through a few on its own.
//
// Hand-placed. On a phone the same graph scrolls sideways at a readable size
// rather than being squeezed: a tall arrangement put edges through labels,
// because three types that all link to each other cannot share a row.

type Key =
  | "PROJECT_MEMBER" | "MESSAGE" | "ACTION_ITEM"
  | "PROJECT" | "DOCUMENT"
  | "WORK_PACKAGE" | "INSPECTION_EVENT" | "DEFECT_RECORD" | "CHANGE_ORDER" | "OWNER_APPROVAL"
  | "VESSEL" | "PART" | "SPACE"
  | "CREW" | "LOG_DAY" | "LOG_ENTRY" | "READING" | "SERVICE_INTERVAL";

const NODES: Record<Key, { label: string; group: Group; says: string }> = {
  PROJECT_MEMBER: { label: "Member", group: "people", says: "Owner, captain, yard, surveyor: each with the permissions of their role." },
  MESSAGE: { label: "Message", group: "people", says: "The conversation, kept on the record it is about." },
  ACTION_ITEM: { label: "Action item", group: "people", says: "Naming someone in a message makes it theirs to answer." },
  PROJECT: { label: "Project", group: "project", says: "A refit, a survey or a new build: the work done to one boat." },
  DOCUMENT: { label: "Document", group: "project", says: "Drawings, quotes and certificates, filed against what they describe." },
  WORK_PACKAGE: { label: "Work package", group: "work", says: "A piece of the job, with its dates, cost and the parts it works on." },
  INSPECTION_EVENT: { label: "Inspection", group: "work", says: "A survey or a check, of a package or a part." },
  DEFECT_RECORD: { label: "NCR", group: "work", says: "A finding, on a part, discovered by an inspection or logged at sea." },
  CHANGE_ORDER: { label: "Change order", group: "work", says: "The price and the days of putting a finding right." },
  OWNER_APPROVAL: { label: "Owner approval", group: "work", says: "Nothing changes the scope until the owner decides." },
  VESSEL: { label: "Vessel", group: "asset", says: "The boat. Every project and every log day is hers." },
  PART: { label: "Part", group: "asset", says: "Engines to seacocks: where the work, the findings and the readings meet." },
  SPACE: { label: "Space", group: "asset", says: "Where a part sits: engine room, lazarette, forepeak." },
  CREW: { label: "Crew", group: "service", says: "Who is aboard, their certificates and their hours of rest." },
  LOG_DAY: { label: "Log day", group: "service", says: "A day of the boat's life; a day in the yard counts toward the refit." },
  LOG_ENTRY: { label: "Log entry", group: "service", says: "What happened, and the defect it became." },
  READING: { label: "Reading", group: "service", says: "Engine hours and gauges, read on the part they belong to." },
  SERVICE_INTERVAL: { label: "Service interval", group: "service", says: "Due by hours or by days, from the readings." },
};

type Group = "people" | "project" | "work" | "asset" | "service";
const GROUPS: Record<Group, string> = {
  people: "People",
  project: "The project",
  work: "The work",
  asset: "The asset",
  service: "In service",
};

// From ontology_links, restricted to the types above.
const LINKS: Array<[Key, string, Key]> = [
  ["PROJECT", "concerns", "VESSEL"],
  ["WORK_PACKAGE", "belongs to", "PROJECT"],
  ["WORK_PACKAGE", "works on", "PART"],
  ["INSPECTION_EVENT", "inspects", "WORK_PACKAGE"],
  ["INSPECTION_EVENT", "inspects", "PART"],
  ["DEFECT_RECORD", "affects", "WORK_PACKAGE"],
  ["DEFECT_RECORD", "discovered by", "INSPECTION_EVENT"],
  ["DEFECT_RECORD", "is found on", "PART"],
  ["DEFECT_RECORD", "resolved by", "CHANGE_ORDER"],
  ["CHANGE_ORDER", "gated by", "OWNER_APPROVAL"],
  ["CHANGE_ORDER", "changes", "PART"],
  ["DOCUMENT", "filed under", "PROJECT"],
  ["DOCUMENT", "describes", "PART"],
  ["MESSAGE", "posted in", "PROJECT"],
  ["MESSAGE", "mentions", "PROJECT_MEMBER"],
  ["PROJECT_MEMBER", "works on", "PROJECT"],
  ["ACTION_ITEM", "asked in", "MESSAGE"],
  ["ACTION_ITEM", "owed by", "PROJECT_MEMBER"],
  ["PART", "is fitted to", "VESSEL"],
  ["PART", "sits in", "SPACE"],
  ["CREW", "serves aboard", "VESSEL"],
  ["LOG_DAY", "is a day of", "VESSEL"],
  ["LOG_DAY", "had aboard", "CREW"],
  ["LOG_DAY", "counts as a yard day of", "PROJECT"],
  ["LOG_ENTRY", "was raised as", "DEFECT_RECORD"],
  ["LOG_ENTRY", "concerns", "PART"],
  ["READING", "was read on", "PART"],
  ["READING", "is written in the log as", "LOG_ENTRY"],
  ["SERVICE_INTERVAL", "is due on", "PART"],
];

interface Layout {
  w: number;
  h: number;
  nodeW: number;
  pos: Record<Key, [number, number]>;
  groups: Array<{ group: Group; x: number; y: number; anchor: "middle" | "start" }>;
}

// Placed so no edge runs under a node it does not belong to (checked by
// clipping every link against every other node's box), keeping each group
// roughly in its column.
const WIDE: Layout = {
  w: 980, h: 640, nodeW: 138,
  pos: {
    MESSAGE: [80, 165], PROJECT_MEMBER: [160, 325], ACTION_ITEM: [80, 505],
    PROJECT: [305, 245], DOCUMENT: [305, 455],
    INSPECTION_EVENT: [510, 85], WORK_PACKAGE: [535, 270], DEFECT_RECORD: [440, 320], CHANGE_ORDER: [480, 445], OWNER_APPROVAL: [485, 565],
    VESSEL: [685, 125], PART: [690, 315], SPACE: [695, 525],
    LOG_DAY: [900, 165], CREW: [895, 220], LOG_ENTRY: [900, 395], READING: [900, 480], SERVICE_INTERVAL: [890, 605],
  },
  groups: [
    { group: "people", x: 110, y: 40, anchor: "middle" },
    { group: "project", x: 305, y: 40, anchor: "middle" },
    { group: "work", x: 495, y: 40, anchor: "middle" },
    { group: "asset", x: 690, y: 40, anchor: "middle" },
    { group: "service", x: 895, y: 40, anchor: "middle" },
  ],
};

const NODE_H = 36;
// A tour for whoever has not touched it yet: the cascade, then the boat in service.
const TOUR: Key[] = ["DEFECT_RECORD", "PART", "LOG_ENTRY", "PROJECT", "CHANGE_ORDER"];

/** From a box's centre toward a point, stopping at the box's edge. */
function edgePoint(cx: number, cy: number, tx: number, ty: number, hw: number, hh: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(dx ? (hw + 4) / Math.abs(dx) : Infinity, dy ? (hh + 4) / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

const OntologyMap = () => {
  const L = WIDE;
  const frame = useRef<HTMLDivElement>(null);
  // On a phone, open on the middle of the graph (the asset) rather than its left edge.
  useEffect(() => {
    const el = frame.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.55;
  }, []);
  const [picked, setPicked] = useState<Key | null>(null);
  const [tour, setTour] = useState(0);
  const touched = picked !== null;

  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTour((i) => (i + 1) % TOUR.length), 3200);
    return () => clearInterval(id);
  }, [touched]);

  const active: Key = picked ?? TOUR[tour];
  const near = useMemo(() => {
    const s = new Set<Key>([active]);
    for (const [a, , b] of LINKS) {
      if (a === active) s.add(b);
      if (b === active) s.add(a);
    }
    return s;
  }, [active]);

  const hw = L.nodeW / 2;
  const hh = NODE_H / 2;
  const touching = LINKS.filter(([a, , b]) => a === active || b === active);

  return (
    <div>
      <div ref={frame} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className="h-auto w-full min-w-[820px] select-none md:min-w-0" role="img" aria-label="The YAM ontology: object types and how they link">
        <defs>
          <marker id="om-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="hsl(var(--mark))" />
          </marker>
        </defs>

        {L.groups.map((g) => (
          <text key={g.group} x={g.x} y={g.y} textAnchor={g.anchor} className="mono" fontSize={11} letterSpacing="0.12em" fill="hsl(var(--ink-soft))">
            {GROUPS[g.group].toUpperCase()}
          </text>
        ))}

        {/* Every link, faint; the ones touching the active type, in ink with their names */}
        {LINKS.map(([a, label, b]) => {
          const [ax, ay] = L.pos[a];
          const [bx, by] = L.pos[b];
          const [x1, y1] = edgePoint(ax, ay, bx, by, hw, hh);
          const [x2, y2] = edgePoint(bx, by, ax, ay, hw, hh);
          const on = a === active || b === active;
          return (
            <line
              key={`${a}-${label}-${b}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={on ? "hsl(var(--mark))" : "hsl(var(--rule))"}
              strokeWidth={on ? 1.6 : 1}
              markerEnd={on ? "url(#om-arrow)" : undefined}
              style={{ transition: "stroke .25s, stroke-width .25s" }}
            />
          );
        })}

        {(Object.keys(NODES) as Key[]).map((k) => {
          const [x, y] = L.pos[k];
          const isActive = k === active;
          const lit = near.has(k);
          return (
            <g
              key={k}
              transform={`translate(${x - hw} ${y - hh})`}
              onMouseEnter={() => setPicked(k)}
              onClick={() => setPicked(k)}
              className="cursor-pointer"
              style={{ opacity: lit ? 1 : 0.45, transition: "opacity .25s" }}
            >
              <rect
                width={L.nodeW} height={NODE_H} rx={2}
                fill={isActive ? "hsl(var(--ink))" : "hsl(var(--paper))"}
                stroke={isActive ? "hsl(var(--ink))" : lit ? "hsl(var(--ink) / 0.6)" : "hsl(var(--rule))"}
                strokeWidth={1}
              />
              <text
                x={L.nodeW / 2} y={NODE_H / 2 + 4.5} textAnchor="middle" fontSize={13}
                className="serif" fontWeight={600}
                fill={isActive ? "hsl(var(--paper))" : "hsl(var(--ink))"}
              >
                {NODES[k].label}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <p className="label mt-2 text-[10px] md:hidden">Swipe to see the whole graph</p>

      {/* What the active type is, and what it is linked to, in words */}
      <div className="mt-6 grid gap-6 border-t rule pt-5 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="label mb-2">{GROUPS[NODES[active].group]}</p>
          <p className="serif mb-2 text-2xl font-semibold">{NODES[active].label}</p>
          <p className="soft text-[15px] leading-relaxed">{NODES[active].says}</p>
        </div>
        <ul className="space-y-1.5 md:col-span-7">
          {touching.map(([a, label, b]) => (
            <li key={`${a}-${label}-${b}`} className="text-[15px]">
              <span className={a === active ? "font-semibold" : ""}>{NODES[a].label}</span>
              <span className="mono mark mx-2 text-xs">{label}</span>
              <span className={b === active ? "font-semibold" : ""}>{NODES[b].label}</span>
            </li>
          ))}
        </ul>
      </div>
      {!touched && <p className="label mt-4 text-[10px]">Hover or tap a type</p>}
    </div>
  );
};

export default OntologyMap;
