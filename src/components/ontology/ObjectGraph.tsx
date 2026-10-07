import { useMemo } from 'react'
import type { OntologyLink, OntologyObjectType } from '@/lib/ontology'
import { typeColor } from '@/lib/ontology'

// The object graph, laid out by hand rather than by force simulation.
//
// Fourteen nodes is few enough that a deliberate composition beats anything a
// physics solver produces, and a fixed layout does not jitter between renders
// or reflow when someone hovers a node. The arrangement carries meaning: the
// structural spine (Vessel → Project → Work Package) runs left, and the
// cascade (Inspection → Defect → Change Order → Approval) turns the corner and
// runs across the top right. That corner is the whole product.

const VIEW_W = 960
const VIEW_H = 620
const NODE_W = 152
const NODE_H = 48
const HW = NODE_W / 2
const HH = NODE_H / 2

// Four columns, four rows. The asset (Vessel, Space, Part) runs down the left
// middle beside the work done to it; the cascade keeps the top right; the
// people and what they say sit along the bottom. Every registered type has a
// cell, so nothing falls into an overflow row and lands on top of another.
const LAYOUT: Record<string, { x: number; y: number }> = {
  // People and conversation on the left, the project and the asset in the
  // middle, the inspection → defect → change cascade on the right. Every hub
  // edge then joins neighbouring cells instead of crossing the graph.
  PROJECT_MEMBER: { x: 110, y: 80 },
  MESSAGE: { x: 360, y: 80 },
  VESSEL: { x: 600, y: 80 },
  SPACE: { x: 845, y: 80 },
  ACTION_ITEM: { x: 110, y: 240 },
  PROJECT: { x: 360, y: 240 },
  PART: { x: 600, y: 240 },
  INSPECTION_EVENT: { x: 845, y: 240 },
  SUBCONTRACTOR: { x: 110, y: 400 },
  DOCUMENT: { x: 360, y: 400 },
  WORK_PACKAGE: { x: 600, y: 400 },
  DEFECT_RECORD: { x: 845, y: 400 },
  OWNER_APPROVAL: { x: 600, y: 560 },
  CHANGE_ORDER: { x: 845, y: 560 },
}

/** Object types the cascade runs through — drawn with a heavier edge. */
const CASCADE_PATH = new Set(['DEFECT_RECORD', 'CHANGE_ORDER', 'OWNER_APPROVAL'])

/**
 * Walks a line from a node's centre out to where it crosses the node's box, so
 * arrowheads land on the border instead of disappearing underneath it.
 */
function clipToBox(cx: number, cy: number, tx: number, ty: number, pad = 6) {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx === 0 ? Infinity : (HW + pad) / Math.abs(dx)
  const sy = dy === 0 ? Infinity : (HH + pad) / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

interface Edge {
  from: string
  to: string
  label: string
  /** Set when the model declares the link in both directions. */
  reverseLabel: string | null
  x1: number
  y1: number
  x2: number
  y2: number
  /** A type linked to itself (a part inside a part): drawn as a loop. */
  loop: boolean
}

/**
 * A point pushed off the line at right angles.
 *
 * Labels drawn on the line itself knock a hole through it — the halo that keeps
 * the text readable erases the arrow underneath. Offsetting perpendicular keeps
 * both legible: text beside a vertical edge, above a horizontal one.
 */
function labelAnchor(e: Pick<Edge, 'x1' | 'y1' | 'x2' | 'y2'>, distance = 14, t = 0.5) {
  const mx = e.x1 + (e.x2 - e.x1) * t
  const my = e.y1 + (e.y2 - e.y1) * t
  const dx = e.x2 - e.x1
  const dy = e.y2 - e.y1
  const len = Math.hypot(dx, dy) || 1
  // Normal (-dy, dx), flipped so the label always lands up and/or left of the
  // line rather than drifting to a different side per edge.
  let nx = -dy / len
  let ny = dx / len
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx
    ny = -ny
  }
  // Centring a label beside a near-vertical edge still lets wide text reach
  // back across the line. Anchoring it to the side it was pushed toward keeps
  // the whole label clear of the arrow however long the text is.
  const sideways = Math.abs(nx) > Math.abs(ny)
  return {
    x: mx + nx * distance,
    y: my + ny * distance,
    textAnchor: sideways ? (nx < 0 ? 'end' : 'start') : 'middle',
  } as const
}

interface Props {
  types: OntologyObjectType[]
  links: OntologyLink[]
  /** Hover or pin, already resolved by the page. Drives what is highlighted. */
  selected: string | null
  /** Survives the pointer leaving; a second click clears it. */
  pinned: string | null
  onHover: (key: string | null) => void
  onPin: (key: string | null) => void
}

export default function ObjectGraph({
  types,
  links,
  selected,
  pinned,
  onHover,
  onPin,
}: Props) {
  // A type added in SQL but missing from LAYOUT still has to appear, or the
  // graph would quietly under-report the model it claims to describe.
  const positions = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {}
    let spare = 0
    for (const t of types) {
      // A type with no cell yet takes the next free one in the bottom row.
      out[t.key] = LAYOUT[t.key] ?? { x: [110, 360][spare++ % 2], y: 560 }
    }
    return out
  }, [types])

  const edges = useMemo<Edge[]>(() => {
    const pairKey = (a: string, b: string) => `${a}|${b}`
    const byPair = new Map(links.map((l) => [pairKey(l.from_type, l.to_type), l]))
    const drawn = new Set<string>()
    const out: Edge[] = []

    for (const link of links) {
      const a = positions[link.from_type]
      const b = positions[link.to_type]
      if (!a || !b) continue

      const reverse = byPair.get(pairKey(link.to_type, link.from_type))
      // Draw a reciprocal pair once, from whichever end sorts first, so the two
      // halves cannot land on top of each other. Both link names are kept —
      // "resolved by" and "raised from" say different things.
      const canonical = reverse
        ? [link.from_type, link.to_type].sort().join('|')
        : pairKey(link.from_type, link.to_type)
      // Self-links all share one key; they merge into one loop below instead.
      if (link.from_type !== link.to_type) {
        if (drawn.has(canonical)) continue
        drawn.add(canonical)
      }

      if (link.from_type === link.to_type) {
        // Out of the right edge, round and back into the top. A type linked
        // to itself twice (a part inside a part, a part feeding a part) gets
        // one loop carrying both names.
        const existing = out.find((e) => e.loop && e.from === link.from_type)
        if (existing) {
          existing.label = `${existing.label} · ${link.label}`
          continue
        }
        out.push({
          from: link.from_type,
          to: link.to_type,
          label: link.label,
          reverseLabel: null,
          x1: a.x + HW,
          y1: a.y - 8,
          x2: a.x + HW - 26,
          y2: a.y - HH,
          loop: true,
        })
        continue
      }
      const start = clipToBox(a.x, a.y, b.x, b.y)
      const end = clipToBox(b.x, b.y, a.x, a.y)
      out.push({
        loop: false,
        from: link.from_type,
        to: link.to_type,
        label: link.label,
        reverseLabel: reverse?.label ?? null,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      })
    }
    return out
  }, [links, positions])

  // Two edges that cross at their midpoints would print their names on top
  // of each other ("affects" over "inspects"). Each label takes the first spot
  // along its edge that is clear of the labels already placed.
  const labels = useMemo(() => {
    const placed: Array<{ x: number; y: number }> = []
    const out = new Map<Edge, ReturnType<typeof labelAnchor>>()
    for (const e of edges) {
      if (e.loop) {
        // Right of the loop, unless that runs off the canvas (a type in the
        // last column): then above the node, ending where the loop lands.
        const fits = e.x1 + 22 + e.label.length * 6.5 < VIEW_W
        const anchor = fits
          ? { x: e.x1 + 22, y: e.y2 - 18, textAnchor: 'start' as const }
          : { x: e.x2 - 10, y: e.y2 - 10, textAnchor: 'end' as const }
        placed.push(anchor)
        out.set(e, anchor)
        continue
      }
      let chosen = labelAnchor(e)
      for (const t of [0.5, 0.36, 0.64, 0.26, 0.74]) {
        const candidate = labelAnchor(e, 14, t)
        const clear = placed.every((p) => Math.abs(p.x - candidate.x) > 70 || Math.abs(p.y - candidate.y) > 22)
        if (clear) {
          chosen = candidate
          break
        }
      }
      placed.push(chosen)
      out.set(e, chosen)
    }
    return out
  }, [edges])

  const isDimmed = (key: string) => {
    if (!selected) return false
    if (key === selected) return false
    return !edges.some(
      (e) =>
        (e.from === selected && e.to === key) || (e.to === selected && e.from === key),
    )
  }

  const edgeActive = (e: Edge) =>
    !selected || e.from === selected || e.to === selected

  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full min-w-[720px] h-auto select-none"
        role="img"
        aria-label="Object graph of the YAM ontology"
      >
        <defs>
          <marker
            id="og-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
          </marker>
          <marker
            id="og-arrow-active"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--accent))" />
          </marker>
        </defs>

        {/* Clicking the backdrop clears the selection. */}
        <rect
          width={VIEW_W}
          height={VIEW_H}
          fill="transparent"
          onClick={() => onPin(null)}
        />

        {/* Edges first, so nodes sit on top of them. */}
        <g>
          {edges.map((e) => {
            const active = edgeActive(e)
            const highlighted = Boolean(selected) && active
            const onCascade =
              CASCADE_PATH.has(e.from) && CASCADE_PATH.has(e.to)
            const anchor = labels.get(e) ?? labelAnchor(e)

            return (
              <g
                key={`${e.from}-${e.to}`}
                style={{ opacity: active ? 1 : 0.15, transition: 'opacity 200ms' }}
              >
                {e.loop ? (
                  <path
                    d={`M ${e.x1} ${e.y1} C ${e.x1 + 34} ${e.y1 - 6}, ${e.x2 + 12} ${e.y2 - 40}, ${e.x2} ${e.y2}`}
                    fill="none"
                    stroke={highlighted ? 'hsl(var(--accent))' : 'hsl(var(--border))'}
                    strokeWidth={highlighted ? 2 : 1.25}
                    markerEnd={`url(#${highlighted ? 'og-arrow-active' : 'og-arrow'})`}
                  />
                ) : (
                <line
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={
                    highlighted
                      ? 'hsl(var(--accent))'
                      : onCascade
                      ? 'hsl(var(--muted-foreground))'
                      : 'hsl(var(--border))'
                  }
                  strokeWidth={highlighted ? 2 : onCascade ? 1.75 : 1.25}
                  markerEnd={`url(#${highlighted ? 'og-arrow-active' : 'og-arrow'})`}
                  markerStart={
                    e.reverseLabel
                      ? `url(#${highlighted ? 'og-arrow-active' : 'og-arrow'})`
                      : undefined
                  }
                />
                )}
                <text
                  x={anchor.x}
                  y={e.reverseLabel ? anchor.y - 6 : anchor.y}
                  textAnchor={anchor.textAnchor}
                  dominantBaseline="middle"
                  className="text-[11px]"
                  fill={
                    highlighted ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))'
                  }
                  stroke="hsl(var(--background))"
                  strokeWidth={5}
                  paintOrder="stroke"
                >
                  <tspan x={anchor.x}>{e.label}</tspan>
                  {e.reverseLabel && (
                    <tspan x={anchor.x} dy={13}>
                      {e.reverseLabel}
                    </tspan>
                  )}
                </text>
              </g>
            )
          })}
        </g>

        {/* Nodes */}
        <g>
          {types.map((t) => {
            const p = positions[t.key]
            if (!p) return null
            const dimmed = isDimmed(t.key)
            const active = selected === t.key
            const isPinned = pinned === t.key

            return (
              <g
                key={t.key}
                className={`${typeColor(t.key)} cursor-pointer`}
                style={{ opacity: dimmed ? 0.2 : 1, transition: 'opacity 200ms' }}
                onClick={(ev) => {
                  ev.stopPropagation()
                  onPin(isPinned ? null : t.key)
                }}
                onMouseEnter={() => onHover(t.key)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(t.key)}
                onBlur={() => onHover(null)}
                tabIndex={0}
                role="button"
                aria-pressed={isPinned}
                aria-label={`${t.label} — ${t.description}`}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    onPin(isPinned ? null : t.key)
                  }
                }}
              >
                {/* Opaque base so edges never show through the tinted fill. */}
                <rect
                  x={p.x - HW}
                  y={p.y - HH}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="hsl(var(--background))"
                />
                <rect
                  x={p.x - HW}
                  y={p.y - HH}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="currentColor"
                  fillOpacity={active ? 0.18 : 0.09}
                  stroke="currentColor"
                  strokeOpacity={active ? 1 : 0.45}
                  strokeWidth={active ? 2 : 1.25}
                />
                <text
                  x={p.x}
                  y={p.y - 5}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[13px] font-semibold"
                  fill="currentColor"
                >
                  {t.label}
                </text>
                <text
                  x={p.x}
                  y={p.y + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[10px] font-mono"
                  fill="hsl(var(--muted-foreground))"
                >
                  {t.table_name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
