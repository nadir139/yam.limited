import type { Part, PartLink } from './types'

// The parts tree, as the pages need it.
//
// Parts are stored flat with a parent id (migration 027); every view wants the
// tree, the path to a part ("Deck › Winches › Port primary") and the system it
// belongs to. One place for that, so the Parts page, the chips on a work
// package and the Gantt's grouping all name a part the same way.

export interface PartNode {
  part: Part
  children: PartNode[]
  depth: number
}

export const PATH_SEPARATOR = ' › '

/** The tree of parts, children sorted by name. Removed parts only when asked. */
export function buildPartTree(parts: Part[], includeRemoved = false): PartNode[] {
  const visible = parts.filter((p) => includeRemoved || !p.removed_at)
  const ids = new Set(visible.map((p) => p.id))
  const byParent = new Map<string | null, Part[]>()
  for (const p of visible) {
    // A part whose parent is hidden (removed) shows at the top rather than vanishing.
    const parent = p.parent_id && ids.has(p.parent_id) ? p.parent_id : null
    byParent.set(parent, [...(byParent.get(parent) ?? []), p])
  }
  const build = (parentId: string | null, depth: number, seen: Set<string>): PartNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => !seen.has(p.id))
      .map((p) => {
        const next = new Set(seen).add(p.id)
        return { part: p, depth, children: build(p.id, depth + 1, next) }
      })
  return build(null, 0, new Set())
}

/** Depth-first list of the tree, for selects and searches. */
export function flattenTree(nodes: PartNode[]): PartNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

/** The chain from the top of the tree down to this part. */
export function partAncestry(part: Part, byId: Map<string, Part>): Part[] {
  const chain: Part[] = [part]
  const seen = new Set([part.id])
  let current = part
  while (current.parent_id && byId.has(current.parent_id) && !seen.has(current.parent_id)) {
    current = byId.get(current.parent_id)!
    seen.add(current.id)
    chain.unshift(current)
  }
  return chain
}

export function partPath(part: Part, byId: Map<string, Part>): string {
  return partAncestry(part, byId)
    .map((p) => p.name)
    .join(PATH_SEPARATOR)
}

/** The top-level system a part belongs to. */
export function partSystem(part: Part, byId: Map<string, Part>): Part {
  return partAncestry(part, byId)[0]
}

/** A part and everything under it. */
export function descendantIds(partId: string, parts: Part[]): Set<string> {
  const out = new Set([partId])
  let grew = true
  while (grew) {
    grew = false
    for (const p of parts) {
      if (p.parent_id && out.has(p.parent_id) && !out.has(p.id)) {
        out.add(p.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * Which system each work package is grouped under on the Gantt: the system of
 * the first part it is linked to, by name. A package linked to parts in two
 * systems appears once, under the first; the Parts page shows every link.
 */
export function workPackageSystems(
  parts: Part[],
  links: PartLink[],
): Record<string, { key: string; label: string }> {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const out: Record<string, { key: string; label: string }> = {}
  const candidates = new Map<string, Part[]>()
  for (const l of links) {
    if (l.object_type !== 'WORK_PACKAGE' || l.removed_at) continue
    const part = byId.get(l.part_id)
    if (!part) continue
    const system = partSystem(part, byId)
    candidates.set(l.object_id, [...(candidates.get(l.object_id) ?? []), system])
  }
  for (const [wpId, systems] of candidates) {
    const first = [...systems].sort((a, b) => a.name.localeCompare(b.name))[0]
    out[wpId] = { key: first.id, label: first.name }
  }
  return out
}

/** A starting tree for an empty asset, so nobody has to invent the top level. */
export const STARTER_SYSTEMS: Record<'boat' | 'property', { name: string; category: string }[]> = {
  boat: [
    { name: 'Hull & structure', category: 'HULL' },
    { name: 'Deck & fittings', category: 'STRUCTURAL' },
    { name: 'Rig & sails', category: 'RIGGING' },
    { name: 'Propulsion & machinery', category: 'MECHANICAL' },
    { name: 'Electrical', category: 'ELECTRICAL' },
    { name: 'Plumbing & tanks', category: 'MECHANICAL' },
    { name: 'Interior', category: 'INTERIOR' },
    { name: 'Safety equipment', category: 'SAFETY' },
  ],
  property: [
    { name: 'Structure', category: 'STRUCTURAL' },
    { name: 'Roof', category: 'STRUCTURAL' },
    { name: 'Façade & openings', category: 'STRUCTURAL' },
    { name: 'Electrical', category: 'ELECTRICAL' },
    { name: 'Plumbing', category: 'MECHANICAL' },
    { name: 'Heating & cooling', category: 'ENERGY' },
    { name: 'Interior', category: 'INTERIOR' },
    { name: 'Garden & grounds', category: 'LANDSCAPE' },
  ],
}
