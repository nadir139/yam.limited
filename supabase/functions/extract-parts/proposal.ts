// From what the drawings say to a proposal a person can review.
//
// Extraction runs in passes: one "map" over every document (what each page
// is, which systems and spaces the boat has), then one "parts" pass per small
// group of pages. Each pass sees only its pages, so the same pump turns up
// three times -- on its schematic, in the manual's text, and on the sheet that
// feeds it -- under slightly different names. This file turns those partial
// readings into one proposal: one entry per real thing, with every place it was
// seen, and the connections between them resolved to those entries.
//
// Like the schedule engine, it has no imports and no runtime-specific APIs: the
// edge function and the app share it (src/lib/proposal.ts re-exports it).

export const PART_KINDS = ['SYSTEM', 'ASSEMBLY', 'COMPONENT'] as const
export const CONNECTION_KINDS = ['POWERS', 'PROTECTS', 'CONTROLS', 'SIGNALS', 'FLOWS_TO', 'CONNECTED'] as const
export const PAGE_KINDS = ['TEXT', 'SCHEMATIC', 'SCHEMATIC_COPY', 'PHOTOS', 'INDEX', 'OTHER'] as const

export type PartKind = (typeof PART_KINDS)[number]
export type ConnectionKind = (typeof CONNECTION_KINDS)[number]
export type PageKind = (typeof PAGE_KINDS)[number]
export type Confidence = 'high' | 'medium' | 'low'

// ─── What the model returns ──────────────────────────────────────────────────

/** The map pass: what the document set is, before any part is read. */
export interface DocumentMap {
  vessel: { name: string | null; vessel_type: string | null; build_yard: string | null; year_built: string | null }
  pages: Array<{
    /** Index into the documents sent, in order. */
    doc: number
    page: number
    kind: PageKind
    sheet: string | null
    title: string | null
    revision: string | null
    system_key: string | null
  }>
  systems: Array<{ key: string; name: string; parent_key: string | null; category: string | null }>
  spaces: Array<{ key: string; name: string; parent_key: string | null }>
  notes: string[]
}

/** One parts pass over a few pages of one document. */
export interface ChunkResult {
  parts: Array<{
    id: string
    name: string
    kind: PartKind
    system_key: string | null
    parent_id: string | null
    space_key: string | null
    designation: string | null
    manufacturer: string | null
    model: string | null
    serial_number: string | null
    location: string | null
    safety_critical: boolean
    confidence: Confidence
    refs: Array<{ page: number; grid: string | null; bbox: number[] | null; note: string | null }>
  }>
  /**
   * `from` / `to` are a part id from this chunk, `@<designation>` for a part
   * named by its drawing tag, or `=><sheet>/<row>` for a cross-sheet reference
   * such as `=>11.1/21`.
   */
  connections: Array<{ from: string; to: string; kind: ConnectionKind; label: string | null; page: number | null }>
  new_spaces: Array<{ key: string; name: string; parent_key: string | null }>
}

export interface Chunk {
  documentId: string
  /** The sheet number per page, from the map, for resolving references. */
  sheets: Record<number, string | null>
  result: ChunkResult
}

// ─── What review edits and the database applies ─────────────────────────────

export interface ProposalRef {
  document_id: string
  page: number
  sheet: string | null
  grid: string | null
  bbox: number[] | null
  note: string | null
}

export interface ProposalPart {
  key: string
  name: string
  kind: PartKind | null
  category: string | null
  parent_key: string | null
  space_key: string | null
  designation: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  location: string | null
  notes: string | null
  safety_critical: boolean
  confidence: Confidence
  existing_id: string | null
  include: boolean
  refs: ProposalRef[]
  /** Other names the same thing was read as, kept so review can see a merge. */
  aliases: string[]
}

export interface ProposalSpace {
  key: string
  name: string
  parent_key: string | null
  existing_id: string | null
  include: boolean
}

export interface ProposalConnection {
  key: string
  from_key: string
  to_key: string
  kind: ConnectionKind
  label: string | null
  document_id: string | null
  page: number | null
  include: boolean
}

export interface Proposal {
  version: 1
  vessel: DocumentMap['vessel'] | null
  documents: Array<{
    document_id: string
    pages: Array<{ page: number; kind: PageKind; sheet: string | null; title: string | null; revision: string | null }>
  }>
  spaces: ProposalSpace[]
  parts: ProposalPart[]
  connections: ProposalConnection[]
  warnings: string[]
}

export interface ExistingAsset {
  parts: Array<{ id: string; name: string; parent_id: string | null; removed_at: string | null }>
  spaces: Array<{ id: string; name: string; parent_id: string | null; removed_at: string | null }>
}

// ─── Names ───────────────────────────────────────────────────────────────────

const SIDE_WORDS: Array<[RegExp, string]> = [
  [/\bport\s*side\b|\bportside\b|\bport\b/g, 'ps'],
  [/\bstarboard\b|\bstbd\b/g, 'sb'],
  [/\bengine\s*room\b/g, 'er'],
  [/\bforward\b|\bfwd\b|\bfore\b/g, 'fwd'],
]

/** A name reduced to what identifies it: case, punctuation and side wording folded. */
export function normaliseName(name: string): string {
  let n = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  // Slash abbreviations are one word: E/R is the engine room, not "e" and "r".
  n = n.replace(/\b([a-z])\s*\/\s*([a-z])\b/g, '$1$2')
  n = n.replace(/[()[\]{}.,;:'"!?]/g, ' ').replace(/[/\\_-]+/g, ' ')
  for (const [re, to] of SIDE_WORDS) n = n.replace(re, to)
  return n.replace(/\s+/g, ' ').trim()
}

function normaliseDesignation(d: string | null | undefined): string | null {
  if (!d) return null
  const n = d.toUpperCase().replace(/\s+/g, '')
  return n.length ? n : null
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

// ─── The merge ───────────────────────────────────────────────────────────────

export function buildProposal(input: {
  documentIds: string[]
  map: DocumentMap
  chunks: Chunk[]
  existing?: ExistingAsset
}): Proposal {
  const { documentIds, map, chunks } = input
  const warnings: string[] = []

  // Documents and their pages, as the map read them.
  const documents = documentIds.map((document_id, i) => ({
    document_id,
    pages: map.pages
      .filter((p) => p.doc === i)
      .sort((a, b) => a.page - b.page)
      .map((p) => ({ page: p.page, kind: p.kind, sheet: p.sheet, title: p.title, revision: p.revision })),
  }))

  // Spaces: the map's, plus any a parts pass found, folded by name.
  const spaces: ProposalSpace[] = []
  const spaceByKey = new Map<string, string>() // model key -> proposal key
  const spaceByName = new Map<string, string>() // normalised name -> proposal key
  const addSpace = (s: { key: string; name: string; parent_key: string | null }) => {
    if (!s.name?.trim()) return
    const norm = normaliseName(s.name)
    const existingKey = spaceByName.get(norm)
    if (existingKey) {
      spaceByKey.set(s.key, existingKey)
      return
    }
    const key = `space:${spaces.length + 1}`
    spaceByKey.set(s.key, key)
    spaceByName.set(norm, key)
    spaces.push({ key, name: s.name.trim(), parent_key: s.parent_key, existing_id: null, include: true })
  }
  for (const s of map.spaces) addSpace(s)
  for (const c of chunks) for (const s of c.result.new_spaces) addSpace(s)
  for (const s of spaces) {
    s.parent_key = s.parent_key ? spaceByKey.get(s.parent_key) ?? null : null
    if (s.parent_key === s.key) s.parent_key = null
  }

  // Systems become the top of the parts tree.
  const parts: ProposalPart[] = []
  const systemKey = new Map<string, string>() // model system key -> proposal key
  for (const sys of map.systems) {
    if (!sys.name?.trim()) continue
    const key = `system:${sys.key}`
    systemKey.set(sys.key, key)
    parts.push(blankPart(key, sys.name.trim(), 'SYSTEM', sys.category))
  }
  for (const sys of map.systems) {
    const part = parts.find((p) => p.key === systemKey.get(sys.key))
    if (part && sys.parent_key && systemKey.has(sys.parent_key) && systemKey.get(sys.parent_key) !== part.key) {
      part.parent_key = systemKey.get(sys.parent_key)!
    }
  }
  const systemCategory = new Map(map.systems.map((s) => [s.key, s.category]))

  // Components from every chunk, folded into one entry per real thing:
  // the same drawing tag is the same thing; so is the same name in the same system.
  const byDesignation = new Map<string, ProposalPart>()
  const byNameInSystem = new Map<string, ProposalPart>()
  const localToKey = new Map<string, string>() // `${chunk}:${localId}` -> proposal key
  const pendingParents: Array<{ part: ProposalPart; chunk: number; parentId: string }> = []

  chunks.forEach((chunk, ci) => {
    for (const p of chunk.result.parts) {
      if (!p.name?.trim()) continue
      if (p.kind === 'SYSTEM' && p.system_key && systemKey.has(p.system_key)) {
        // A pass re-reading a system the map already has.
        localToKey.set(`${ci}:${p.id}`, systemKey.get(p.system_key)!)
        continue
      }
      const designation = normaliseDesignation(p.designation)
      const nameKey = `${p.system_key ?? ''}|${normaliseName(p.name)}`
      const found = (designation && byDesignation.get(designation)) || byNameInSystem.get(nameKey)

      const refs: ProposalRef[] = p.refs
        .filter((r) => Number.isInteger(r.page) && r.page >= 1)
        .map((r) => ({
          document_id: chunk.documentId,
          page: r.page,
          sheet: chunk.sheets[r.page] ?? null,
          grid: r.grid?.trim() || null,
          bbox: validBox(r.bbox),
          note: r.note?.trim() || null,
        }))

      if (found) {
        mergeInto(found, p, refs)
        localToKey.set(`${ci}:${p.id}`, found.key)
        if (designation) byDesignation.set(designation, found)
        byNameInSystem.set(nameKey, found)
        continue
      }

      const part = blankPart(`part:${parts.length + 1}`, p.name.trim(), p.kind ?? 'COMPONENT',
        p.system_key ? systemCategory.get(p.system_key) ?? null : null)
      part.designation = p.designation?.trim() || null
      part.manufacturer = p.manufacturer?.trim() || null
      part.model = p.model?.trim() || null
      part.serial_number = p.serial_number?.trim() || null
      part.location = p.location?.trim() || null
      part.safety_critical = Boolean(p.safety_critical)
      part.confidence = p.confidence ?? 'medium'
      part.space_key = p.space_key ? spaceByKey.get(p.space_key) ?? null : null
      part.parent_key = p.system_key ? systemKey.get(p.system_key) ?? null : null
      part.refs = dedupeRefs(refs)
      parts.push(part)
      localToKey.set(`${ci}:${p.id}`, part.key)
      if (designation) byDesignation.set(designation, part)
      byNameInSystem.set(nameKey, part)
      if (p.parent_id) pendingParents.push({ part, chunk: ci, parentId: p.parent_id })
    }
  })

  // A parent named inside the same chunk beats the system it falls under.
  for (const { part, chunk, parentId } of pendingParents) {
    const parentKey = localToKey.get(`${chunk}:${parentId}`)
    if (parentKey && parentKey !== part.key && !isAncestor(parts, part.key, parentKey)) {
      part.parent_key = parentKey
    }
  }

  // Connections, resolved to the merged entries.
  const keyByDesignation = new Map<string, string>()
  for (const [d, p] of byDesignation) keyByDesignation.set(d, p.key)
  const connections: ProposalConnection[] = []
  const seen = new Set<string>()
  chunks.forEach((chunk, ci) => {
    for (const c of chunk.result.connections) {
      const from = resolveEndpoint(c.from, ci, localToKey, keyByDesignation, parts)
      const to = resolveEndpoint(c.to, ci, localToKey, keyByDesignation, parts)
      if (!from || !to) {
        warnings.push(
          `Could not place a ${c.kind.toLowerCase().replace('_', ' ')} link ${c.from} → ${c.to}` +
            (c.label ? ` (${c.label})` : '') + (c.page ? ` on page ${c.page}` : ''),
        )
        continue
      }
      if (from === to) continue
      const kind = (CONNECTION_KINDS as readonly string[]).includes(c.kind) ? c.kind : 'CONNECTED'
      const id = `${from}|${to}|${kind}`
      if (seen.has(id)) continue
      seen.add(id)
      connections.push({
        key: `conn:${connections.length + 1}`,
        from_key: from,
        to_key: to,
        kind,
        label: c.label?.trim() || null,
        document_id: chunk.documentId,
        page: c.page,
        include: true,
      })
    }
  })

  // What is already on the asset is reused rather than duplicated.
  if (input.existing) matchExisting(parts, spaces, input.existing)

  const low = parts.filter((p) => p.confidence === 'low').length
  if (low) {
    warnings.unshift(
      low === 1
        ? '1 part was read with low confidence; check it before applying.'
        : `${low} parts were read with low confidence; check them before applying.`,
    )
  }

  return {
    version: 1,
    vessel: map.vessel?.name ? map.vessel : null,
    documents,
    spaces,
    parts,
    connections,
    warnings,
  }
}

function blankPart(key: string, name: string, kind: PartKind, category: string | null): ProposalPart {
  return {
    key,
    name,
    kind,
    category,
    parent_key: null,
    space_key: null,
    designation: null,
    manufacturer: null,
    model: null,
    serial_number: null,
    location: null,
    notes: null,
    safety_critical: false,
    confidence: 'high',
    existing_id: null,
    include: true,
    refs: [],
    aliases: [],
  }
}

function mergeInto(target: ProposalPart, p: ChunkResult['parts'][number], refs: ProposalRef[]) {
  if (p.name.trim() !== target.name && !target.aliases.includes(p.name.trim())) target.aliases.push(p.name.trim())
  target.designation ??= p.designation?.trim() || null
  target.manufacturer ??= p.manufacturer?.trim() || null
  target.model ??= p.model?.trim() || null
  target.serial_number ??= p.serial_number?.trim() || null
  target.location ??= p.location?.trim() || null
  target.safety_critical ||= Boolean(p.safety_critical)
  if (CONFIDENCE_RANK[p.confidence ?? 'medium'] > CONFIDENCE_RANK[target.confidence]) target.confidence = p.confidence
  target.refs = dedupeRefs([...target.refs, ...refs])
}

function dedupeRefs(refs: ProposalRef[]): ProposalRef[] {
  const out = new Map<string, ProposalRef>()
  for (const r of refs) {
    const k = `${r.document_id}|${r.page}|${r.grid ?? ''}`
    const prev = out.get(k)
    if (!prev || (!prev.bbox && r.bbox)) out.set(k, r)
  }
  return [...out.values()]
}

function validBox(b: number[] | null | undefined): number[] | null {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const [x0, y0, x1, y1] = b.map((n) => Math.min(Math.max(n, 0), 1))
  if (x1 <= x0 || y1 <= y0) return null
  return [x0, y0, x1, y1]
}

function isAncestor(parts: ProposalPart[], ancestorKey: string, of: string): boolean {
  const byKey = new Map(parts.map((p) => [p.key, p]))
  let current = byKey.get(of)
  const seen = new Set<string>()
  while (current?.parent_key && !seen.has(current.key)) {
    if (current.parent_key === ancestorKey) return true
    seen.add(current.key)
    current = byKey.get(current.parent_key)
  }
  return false
}

/**
 * A connection end is a part id from the same chunk, `@<designation>`, or a
 * cross-sheet reference `=><sheet>/<row>`: the part drawn on that sheet whose
 * grid cell is in that row, or whose designation is that sheet and row
 * (11.1/21 is breaker 11.1Q21).
 */
function resolveEndpoint(
  token: string,
  chunk: number,
  localToKey: Map<string, string>,
  byDesignation: Map<string, string>,
  parts: ProposalPart[],
): string | null {
  const t = token.trim()
  if (t.startsWith('@')) return byDesignation.get(normaliseDesignation(t.slice(1)) ?? '') ?? null
  const cross = /^=>\s*([\d.]+)\s*\/\s*(\d+)$/.exec(t)
  if (cross) {
    const [, sheet, row] = cross
    const tag = new RegExp(`^${sheet.replace('.', '\\.')}[A-Z]+0*${row}$`)
    for (const [d, key] of byDesignation) if (tag.test(d)) return key
    const onRow = parts.find((p) =>
      p.refs.some((r) => r.sheet === sheet && r.grid !== null && new RegExp(`(^|[^0-9])0*${row}$`).test(r.grid.replace(/\s+/g, ''))),
    )
    return onRow?.key ?? null
  }
  return localToKey.get(`${chunk}:${t}`) ?? null
}

function matchExisting(parts: ProposalPart[], spaces: ProposalSpace[], existing: ExistingAsset) {
  const liveParts = existing.parts.filter((p) => !p.removed_at)
  const nameOf = new Map(liveParts.map((p) => [p.id, normaliseName(p.name)]))
  const byKey = new Map(parts.map((p) => [p.key, p]))
  for (const p of parts) {
    const n = normaliseName(p.name)
    const parentName = p.parent_key ? normaliseName(byKey.get(p.parent_key)?.name ?? '') : null
    const hit = liveParts.find((e) => {
      if (normaliseName(e.name) !== n) return false
      const eParent = e.parent_id ? nameOf.get(e.parent_id) ?? null : null
      return eParent === parentName || (p.kind === 'SYSTEM' && !e.parent_id)
    })
    if (hit) p.existing_id = hit.id
  }
  const liveSpaces = existing.spaces.filter((s) => !s.removed_at)
  for (const s of spaces) {
    const hit = liveSpaces.find((e) => normaliseName(e.name) === normaliseName(s.name))
    if (hit) s.existing_id = hit.id
  }
}

// ─── Planning the passes ─────────────────────────────────────────────────────

export interface ChunkPlan {
  documentIndex: number
  pages: number[]
}

/**
 * Which pages to read for parts, and in what groups. Copies of a sheet that is
 * also in the set (a manual embedding the schematics) are read once, from the
 * sheet itself; pure photo pages and indexes are skipped. Dense drawings go
 * two to a pass, prose four, so no single pass runs long.
 */
export function planChunks(map: DocumentMap, documentCount: number): ChunkPlan[] {
  const plans: ChunkPlan[] = []
  for (let d = 0; d < documentCount; d++) {
    const pages = map.pages
      .filter((p) => p.doc === d && (p.kind === 'TEXT' || p.kind === 'SCHEMATIC'))
      .sort((a, b) => a.page - b.page)
    let group: number[] = []
    let groupKind: PageKind | null = null
    const flush = () => {
      if (group.length) plans.push({ documentIndex: d, pages: group })
      group = []
      groupKind = null
    }
    for (const p of pages) {
      const limit = p.kind === 'SCHEMATIC' ? 2 : 4
      const contiguous = group.length === 0 || p.page === group[group.length - 1] + 1
      if (!contiguous || (groupKind !== null && groupKind !== p.kind) || group.length >= limit) flush()
      group.push(p.page)
      groupKind = p.kind
    }
    flush()
  }
  return plans
}
