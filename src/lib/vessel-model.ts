import type { Part, PartConnection, Space, Vessel } from './types'

// The boat as a 3D model, before there is a scan of her.
//
// The hull is drawn from the three numbers the record has (LOA, beam, draft),
// and every space and part is put where its name says it is: "aft peak SB"
// goes aft and to starboard, "engine room" low and a third of the way
// forward, anything on "Rig & sails" up the mast. Positions are a best guess
// and are marked as such; nothing here is stored.
//
// The coordinate frame is the one a scan will be registered into later, so a
// position written in it now still means the same place then:
//   metres; x forward (stern at -LOA/2, bow at +LOA/2); y up (0 = waterline);
//   z to starboard (port is negative).

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Box {
  center: Vec3
  size: Vec3
}

export interface HullDims {
  loa: number
  beam: number
  draft: number
  /** Deck height above the waterline amidships. */
  freeboard: number
  /** Depth of the canoe body (the hull without its keel). */
  canoe: number
  sail: boolean
  mastHeight: number
  /** True when a dimension came from a default rather than the record. */
  assumed: boolean
}

export interface PlacedSpace {
  space: Space
  box: Box
  /** The name gave no clue; the box was put in a free slot. */
  guessed: boolean
  /** Someone placed it by hand (spaces.model_box); not a guess at all. */
  stored: boolean
}

export interface PlacedPart {
  part: Part
  position: Vec3
  /**
   * How the position was found: its own space, an ancestor's, beside the
   * parts it is connected to, or from the names along its path.
   */
  source: 'stored' | 'space' | 'ancestor' | 'connection' | 'name'
}

export interface VesselModel {
  dims: HullDims
  spaces: PlacedSpace[]
  parts: PlacedPart[]
  connections: PartConnection[]
}

// ─── Hull ────────────────────────────────────────────────────────────────────

const SAIL_RE = /\b(sail|sailing|sloop|ketch|yawl|cutter|schooner|swan|catamaran|yacht)\b/i
const RIG_RE = /\b(mast|rig|rigging|sails?|boom|spreaders?|shrouds?|halyards?)\b/i

export function hullDims(vessel: Pick<Vessel, 'loa' | 'beam' | 'draft' | 'vessel_type'> | null, parts: Part[] = []): HullDims {
  const loa = vessel?.loa && vessel.loa > 2 ? vessel.loa : 14
  const beam = vessel?.beam && vessel.beam > 0.5 ? vessel.beam : +(loa * 0.3).toFixed(2)
  const sail =
    SAIL_RE.test(vessel?.vessel_type ?? '') || parts.some((p) => !p.removed_at && RIG_RE.test(p.name))
  const draft = vessel?.draft && vessel.draft > 0.2 ? vessel.draft : +(loa * (sail ? 0.16 : 0.08)).toFixed(2)
  return {
    loa,
    beam,
    draft,
    freeboard: Math.max(0.6, loa * 0.075),
    // A sailing yacht's draft is mostly keel; a motor boat's is mostly hull.
    canoe: sail ? Math.min(draft * 0.35, loa * 0.06) : draft * 0.85,
    sail,
    mastHeight: sail ? loa * 1.35 : 0,
    assumed: !(vessel?.loa && vessel?.beam && vessel?.draft),
  }
}

/** Half-beam at a fraction t of the length (0 = transom, 1 = stem). */
export function halfBeamAt(dims: HullDims, t: number): number {
  const c = Math.min(1, Math.max(0, t))
  const b = dims.beam / 2
  if (c <= 0.45) return b * (0.78 + 0.22 * Math.sin((c / 0.45) * (Math.PI / 2)))
  return b * Math.pow(Math.cos(((c - 0.45) / 0.55) * (Math.PI / 2)), 0.85)
}

/** Deck height above the waterline at t: the sheer rises toward the bow. */
export function sheerAt(dims: HullDims, t: number): number {
  return dims.freeboard * (1 + 0.22 * t * t)
}

/** Depth of the canoe body below the waterline at t. */
export function depthAt(dims: HullDims, t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return dims.canoe * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, c * 1.1 + 0.02)))
}

export const xAt = (dims: HullDims, t: number) => -dims.loa / 2 + t * dims.loa

/**
 * The hull surface as stations × ring points, for a BufferGeometry. Each ring
 * runs starboard deck edge → keel → port deck edge and closes across the deck.
 */
export function hullRings(dims: HullDims, stations = 40, perSide = 10): Vec3[][] {
  const rings: Vec3[][] = []
  for (let i = 0; i <= stations; i++) {
    const t = i / stations
    const x = xAt(dims, t)
    const hb = Math.max(halfBeamAt(dims, t), 0.004)
    const sheer = sheerAt(dims, t)
    const depth = depthAt(dims, t)
    const side: Vec3[] = [{ x, y: sheer, z: hb * 0.97 }]
    for (let j = 0; j <= perSide; j++) {
      const a = (j / perSide) * (Math.PI / 2)
      side.push({ x, y: -depth * Math.sin(a), z: hb * Math.pow(Math.cos(a), 0.55) })
    }
    const mirrored = side.slice(0, -1).reverse().map((p) => ({ ...p, z: -p.z }))
    rings.push([...side, ...mirrored])
  }
  return rings
}

// ─── Reading a name ──────────────────────────────────────────────────────────

type Level = 'deck' | 'interior' | 'low' | 'mast'

interface NameHint {
  /** Fraction of the length, 0 = transom, 1 = stem. */
  t: number | null
  side: -1 | 0 | 1
  level: Level | null
}

// First match wins, so the specific names sit above the general ones.
const ALONG: Array<[RegExp, number]> = [
  [/\b(fore ?peak|chain locker|anchor|anchor locker|bow|stem|v ?berth|fore ?cabin|forward cabin|fwd cabin|bow thruster|windlass)\b/, 0.88],
  [/\b(lazarette|lazzarette|aft peak|transom|stern|steering|rudder|quadrant|swim platform|stern thruster)\b/, 0.06],
  [/\b(cockpit|helm|wheel|binnacle|pedestal|primary|primaries|secondary|winch|winches)\b/, 0.2],
  [/\b(aft cabin|owner|owners|master)\b/, 0.22],
  [/\b(er|engine|engines|machinery|propulsion|generator|genset|shaft|gearbox|saildrive|exhaust)\b/, 0.32],
  [/\b(nav|chart|navigation|instruments?|electronics|mainboard|main board|switchboard|switch board|rcp|control panel|electrical panel|breaker panel|distribution)\b/, 0.42],
  [/\b(galley|kitchen|fridge|refrigerator|refrigeration|stove|freezer)\b/, 0.46],
  [/\b(saloon|salon|lounge|interior|mess|dinette)\b/, 0.53],
  [/\b(mast|rig|rigging|sails?|boom|spreaders?|shrouds?|halyards?|stays?|furler|vang)\b/, 0.6],
  [/\b(heads?|toilet|wc|shower|bathroom|wet ?cell)\b/, 0.68],
  [/\b(fresh ?water|water tanks?|fuel tanks?)\b/, 0.5],
  [/\b(forward|fwd|fore)\b/, 0.78],
  [/\b(aft|after)\b/, 0.15],
  [/\b(mid|midship|midships|amidships|central|centre|center)\b/, 0.5],
]

const LEVELS: Array<[RegExp, Level]> = [
  // "Under floor PS of mast" is in the bilge, not up the mast.
  [/\b(under ?floor|under|floor|sole|bilges?)\b/, 'low'],
  [/\b(mast|rig|rigging|sails?|boom|spreaders?|shrouds?|halyards?|stays?|furler|vang)\b/, 'mast'],
  [/\b(deck|decks|cockpit|coachroof|flybridge|bridge|cabin top|bimini|helm|winch|winches|stanchions?|pulpit|hatch|hatches|windlass)\b/, 'deck'],
  [/\b(bilge|bilges|tanks?|keel|sump|fuel|water|holding|ballast|plumbing|hull|structure|bottom|through ?hulls?|seacocks?)\b/, 'low'],
]

/** Lower-case words only, "E/R" and "P/S" folded the way the importer folds them. */
export function nameWords(name: string): string {
  return ` ${name
    .toLowerCase()
    .replace(/\be\s*\/\s*r\b/g, ' er ')
    .replace(/\bp\s*\/\s*s\b/g, ' ps ')
    .replace(/\bs\s*\/\s*b\b/g, ' sb ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `
}

export function readName(name: string): NameHint {
  const w = nameWords(name)
  const along = ALONG.find(([re]) => re.test(w))
  const level = LEVELS.find(([re]) => re.test(w))
  const port = /\b(port|ps)\b/.test(w)
  const starboard = /\b(starboard|stbd|sb)\b/.test(w)
  return {
    t: along ? along[1] : null,
    side: port && !starboard ? -1 : starboard && !port ? 1 : 0,
    level: level ? level[1] : null,
  }
}

// ─── Placing spaces and parts ────────────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A box someone stored (migration 030), or null when there is none or it is malformed. */
export function storedBox(raw: unknown): Box | null {
  const b = raw as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return null
  const { x, y, z, sx, sy, sz } = b
  if (![x, y, z, sx, sy, sz].every(isNum) || !((sx as number) > 0 && (sy as number) > 0 && (sz as number) > 0)) return null
  return { center: { x: x as number, y: y as number, z: z as number }, size: { x: sx as number, y: sy as number, z: sz as number } }
}

/** A position someone stored (migration 030), or null. */
export function storedPosition(raw: unknown): Vec3 | null {
  const p = raw as Record<string, unknown> | null
  if (!p || typeof p !== 'object') return null
  const { x, y, z } = p
  return [x, y, z].every(isNum) ? { x: x as number, y: y as number, z: z as number } : null
}

/** The stored form of a box, rounded to the centimetre the database keeps. */
export function boxToStored(b: Box) {
  const r = (v: number) => Math.round(v * 100) / 100
  return {
    x: r(b.center.x), y: r(b.center.y), z: r(b.center.z),
    sx: Math.max(0.05, r(b.size.x)), sy: Math.max(0.05, r(b.size.y)), sz: Math.max(0.05, r(b.size.z)),
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** A box for a hint, sized to the hull at that point. */
function zoneBox(dims: HullDims, t: number, side: -1 | 0 | 1, level: Level, length: number): Box {
  const tc = clamp(t, 0.04, 0.94)
  const x = xAt(dims, tc)
  const hb = Math.max(halfBeamAt(dims, tc), 0.3)
  const sheer = sheerAt(dims, tc)
  const depth = depthAt(dims, tc)
  const width = side === 0 ? hb * 1.4 : hb * 0.75
  const z = side * hb * 0.48
  let y0: number
  let y1: number
  if (level === 'deck') {
    y0 = sheer - 0.1
    y1 = sheer + 0.7
  } else if (level === 'mast') {
    y0 = sheer
    y1 = sheer + Math.max(dims.mastHeight * 0.92, 1)
  } else if (level === 'low') {
    y0 = -depth * 0.85
    y1 = Math.min(0.15, sheer * 0.3)
  } else {
    y0 = -depth * 0.55
    y1 = sheer * 0.9
  }
  const isMast = level === 'mast'
  return {
    center: { x, y: (y0 + y1) / 2, z: isMast ? 0 : z },
    size: { x: isMast ? 0.5 : length, y: y1 - y0, z: isMast ? 0.5 : width },
  }
}

/** Repeatable scatter: the same id always lands in the same spot. */
function hash01(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

function insideBox(box: Box, id: string, margin = 0.18): Vec3 {
  const f = (salt: number) => margin + hash01(id, salt) * (1 - 2 * margin) - 0.5
  return {
    x: box.center.x + f(1) * box.size.x,
    y: box.center.y + f(2) * box.size.y,
    z: box.center.z + f(3) * box.size.z,
  }
}

/**
 * A space that stands for the whole boat rather than a place on her: a root
 * named after the vessel ("Lucky Bird"), or a root with no place in its name
 * holding three or more spaces. It is not drawn, and what it holds is placed
 * as if it sat at the top.
 */
function isContainer(s: Space, kids: number, assetName: string | null): boolean {
  if (s.parent_id) return false
  if (assetName && nameWords(s.name) === nameWords(assetName)) return true
  return kids >= 3 && readName(s.name).t === null
}

export function placeSpaces(spaces: Space[], dims: HullDims, assetName: string | null = null): PlacedSpace[] {
  const live = spaces.filter((s) => !s.removed_at)
  const byId = new Map(live.map((s) => [s.id, s]))
  const kidCount = new Map<string, number>()
  for (const s of live) if (s.parent_id && byId.has(s.parent_id)) kidCount.set(s.parent_id, (kidCount.get(s.parent_id) ?? 0) + 1)
  const containers = new Set(live.filter((s) => isContainer(s, kidCount.get(s.id) ?? 0, assetName)).map((s) => s.id))

  // Where each space hangs. A child whose own name says where it is, under
  // a parent whose name does not, is placed by its own name: "Aft peak SB"
  // inside an unplaceable "Stores" would otherwise inherit a guess.
  const children = new Map<string | null, Space[]>()
  for (const s of live) {
    if (containers.has(s.id)) continue
    let parent = s.parent_id && byId.has(s.parent_id) && !containers.has(s.parent_id) ? s.parent_id : null
    if (parent && readName(byId.get(parent)!.name).t === null && readName(s.name).t !== null) parent = null
    children.set(parent, [...(children.get(parent) ?? []), s])
  }
  const out: PlacedSpace[] = []
  const length = dims.loa * 0.08

  // Top level: by name, nudged fore and aft when two land in the same slot;
  // the unreadable ones fill the gaps afterwards. A nudge never goes more
  // than three slots: past that, two boxes overlapping is closer to the truth
  // than a galley pushed into the forepeak.
  const top = [...(children.get(null) ?? [])].sort(
    (a, b) =>
      Number(readName(a.name).t === null) - Number(readName(b.name).t === null) ||
      a.name.localeCompare(b.name),
  )
  const taken: Array<{ t: number; side: number; level: Level }> = []
  const step = length / dims.loa
  const free = (t: number, side: number, level: Level) =>
    !taken.some((o) => o.level === level && Math.abs(o.t - t) < step * 0.95 && (o.side === side || o.side === 0 || side === 0))
  const guessSlots = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.45, 0.55, 0.35, 0.65]
  let guessIndex = 0
  // Spaces placed by hand claim their slots first, so guesses go round them.
  for (const s of top) {
    const box = storedBox(s.model_box)
    if (!box) continue
    taken.push({ t: clamp((box.center.x + dims.loa / 2) / dims.loa, 0, 1), side: Math.sign(box.center.z) as -1 | 0 | 1, level: 'interior' })
    out.push({ space: s, box, guessed: false, stored: true })
  }
  for (const s of top) {
    if (storedBox(s.model_box)) continue
    const hint = readName(s.name)
    // A mast space runs up the mast; its base or step sits on deck.
    const level: Level =
      hint.level === 'mast' && /\b(base|step|foot|heel)\b/.test(nameWords(s.name)) ? 'deck' : hint.level ?? 'interior'
    let t = hint.t
    const guessed = t === null
    if (t === null) t = guessSlots[guessIndex++ % guessSlots.length]
    const wanted = t
    for (let k = 1; !free(t, hint.side, level) && k <= 6; k++) {
      t = clamp(wanted + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step, 0.04, 0.94)
    }
    if (!free(t, hint.side, level)) t = wanted
    taken.push({ t, side: hint.side, level })
    out.push({ space: s, box: zoneBox(dims, t, hint.side, level, length * 0.95), guessed, stored: false })
  }

  // Inside a space: sided children split it across, the rest share it along.
  const placeChildren = (parent: PlacedSpace, depth: number) => {
    const kids = [...(children.get(parent.space.id) ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    if (!kids.length || depth > 6) return
    const unsided = kids.filter((k) => readName(k.name).side === 0)
    kids.forEach((k) => {
      const hint = readName(k.name)
      const side = hint.side
      const b = parent.box
      let box: Box
      if (side !== 0) {
        box = {
          center: { ...b.center, z: b.center.z + side * b.size.z * 0.25 },
          size: { x: b.size.x * 0.9, y: b.size.y * 0.9, z: b.size.z * 0.45 },
        }
      } else {
        const n = unsided.length
        const i = unsided.indexOf(k)
        const seg = b.size.x / n
        box = {
          center: { ...b.center, x: b.center.x - b.size.x / 2 + seg * (i + 0.5) },
          size: { x: seg * 0.9, y: b.size.y * 0.9, z: b.size.z * 0.9 },
        }
      }
      // "Under bed PS" sits in the bottom half of its cabin.
      if (hint.level === 'low' && parent.box.size.y > 0.6) {
        box = {
          center: { ...box.center, y: b.center.y - b.size.y / 4 },
          size: { ...box.size, y: b.size.y / 2 * 0.9 },
        }
      }
      const own = storedBox(k.model_box)
      const placed: PlacedSpace = own
        ? { space: k, box: own, guessed: false, stored: true }
        : { space: k, box, guessed: parent.guessed, stored: false }
      out.push(placed)
      placeChildren(placed, depth + 1)
    })
  }
  for (const p of [...out]) placeChildren(p, 1)
  return out
}

export function placeParts(
  parts: Part[],
  spaces: PlacedSpace[],
  dims: HullDims,
  connections: PartConnection[] = [],
): PlacedPart[] {
  const boxes = new Map(spaces.map((s) => [s.space.id, s.box]))
  const byId = new Map(parts.map((p) => [p.id, p]))
  const out: PlacedPart[] = []
  // Parts whose names say nothing about where they are, to try again by
  // what they connect to once the rest are placed.
  const clueless = new Set<string>()
  for (const part of parts) {
    if (part.removed_at) continue
    // Where someone put it, else its own space, else the nearest ancestor's,
    // else what the names along its path say ("Port primary winch" under
    // "Deck & fittings").
    const pinned = storedPosition(part.model_position)
    if (pinned) {
      out.push({ part, position: pinned, source: 'stored' })
      continue
    }
    let box = part.space_id ? boxes.get(part.space_id) : undefined
    let source: PlacedPart['source'] = 'space'
    const chain: Part[] = []
    let cur: Part | undefined = part
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.push(cur)
      if (!box && cur !== part && cur.space_id && boxes.has(cur.space_id)) {
        box = boxes.get(cur.space_id)
        source = 'ancestor'
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    if (!box) {
      source = 'name'
      let t: number | null = null
      let side: -1 | 0 | 1 = 0
      let level: Level | null = null
      for (const p of chain) {
        const h = readName(`${p.name} ${p.location ?? ''}`)
        t ??= h.t
        if (side === 0) side = h.side
        level ??= h.level
      }
      if (t === null) clueless.add(part.id)
      // Parts with nothing to go on gather amidships, low in the boat.
      box = zoneBox(dims, t ?? 0.5, side, level ?? 'interior', dims.loa * 0.12)
    }
    out.push({ part, position: insideBox(box, part.id), source })
  }

  // A breaker with no space but wired to the switchboard sits by the
  // switchboard: put each clueless part at the middle of the placed parts it
  // connects to, a little apart. A few rounds, so a chain of them follows.
  const placed = new Map(out.map((p) => [p.part.id, p]))
  const neighbours = new Map<string, string[]>()
  for (const c of connections) {
    if (c.removed_at) continue
    neighbours.set(c.from_part_id, [...(neighbours.get(c.from_part_id) ?? []), c.to_part_id])
    neighbours.set(c.to_part_id, [...(neighbours.get(c.to_part_id) ?? []), c.from_part_id])
  }
  for (let round = 0; round < 4 && clueless.size; round++) {
    const settled: Array<[string, Vec3]> = []
    for (const id of clueless) {
      const anchors = (neighbours.get(id) ?? [])
        .map((n) => placed.get(n))
        .filter((p): p is PlacedPart => !!p && !clueless.has(p.part.id))
      if (!anchors.length) continue
      const mid = anchors.reduce((a, p) => ({ x: a.x + p.position.x, y: a.y + p.position.y, z: a.z + p.position.z }), { x: 0, y: 0, z: 0 })
      const j = (salt: number) => (hash01(id, salt) - 0.5) * 0.5
      settled.push([id, { x: mid.x / anchors.length + j(4), y: mid.y / anchors.length + j(5), z: mid.z / anchors.length + j(6) }])
    }
    if (!settled.length) break
    for (const [id, position] of settled) {
      placed.get(id)!.position = position
      placed.get(id)!.source = 'connection'
      clueless.delete(id)
    }
  }
  return out
}

export function buildVesselModel(
  vessel: Pick<Vessel, 'loa' | 'beam' | 'draft' | 'vessel_type' | 'name'> | null,
  parts: Part[],
  spaces: Space[],
  connections: PartConnection[],
): VesselModel {
  const dims = hullDims(vessel, parts)
  const placedSpaces = placeSpaces(spaces, dims, vessel?.name ?? null)
  const placedParts = placeParts(parts, placedSpaces, dims, connections)
  // A system or assembly is drawn only when something connects to it; its
  // components already show where it is, and a marker for "Electrical"
  // floating amidships would point at nothing.
  const live = connections.filter((c) => !c.removed_at)
  const connected = new Set(live.flatMap((c) => [c.from_part_id, c.to_part_id]))
  const parents = new Set(parts.filter((p) => !p.removed_at && p.parent_id).map((p) => p.parent_id!))
  const drawn = placedParts.filter((p) => !parents.has(p.part.id) || connected.has(p.part.id))
  const visible = new Set(drawn.map((p) => p.part.id))
  return {
    dims,
    spaces: placedSpaces,
    parts: drawn,
    connections: live.filter((c) => visible.has(c.from_part_id) && visible.has(c.to_part_id)),
  }
}

/** One colour per kind of connection, shared by the 3D view and its legend. */
export const CONNECTION_COLOURS: Record<string, string> = {
  POWERS: '#f59e0b',
  PROTECTS: '#ef4444',
  CONTROLS: '#8b5cf6',
  SIGNALS: '#0ea5e9',
  FLOWS_TO: '#14b8a6',
  CONNECTED: '#94a3b8',
}

/** Distinct, legible on light and dark, for colouring parts by system. */
export const SYSTEM_PALETTE = [
  '#2563eb', '#16a34a', '#db2777', '#ea580c', '#7c3aed', '#0891b2',
  '#ca8a04', '#dc2626', '#4f46e5', '#059669', '#c026d3', '#65a30d',
]
