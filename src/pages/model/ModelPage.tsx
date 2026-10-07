import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Box, FileUp, Network, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ObjectGraph from '@/components/ontology/ObjectGraph'
import type { SceneOptions } from '@/components/model/VesselScene'
import {
  useApprovals,
  useChangeOrders,
  useDefects,
  useDocuments,
  useInspections,
  usePartConnections,
  usePartLinks,
  useParts,
  useProject,
  useSpaces,
  useTeam,
  useVessel,
  useWorkPackages,
} from '@/lib/query-hooks'
import { FALLBACK_ONTOLOGY, fetchOntology } from '@/lib/ontology'
import { buildPartTree, descendantIds, partPath, partSystem } from '@/lib/parts'
import {
  CONNECTION_COLOURS,
  SYSTEM_PALETTE,
  buildVesselModel,
  type PlacedPart,
} from '@/lib/vessel-model'
import type { Part } from '@/lib/types'

// YAManagement: the project as one model. The object graph says what kinds of
// thing exist and how they relate; the vessel view puts the physical ones --
// spaces, systems, parts and what connects them -- where they sit on the boat.

const VesselScene = lazy(() => import('@/components/model/VesselScene'))

const muted = { color: 'hsl(var(--muted-foreground))' }

const STATUS_COLOURS = { ncr: '#dc2626', wp: '#d97706', clear: '#16a34a' }

const CONNECTION_NAMES: Record<string, [string, string]> = {
  POWERS: ['powers', 'powered by'],
  PROTECTS: ['protects', 'protected by'],
  CONTROLS: ['controls', 'controlled by'],
  SIGNALS: ['signals', 'signalled by'],
  FLOWS_TO: ['flows into', 'fed from'],
  CONNECTED: ['connected to', 'connected to'],
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide" style={muted}>
          {title}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[hsl(var(--accent))]" />
      {children}
    </label>
  )
}

// ─── Vessel view ─────────────────────────────────────────────────────────────

function VesselView({ onOpenGraph }: { onOpenGraph: () => void }) {
  const { data: project } = useProject()
  const { data: vessel } = useVessel()
  const { data: parts = [], isLoading } = useParts()
  const { data: spaces = [] } = useSpaces()
  const { data: connections = [] } = usePartConnections()
  const { data: links = [] } = usePartLinks()
  const { data: defects = [] } = useDefects()
  const { data: wps = [] } = useWorkPackages()
  const [params, setParams] = useSearchParams()
  const systemId = params.get('system')
  const selectedPartId = params.get('part')
  const [colourBy, setColourBy] = useState<'system' | 'status'>('system')
  const [options, setOptions] = useState<SceneOptions>({ showHull: true, showSpaces: true, showConnections: true })

  const setParam = (key: string, value: string | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })

  const model = useMemo(() => buildVesselModel(vessel ?? null, parts, spaces, connections), [vessel, parts, spaces, connections])
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const systems = useMemo(() => buildPartTree(parts).map((n) => n.part), [parts])
  const systemColour = useMemo(
    () => new Map(systems.map((s, i) => [s.id, SYSTEM_PALETTE[i % SYSTEM_PALETTE.length]])),
    [systems],
  )
  const focus = useMemo(() => (systemId ? descendantIds(systemId, parts) : null), [systemId, parts])

  // What is open against each part: an NCR outranks a work package.
  const status = useMemo(() => {
    const openNcr = new Set(defects.filter((d) => d.status !== 'CLOSED').map((d) => d.id))
    const activeWp = new Set(wps.filter((w) => w.status === 'ACTIVE' || w.status === 'EXPANDED').map((w) => w.id))
    const out = new Map<string, 'ncr' | 'wp'>()
    for (const l of links) {
      if (l.removed_at) continue
      if (l.object_type === 'DEFECT_RECORD' && openNcr.has(l.object_id)) out.set(l.part_id, 'ncr')
      else if (l.object_type === 'WORK_PACKAGE' && activeWp.has(l.object_id) && out.get(l.part_id) !== 'ncr')
        out.set(l.part_id, 'wp')
    }
    return out
  }, [links, defects, wps])

  const colourOf = (p: PlacedPart) =>
    colourBy === 'status'
      ? STATUS_COLOURS[status.get(p.part.id) ?? 'clear']
      : systemColour.get(partSystem(p.part, byId).id) ?? SYSTEM_PALETTE[0]

  const isProperty = project?.project_type === 'PROPERTY'
  const selected = selectedPartId ? byId.get(selectedPartId) ?? null : null
  const placed = selected ? model.parts.find((p) => p.part.id === selected.id) : undefined
  const { dims } = model

  if (isProperty) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          The 3D view draws a hull, so it is for boats. This project is a property:{' '}
          <button className="font-medium underline" onClick={onOpenGraph}>
            open the object graph
          </button>{' '}
          instead.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
      {/* Left: what to look at */}
      <div className="space-y-3">
        <Panel title="Systems">
          <button
            onClick={() => setParam('system', null)}
            className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted ${!systemId ? 'bg-muted font-semibold' : ''}`}
          >
            The whole boat <span style={muted}>{model.parts.length}</span>
          </button>
          {systems.map((s) => {
            const count = descendantIds(s.id, parts).size
            return (
              <button
                key={s.id}
                onClick={() => setParam('system', systemId === s.id ? null : s.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted ${systemId === s.id ? 'bg-muted font-semibold' : ''}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: systemColour.get(s.id) }} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span style={muted}>{count}</span>
              </button>
            )
          })}
          {!systems.length && !isLoading && (
            <p className="text-sm" style={muted}>
              No parts recorded yet.
            </p>
          )}
        </Panel>
        <Panel title="Colour parts by">
          <div className="flex gap-1">
            {(['system', 'status'] as const).map((c) => (
              <Button key={c} size="sm" variant={colourBy === c ? 'default' : 'outline'} onClick={() => setColourBy(c)} className="flex-1 capitalize">
                {c}
              </Button>
            ))}
          </div>
          {colourBy === 'status' && (
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOURS.ncr }} /> Open NCR</div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOURS.wp }} /> Work in progress</div>
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOURS.clear }} /> Nothing open</div>
            </div>
          )}
        </Panel>
        <Panel title="Layers">
          <Toggle checked={options.showHull} onChange={(v) => setOptions((o) => ({ ...o, showHull: v }))}>Hull</Toggle>
          <Toggle checked={options.showSpaces} onChange={(v) => setOptions((o) => ({ ...o, showSpaces: v }))}>Spaces ({model.spaces.length})</Toggle>
          <Toggle checked={options.showConnections} onChange={(v) => setOptions((o) => ({ ...o, showConnections: v }))}>Connections ({model.connections.length})</Toggle>
          <div className="space-y-1 pt-1 text-xs">
            {Object.entries(CONNECTION_COLOURS).map(([k, c]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="h-0.5 w-4" style={{ background: c }} /> {CONNECTION_NAMES[k]?.[0] ?? k.toLowerCase()}
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Centre: the boat */}
      <div className="space-y-2">
        <div className="relative h-[460px] overflow-hidden rounded-lg border bg-muted/20 sm:h-[620px]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm" style={muted}>Loading the 3D view…</div>}>
            <VesselScene
              model={model}
              focus={focus}
              selectedPartId={selectedPartId}
              colourOf={colourOf}
              options={options}
              onSelectPart={(id) => setParam('part', id)}
            />
          </Suspense>
          <div className="pointer-events-none absolute left-3 top-3 rounded bg-background/80 px-2 py-1 text-xs" style={muted}>
            Drag to orbit · scroll to zoom · right-drag to pan · click a part
          </div>
        </div>
        <p className="text-xs" style={muted}>
          Hull drawn from LOA {dims.loa} m, beam {dims.beam} m, draft {dims.draft} m
          {dims.assumed && (
            <>
              {' '}
              (some assumed —{' '}
              <Link to="/app/project" className="underline">record her dimensions</Link>)
            </>
          )}
          . Spaces and parts are placed from their names; a space marked “?” had nothing to go on.
          A 3D scan of the boat can replace this hull once it is loaded.
        </p>
      </div>

      {/* Right: the selection */}
      <div className="space-y-3">
        {selected ? (
          partPanel(selected, placed, byId, (id) => setParam('part', id))
        ) : (
          <Panel title="Selection">
            <p className="text-sm" style={muted}>
              Click a part on the boat to see what it is, where it sits and what it is connected to.
              Pick a system on the left to light up its parts and their connections.
            </p>
            {!parts.length && !isLoading && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/parts/import"><FileUp size={14} className="mr-1" /> Import parts from documents</Link>
              </Button>
            )}
          </Panel>
        )}
      </div>
    </div>
  )

  // A render helper rather than a component, so it can read the view's data
  // without being remounted on every render.
  function partPanel(part: Part, placed: PlacedPart | undefined, byId: Map<string, Part>, onSelect: (id: string) => void) {
    const space = spaces.find((s) => s.id === part.space_id)
    const ups = connections.filter((c) => !c.removed_at && c.to_part_id === part.id)
    const downs = connections.filter((c) => !c.removed_at && c.from_part_id === part.id)
    const openNcrs = defects.filter(
      (d) => d.status !== 'CLOSED' && links.some((l) => !l.removed_at && l.part_id === part.id && l.object_type === 'DEFECT_RECORD' && l.object_id === d.id),
    )
    const st = status.get(part.id)
    const row = (c: (typeof connections)[number], other: string, dir: 0 | 1) => {
      const o = byId.get(other)
      return (
        <li key={c.id} className="flex items-center gap-2 text-sm">
          <span className="h-0.5 w-3 shrink-0" style={{ background: CONNECTION_COLOURS[c.kind] }} />
          <span style={muted}>{CONNECTION_NAMES[c.kind]?.[dir] ?? c.kind.toLowerCase()}</span>
          <button className="min-w-0 truncate font-medium hover:underline" onClick={() => onSelect(other)}>
            {o?.name ?? 'a removed part'}
          </button>
          {c.label && <span className="truncate text-xs" style={muted}>{c.label}</span>}
        </li>
      )
    }
    return (
      <Panel title={part.kind ? part.kind.toLowerCase() : 'Part'}>
        <div>
          <div className="text-base font-semibold">
            {part.designation && <span className="mr-1 font-mono text-sm" style={muted}>{part.designation}</span>}
            {part.name}
          </div>
          <div className="text-xs" style={muted}>{partPath(part, byId)}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {part.safety_critical && (
            <Badge variant="destructive" className="gap-1"><ShieldAlert size={11} /> Safety critical</Badge>
          )}
          {st === 'ncr' && <Badge variant="destructive">{openNcrs.length} open NCR{openNcrs.length === 1 ? '' : 's'}</Badge>}
          {st === 'wp' && <Badge variant="secondary">Work in progress</Badge>}
        </div>
        <dl className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 text-sm">
          <dt style={muted}>Space</dt>
          <dd>{space?.name ?? '—'}</dd>
          {(part.manufacturer || part.model) && (
            <>
              <dt style={muted}>Make</dt>
              <dd>{[part.manufacturer, part.model].filter(Boolean).join(' ')}</dd>
            </>
          )}
          {part.serial_number && (
            <>
              <dt style={muted}>Serial</dt>
              <dd className="font-mono text-xs">{part.serial_number}</dd>
            </>
          )}
          <dt style={muted}>Placed</dt>
          <dd className="text-xs">
            {placed?.source === 'space'
              ? 'in its space'
              : placed?.source === 'ancestor'
              ? 'in the space of the system above it'
              : placed?.source === 'connection'
              ? 'beside what it is connected to'
              : 'from its name (approximate)'}
          </dd>
        </dl>
        {(ups.length > 0 || downs.length > 0) && (
          <ul className="space-y-1 border-t pt-2">
            {ups.map((c) => row(c, c.from_part_id, 1))}
            {downs.map((c) => row(c, c.to_part_id, 0))}
          </ul>
        )}
        {openNcrs.length > 0 && (
          <ul className="space-y-1 border-t pt-2 text-sm">
            {openNcrs.map((d) => (
              <li key={d.id}>
                <Link to={`/app/defects/${d.id}`} className="hover:underline" style={{ color: 'hsl(var(--destructive))' }}>
                  {d.ncr_number} · {d.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" asChild className="w-full">
          <Link to={`/app/parts?part=${part.id}`}>Open in Parts <ArrowRight size={13} className="ml-1" /></Link>
        </Button>
      </Panel>
    )
  }
}

// ─── Object graph ────────────────────────────────────────────────────────────

interface Instance {
  id: string
  label: string
  href: string
  part?: boolean
}

function GraphView({ onShowPart }: { onShowPart: (id: string) => void }) {
  const { data: snapshot = FALLBACK_ONTOLOGY } = useQuery({ queryKey: ['ontology'], queryFn: fetchOntology, staleTime: 5 * 60_000 })
  const { data: project } = useProject()
  const { data: vessel } = useVessel()
  const { data: wps = [] } = useWorkPackages()
  const { data: inspections = [] } = useInspections()
  const { data: defects = [] } = useDefects()
  const { data: cos = [] } = useChangeOrders()
  const { data: approvals = [] } = useApprovals()
  const { data: documents = [] } = useDocuments()
  const { data: team = [] } = useTeam()
  const { data: parts = [] } = useParts()
  const { data: spaces = [] } = useSpaces()
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)

  // The records behind each type, for this project. Types the app does not
  // list here (messages, action items) keep their table name on the node.
  const instances = useMemo<Record<string, Instance[]>>(() => {
    const liveParts = parts.filter((p) => !p.removed_at)
    return {
      PROJECT: project ? [{ id: project.id, label: project.name, href: '/app/project' }] : [],
      VESSEL: vessel ? [{ id: vessel.id, label: vessel.name, href: '/app/project' }] : [],
      WORK_PACKAGE: wps.map((w) => ({ id: w.id, label: `${w.wp_number} · ${w.title}`, href: `/app/work-packages/${w.id}` })),
      INSPECTION_EVENT: inspections.map((i) => ({ id: i.id, label: `${i.inspection_number} · ${i.title}`, href: '/app/inspections' })),
      DEFECT_RECORD: defects.map((d) => ({ id: d.id, label: `${d.ncr_number} · ${d.title}`, href: `/app/defects/${d.id}` })),
      CHANGE_ORDER: cos.map((c) => ({ id: c.id, label: `${c.co_number} · ${c.title}`, href: `/app/change-orders/${c.id}` })),
      OWNER_APPROVAL: approvals.map((a) => ({ id: a.id, label: `${a.approval_number} · ${a.title}`, href: '/app/approvals' })),
      DOCUMENT: documents.map((d) => ({ id: d.id, label: `${d.doc_number} · ${d.title}`, href: '/app/documents' })),
      PROJECT_MEMBER: team.map((m) => ({ id: m.id, label: `${m.name} · ${m.role}`, href: '/app/team' })),
      PART: liveParts.map((p) => ({ id: p.id, label: p.name, href: `/app/parts?part=${p.id}`, part: true })),
      SPACE: spaces.filter((s) => !s.removed_at).map((s) => ({ id: s.id, label: s.name, href: '/app/parts' })),
    }
  }, [project, vessel, wps, inspections, defects, cos, approvals, documents, team, parts, spaces])

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(instances).map(([k, v]) => [k, v.length])),
    [instances],
  )
  const selected = pinned ?? hovered
  const type = snapshot.types.find((t) => t.key === pinned)
  const list = pinned ? instances[pinned] : undefined

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardContent className="p-3">
          <ObjectGraph
            types={snapshot.types}
            links={snapshot.links}
            selected={selected}
            pinned={pinned}
            onHover={setHovered}
            onPin={setPinned}
            counts={counts}
          />
        </CardContent>
      </Card>
      <Panel title={type ? type.label : 'Object graph'}>
        {!type ? (
          <p className="text-sm" style={muted}>
            Every kind of thing this project holds and how each relates to the others, with the
            number of records of each. Click a type to list them.
          </p>
        ) : (
          <>
            <p className="text-xs" style={muted}>{type.description}</p>
            {list === undefined ? (
              <p className="text-sm" style={muted}>Listed on its own page.</p>
            ) : list.length === 0 ? (
              <p className="text-sm" style={muted}>None on this project yet.</p>
            ) : (
              <ul className="max-h-[520px] space-y-1 overflow-y-auto">
                {list.slice(0, 200).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <Link to={i.href} className="min-w-0 flex-1 truncate hover:underline">{i.label}</Link>
                    {i.part && (
                      <button onClick={() => onShowPart(i.id)} title="Show on the boat" className="shrink-0 rounded p-0.5 hover:bg-muted">
                        <Box size={13} />
                      </button>
                    )}
                  </li>
                ))}
                {list.length > 200 && <li className="text-xs" style={muted}>and {list.length - 200} more</li>}
              </ul>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ModelPage() {
  const { data: project } = useProject()
  const [params, setParams] = useSearchParams()
  const tab = params.get('view') === 'graph' ? 'graph' : 'vessel'
  const setTab = (v: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (v === 'graph') next.set('view', 'graph')
      else next.delete('view')
      return next
    })
  const assetName = project?.project_type === 'PROPERTY' ? project?.name : project?.vessel?.name

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Box size={22} style={{ color: 'hsl(var(--accent))' }} />
          YAManagement{assetName ? ` · ${assetName}` : ''}
        </h1>
        <p className="mt-1 max-w-3xl text-sm" style={muted}>
          The project as one model: the boat in 3D with her spaces, systems and the connections between
          them, and the graph of every record the project holds.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="vessel" className="gap-1"><Box size={14} /> Vessel</TabsTrigger>
          <TabsTrigger value="graph" className="gap-1"><Network size={14} /> Object graph</TabsTrigger>
        </TabsList>
        <TabsContent value="vessel" className="mt-4">
          <VesselView onOpenGraph={() => setTab('graph')} />
        </TabsContent>
        <TabsContent value="graph" className="mt-4">
          <GraphView
            onShowPart={(id) =>
              setParams((p) => {
                const next = new URLSearchParams(p)
                next.delete('view')
                next.set('part', id)
                return next
              })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
