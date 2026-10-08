import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Box, ChevronRight, FileUp, Maximize2, Move, Network, PanelRightOpen, RotateCcw, Scaling, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import ObjectGraph from '@/components/ontology/ObjectGraph'
import type { CameraGoal, SceneOptions } from '@/components/model/VesselScene'
import { PartDetail, PartDialog } from '@/pages/parts/PartsPage'
import {
  useApprovals,
  useChangeOrders,
  useDefects,
  useDocuments,
  useInspections,
  usePartConnections,
  usePartLinks,
  useParts,
  usePermissions,
  usePlacePart,
  usePlaceSpace,
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
  boxToStored,
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

/** True while the media query matches; follows rotation and resizing. */
function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
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
  const selectedSpaceId = params.get('space')
  const { can } = usePermissions()
  const canPlace = can('action_place_space') && can('action_place_part')
  const [editing, setEditing] = useState(false)
  const [editMode, setEditMode] = useState<'move' | 'resize'>('move')
  const placeSpace = usePlaceSpace()
  const placePart = usePlacePart()
  // The full record of what is selected: a side sheet on a desktop, a sheet
  // from the bottom on a phone, where the panel beside the boat would sit
  // below the fold.
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [dialog, setDialog] = useState<{ editing: Part | null; parentId: string } | null>(null)
  const [fitKey, setFitKey] = useState(0)
  const narrow = useMedia('(max-width: 1023px)')
  const phone = useMedia('(max-width: 767px)')
  const failed = (what: string) => (e: unknown) =>
    toast.error(`Could not ${what}: ${e instanceof Error ? e.message : String(e)}`)

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
  const selectedSpace = selectedSpaceId ? model.spaces.find((p) => p.space.id === selectedSpaceId) ?? null : null
  const { dims } = model
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  // A picked space lights up what is in it, its sub-spaces included.
  const spaceFocus = useMemo(() => {
    if (!selectedSpaceId) return null
    const inside = new Set([selectedSpaceId])
    for (let grew = true; grew; ) {
      grew = false
      for (const sp of spaces) {
        if (sp.parent_id && inside.has(sp.parent_id) && !inside.has(sp.id) && !sp.removed_at) {
          inside.add(sp.id)
          grew = true
        }
      }
    }
    return new Set(parts.filter((p) => p.space_id && inside.has(p.space_id)).map((p) => p.id))
  }, [selectedSpaceId, spaces, parts])

  // Where the camera goes when something is picked: close enough to read it.
  const goal = useMemo<CameraGoal | null>(() => {
    if (placed) return { key: `p:${placed.part.id}`, target: placed.position, distance: Math.max(3.5, dims.loa * 0.3) }
    if (selectedSpace) {
      const b = selectedSpace.box
      return { key: `s:${selectedSpace.space.id}`, target: b.center, distance: Math.max(4, Math.max(b.size.x, b.size.y, b.size.z) * 3.2) }
    }
    return null
  }, [placed, selectedSpace, dims.loa])

  // One thing selected at a time: picking a space drops the part and back.
  const selectSpace = (id: string | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (id) next.set('space', id)
      else next.delete('space')
      if (id) next.delete('part')
      return next
    })
  const selectPart = (id: string | null) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (id) next.set('part', id)
      else next.delete('part')
      if (id) next.delete('space')
      return next
    })

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
    // On a phone the boat comes first, then what is selected, then the filters.
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_300px]">
      {/* Left: what to look at */}
      <div className="order-3 space-y-3 lg:order-none">
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
      <div className="order-1 min-w-0 space-y-2 lg:order-none">
        {canPlace && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={editing ? 'default' : 'outline'} onClick={() => setEditing((e) => !e)}>
              <Move size={14} className="mr-1" /> {editing ? 'Done editing' : 'Edit layout'}
            </Button>
            {editing && (
              <>
                <div className="flex gap-1">
                  <Button size="sm" variant={editMode === 'move' ? 'secondary' : 'ghost'} onClick={() => setEditMode('move')}>
                    <Move size={14} className="mr-1" /> Move
                  </Button>
                  <Button size="sm" variant={editMode === 'resize' ? 'secondary' : 'ghost'} onClick={() => setEditMode('resize')} disabled={!selectedSpace}>
                    <Scaling size={14} className="mr-1" /> Resize
                  </Button>
                </div>
                <span className="text-xs" style={muted}>
                  Tap a space's name or a part, then drag the arrows. Saved when you let go.
                </span>
              </>
            )}
          </div>
        )}
        <div className="relative h-[62vh] min-h-[340px] overflow-hidden rounded-lg border bg-muted/20 sm:h-[620px]">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm" style={muted}>Loading the 3D view…</div>}>
            <VesselScene
              model={model}
              focus={spaceFocus ?? focus}
              selectedPartId={selectedPartId}
              colourOf={colourOf}
              options={options}
              onSelectPart={selectPart}
              selectedSpaceId={selectedSpaceId}
              onSelectSpace={selectSpace}
              editing={editing}
              editMode={selectedSpace ? editMode : 'move'}
              onMoveSpace={(id, box) =>
                placeSpace.mutate({ id, box: boxToStored(box) }, { onError: failed('save the space') })
              }
              goal={goal}
              fitKey={fitKey}
              onMovePart={(id, position) =>
                placePart.mutate(
                  { id, position: { x: +position.x.toFixed(2), y: +position.y.toFixed(2), z: +position.z.toFixed(2) } },
                  { onError: failed('save the part') },
                )
              }
            />
          </Suspense>
          <Button
            size="sm"
            variant="outline"
            className="absolute right-2 top-2 h-8 bg-background/90 px-2 text-xs"
            onClick={() => setFitKey((k) => k + 1)}
          >
            <Maximize2 size={13} className="mr-1" /> Whole boat
          </Button>
          <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded bg-background/80 px-2 py-1 text-[11px]" style={muted}>
            {touch
              ? 'Drag to orbit · pinch to zoom · two fingers to pan · tap a part'
              : 'Drag to orbit · scroll to zoom · right-drag to pan · click a part'}
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
          . Spaces and parts sit where someone placed them, else where their names point; a space
          marked “?” had nothing to go on. A 3D scan of the boat can replace this hull once it is loaded.
        </p>
      </div>

      {/* Right: the selection */}
      <div className="order-2 space-y-3 lg:order-none">
        {narrow && (selectedSpace || selected) ? null : selectedSpace ? (
          spacePanel(selectedSpace)
        ) : selected ? (
          partPanel(selected, placed, byId, selectPart)
        ) : (
          <Panel title="Selection">
            <p className="text-sm" style={muted}>
              Tap a part on the boat to see what it is, where it sits and what it is connected to, or a
              space's name to see what is in it. Pick a system to light up its parts and their connections.
            </p>
            {!parts.length && !isLoading && (
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/parts/import"><FileUp size={14} className="mr-1" /> Import parts from documents</Link>
              </Button>
            )}
          </Panel>
        )}
      </div>

      {narrow && (selectedSpace || selected) && (
        <>
          {/* Room under the page so the floating card never hides its end. */}
          <div className="order-4 h-28" aria-hidden />
          {peekCard()}
        </>
      )}

      <Sheet open={detailsOpen && !!(selectedSpace || selected)} onOpenChange={setDetailsOpen}>
        <SheetContent
          side={narrow ? 'bottom' : 'right'}
          className={narrow ? 'h-[88dvh] overflow-y-auto rounded-t-xl p-4 pt-6' : 'w-full overflow-y-auto sm:max-w-xl'}
        >
          <SheetTitle className="sr-only">{selected?.name ?? selectedSpace?.space.name ?? 'Details'}</SheetTitle>
          {selected ? (
            <PartDetail
              part={selected}
              parts={parts}
              onSelect={selectPart}
              onEdit={() => setDialog({ editing: selected, parentId: selected.parent_id ?? '' })}
              onAddChild={() => setDialog({ editing: null, parentId: selected.id })}
            />
          ) : selectedSpace ? (
            spaceDetails(selectedSpace)
          ) : null}
        </SheetContent>
      </Sheet>

      <PartDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        editing={dialog?.editing ?? null}
        defaultParentId={dialog?.parentId ?? ''}
        parts={parts}
        onSaved={(p) => selectPart(p.id)}
      />
    </div>
  )

  // What is picked, floating above the bottom bar on a phone so it is seen
  // the moment it is tapped, with the way into everything about it.
  function peekCard() {
    const clear = () => (selectedSpace ? selectSpace(null) : selectPart(null))
    let kind = 'Space'
    let title: ReactNode = selectedSpace?.space.name
    let line = ''
    if (selected) {
      kind = selected.kind ? selected.kind.toLowerCase() : 'Part'
      title = (
        <>
          {selected.designation && <span className="mr-1 font-mono text-xs" style={muted}>{selected.designation}</span>}
          {selected.name}
        </>
      )
      const sp = spaces.find((x) => x.id === selected.space_id)
      const st = status.get(selected.id)
      line = [partPath(selected, byId), sp?.name, st === 'ncr' ? 'open NCR' : st === 'wp' ? 'work in progress' : null]
        .filter(Boolean)
        .join(' · ')
    } else if (selectedSpace) {
      const n = spaceFocus?.size ?? 0
      line = `${n} part${n === 1 ? '' : 's'} · ${selectedSpace.stored ? 'placed by hand' : 'placed from its name'}`
    }
    return (
      <div
        className="fixed inset-x-3 z-20 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur"
        style={{ bottom: phone ? 'calc(62px + env(safe-area-inset-bottom) + 8px)' : 16 }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={muted}>{kind}</div>
            <div className="truncate font-semibold">{title}</div>
            {line && <div className="truncate text-xs" style={muted}>{line}</div>}
          </div>
          <button type="button" aria-label="Clear selection" className="rounded p-1 hover:bg-muted" onClick={clear}>
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setDetailsOpen(true)}>
            Details <ChevronRight size={14} className="ml-1" />
          </Button>
          {editing && (selected ? placed?.source === 'stored' : selectedSpace?.stored) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                selected
                  ? placePart.mutate({ id: selected.id, position: null }, { onError: failed('reset the part') })
                  : placeSpace.mutate({ id: selectedSpace!.space.id, box: null }, { onError: failed('reset the space') })
              }
            >
              <RotateCcw size={13} className="mr-1" /> Guess
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Everything about a space: where it is, what is inside, what is open.
  function spaceDetails(s: (typeof model.spaces)[number]) {
    const byIdSpace = new Map(spaces.map((x) => [x.id, x]))
    const path: string[] = []
    for (let cur = byIdSpace.get(s.space.parent_id ?? ''); cur && path.length < 8; cur = byIdSpace.get(cur.parent_id ?? '')) {
      path.unshift(cur.name)
    }
    const subSpaces = spaces.filter((x) => x.parent_id === s.space.id && !x.removed_at)
    const inside = parts
      .filter((p) => spaceFocus?.has(p.id) && !p.removed_at)
      .sort((a, b) => Number(status.has(b.id)) - Number(status.has(a.id)) || a.name.localeCompare(b.name))
    const ncrs = inside.filter((p) => status.get(p.id) === 'ncr').length
    const busy = inside.filter((p) => status.get(p.id) === 'wp').length
    return (
      <div className="flex flex-col gap-4">
        <div>
          {path.length > 0 && <div className="text-xs" style={muted}>{path.join(' › ')}</div>}
          <h2 className="text-xl font-bold">{s.space.name}</h2>
          <div className="text-xs" style={muted}>
            {s.stored ? 'Placed by hand' : s.guessed ? 'Guessed: its name gave no clue' : 'Placed from its name'} ·{' '}
            {s.box.size.x.toFixed(1)} × {s.box.size.z.toFixed(1)} × {s.box.size.y.toFixed(1)} m
          </div>
          {s.space.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{s.space.notes}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2"><div className="text-lg font-bold">{inside.length}</div><div className="text-[11px]" style={muted}>parts</div></div>
          <div className="rounded-lg border p-2"><div className="text-lg font-bold" style={{ color: ncrs ? STATUS_COLOURS.ncr : undefined }}>{ncrs}</div><div className="text-[11px]" style={muted}>with an open NCR</div></div>
          <div className="rounded-lg border p-2"><div className="text-lg font-bold" style={{ color: busy ? STATUS_COLOURS.wp : undefined }}>{busy}</div><div className="text-[11px]" style={muted}>being worked on</div></div>
        </div>
        {subSpaces.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Inside it</h3>
            <div className="flex flex-wrap gap-1.5">
              {subSpaces.map((c) => (
                <button key={c.id} type="button" onClick={() => selectSpace(c.id)} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Parts</h3>
          {inside.length === 0 ? (
            <p className="text-sm" style={muted}>No parts recorded in it.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {inside.map((p) => {
                const st = status.get(p.id)
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => selectPart(p.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOURS[st ?? 'clear'] }} />
                      <span className="min-w-0 flex-1 truncate">
                        {p.designation && <span className="mr-1 font-mono text-xs" style={muted}>{p.designation}</span>}
                        {p.name}
                      </span>
                      {p.safety_critical && <ShieldAlert size={13} style={{ color: STATUS_COLOURS.ncr }} />}
                      <ChevronRight size={14} style={muted} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  function spacePanel(s: (typeof model.spaces)[number]) {
    const inside = model.parts.filter((p) => p.part.space_id === s.space.id)
    return (
      <Panel title="Space">
        <div className="text-base font-semibold">{s.space.name}</div>
        <div className="text-xs" style={muted}>
          {s.stored ? 'Placed by hand' : s.guessed ? 'Guessed: its name gave no clue' : 'Placed from its name'}
          {' · '}
          {s.box.size.x.toFixed(1)} × {s.box.size.z.toFixed(1)} × {s.box.size.y.toFixed(1)} m
        </div>
        {inside.length > 0 ? (
          <ul className="max-h-60 space-y-1 overflow-y-auto border-t pt-2 text-sm">
            {inside.map((p) => (
              <li key={p.part.id}>
                <button className="text-left hover:underline" onClick={() => selectPart(p.part.id)}>
                  {p.part.designation && <span className="mr-1 font-mono text-xs" style={muted}>{p.part.designation}</span>}
                  {p.part.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={muted}>No parts recorded in it.</p>
        )}
        <Button size="sm" className="w-full" onClick={() => setDetailsOpen(true)}>
          <PanelRightOpen size={13} className="mr-1" /> All details
        </Button>
        {editing && s.stored && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => placeSpace.mutate({ id: s.space.id, box: null }, { onError: failed('reset the space') })}
          >
            <RotateCcw size={13} className="mr-1" /> Back to the guess
          </Button>
        )}
      </Panel>
    )
  }

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
            {placed?.source === 'stored'
              ? 'by hand'
              : placed?.source === 'space'
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
        {editing && placed?.source === 'stored' && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => placePart.mutate({ id: part.id, position: null }, { onError: failed('reset the part') })}
          >
            <RotateCcw size={13} className="mr-1" /> Back to the guess
          </Button>
        )}
        <Button size="sm" className="w-full" onClick={() => setDetailsOpen(true)}>
          <PanelRightOpen size={13} className="mr-1" /> All details
        </Button>
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
