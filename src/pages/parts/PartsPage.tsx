import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  Link2,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ObjectHistory from '@/components/ObjectHistory'
import {
  useChangeOrders,
  useCreatePart,
  useDefects,
  useDocuments,
  useInspections,
  useLinkPart,
  usePartHistory,
  usePartLinks,
  useParts,
  usePermissions,
  useProject,
  useProjectId,
  useRemovePart,
  useUnlinkPart,
  useUpdatePart,
  useWorkPackages,
  type PartInput,
  type PartLinkTarget,
} from '@/lib/query-hooks'
import {
  STARTER_SYSTEMS,
  buildPartTree,
  descendantIds,
  flattenTree,
  partAncestry,
  partPath,
  type PartNode,
} from '@/lib/parts'
import { day } from '@/lib/format'
import { useTranslation } from '@/lib/i18n'
import type { Discipline, Part } from '@/lib/types'
import { Constants } from '@/lib/database.types'

// The asset, as a tree of the things work is done to.
//
// A part belongs to the vessel, not to this project, so the tree is the same
// on every project about the boat and its history runs across all of them:
// the winch serviced in the 2026 survey is the winch the next refit opens.
// That continuity is what makes the record a model of the boat rather than a
// list of jobs.

const DISCIPLINES = Constants.public.Enums.discipline as readonly Discipline[]

const TYPE_LABEL: Record<PartLinkTarget, string> = {
  WORK_PACKAGE: 'Work package',
  DEFECT_RECORD: 'NCR',
  INSPECTION_EVENT: 'Inspection',
  CHANGE_ORDER: 'Change order',
  DOCUMENT: 'Document',
}

const routeFor = (type: PartLinkTarget, id: string) =>
  type === 'WORK_PACKAGE'
    ? `/app/work-packages/${id}`
    : type === 'DEFECT_RECORD'
      ? `/app/defects/${id}`
      : type === 'CHANGE_ORDER'
        ? `/app/change-orders/${id}`
        : type === 'INSPECTION_EVENT'
          ? '/app/inspections'
          : '/app/documents'

const muted = { color: 'hsl(var(--muted-foreground))' }
const selectStyle = {
  borderColor: 'hsl(var(--border))',
  background: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

// ─── The form, for recording and for editing ─────────────────────────────────

const FIELDS = ['location', 'manufacturer', 'model', 'serial_number', 'installed_on', 'notes'] as const

interface FormState {
  name: string
  category: string
  parentId: string
  location: string
  manufacturer: string
  model: string
  serial_number: string
  installed_on: string
  notes: string
}

const emptyForm = (parentId = ''): FormState => ({
  name: '',
  category: '',
  parentId,
  location: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  installed_on: '',
  notes: '',
})

const formFrom = (p: Part): FormState => ({
  name: p.name,
  category: p.category ?? '',
  parentId: p.parent_id ?? '',
  location: p.location ?? '',
  manufacturer: p.manufacturer ?? '',
  model: p.model ?? '',
  serial_number: p.serial_number ?? '',
  installed_on: p.installed_on ?? '',
  notes: p.notes ?? '',
})

function PartDialog({
  open,
  onOpenChange,
  editing,
  defaultParentId,
  parts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Part | null
  defaultParentId: string
  parts: Part[]
  onSaved: (part: Part) => void
}) {
  const { t } = useTranslation()
  const create = useCreatePart()
  const update = useUpdatePart()
  const [form, setForm] = useState<FormState>(emptyForm())

  useEffect(() => {
    if (open) setForm(editing ? formFrom(editing) : emptyForm(defaultParentId))
  }, [open, editing, defaultParentId])

  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  // A part cannot move under itself or anything inside it.
  const excluded = editing ? descendantIds(editing.id, parts) : new Set<string>()
  const parentOptions = flattenTree(buildPartTree(parts)).filter((n) => !excluded.has(n.part.id))

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const busy = create.isPending || update.isPending

  const save = () => {
    if (!form.name.trim()) {
      toast.error('A part needs a name')
      return
    }
    const input: PartInput = {
      name: form.name.trim(),
      category: form.category || null,
      parentId: form.parentId || null,
      location: form.location,
      manufacturer: form.manufacturer,
      model: form.model,
      serialNumber: form.serial_number,
      installedOn: form.installed_on || null,
      notes: form.notes,
    }
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save the part')

    if (!editing) {
      create.mutate(input, {
        onSuccess: ({ part, existing }) => {
          toast.success(existing ? `"${part.name}" was already recorded there` : `Recorded "${part.name}"`)
          onSaved(part)
          onOpenChange(false)
        },
        onError: fail,
      })
      return
    }

    // Emptied fields must be named: an omitted field means "keep it".
    const clear: string[] = []
    for (const k of FIELDS) if (!form[k].trim() && editing[k]) clear.push(k)
    if (!form.category && editing.category) clear.push('category')
    if (!form.parentId && editing.parent_id) clear.push('parent')
    update.mutate(
      { id: editing.id, input, clear },
      {
        onSuccess: (part) => {
          toast.success(`Updated "${part.name}"`)
          onSaved(part)
          onOpenChange(false)
        },
        onError: fail,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Record a part'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="part-name">Name</Label>
            <Input id="part-name" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder="Port primary winch" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-parent">Inside</Label>
            <select id="part-parent" value={form.parentId} onChange={(e) => set('parentId')(e.target.value)} className="h-9 rounded-md border px-2 text-sm" style={selectStyle}>
              <option value="">— Top level —</option>
              {parentOptions.map((n) => (
                <option key={n.part.id} value={n.part.id}>
                  {partPath(n.part, byId)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-category">Category</Label>
            <select id="part-category" value={form.category} onChange={(e) => set('category')(e.target.value)} className="h-9 rounded-md border px-2 text-sm" style={selectStyle}>
              <option value="">—</option>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>
                  {t(`discipline.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="part-location">Where</Label>
            <Input id="part-location" value={form.location} onChange={(e) => set('location')(e.target.value)} placeholder="Cockpit, port side" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-make">Manufacturer</Label>
            <Input id="part-make" value={form.manufacturer} onChange={(e) => set('manufacturer')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-model">Model</Label>
            <Input id="part-model" value={form.model} onChange={(e) => set('model')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-serial">Serial number</Label>
            <Input id="part-serial" value={form.serial_number} onChange={(e) => set('serial_number')(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="part-installed">Installed</Label>
            <Input id="part-installed" type="date" value={form.installed_on} onChange={(e) => set('installed_on')(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label htmlFor="part-notes">Notes</Label>
            <Textarea id="part-notes" rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Record part'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── The tree ────────────────────────────────────────────────────────────────

interface Counts {
  openNcrs: number
  activeWps: number
}

function TreeRow({
  node,
  selectedId,
  expanded,
  toggle,
  select,
  counts,
}: {
  node: PartNode
  selectedId: string | null
  expanded: Set<string>
  toggle: (id: string) => void
  select: (id: string) => void
  counts: Map<string, Counts>
}) {
  const { part, children, depth } = node
  const isOpen = expanded.has(part.id)
  const c = counts.get(part.id)
  const selected = selectedId === part.id
  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-sm hover:bg-[hsl(var(--muted))]"
        style={{
          paddingLeft: 4 + depth * 16,
          background: selected ? 'hsl(var(--accent) / 0.12)' : undefined,
          opacity: part.removed_at ? 0.55 : 1,
        }}
        onClick={() => select(part.id)}
      >
        {children.length ? (
          <button
            type="button"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation()
              toggle(part.id)
            }}
            className="flex h-5 w-5 items-center justify-center"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className={`truncate ${part.removed_at ? 'line-through' : ''}`}>{part.name}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px]">
          {c && c.openNcrs > 0 && (
            <span className="rounded-full px-1.5" style={{ background: 'hsl(0 72% 51% / 0.12)', color: 'hsl(0 72% 45%)' }} title="Open NCRs on this part or inside it">
              {c.openNcrs} NCR
            </span>
          )}
          {c && c.activeWps > 0 && (
            <span className="rounded-full px-1.5" style={{ background: 'hsl(var(--accent) / 0.12)', color: 'hsl(var(--accent))' }} title="Work packages in progress on this part or inside it">
              {c.activeWps} WP
            </span>
          )}
        </span>
      </div>
      {isOpen &&
        children.map((child) => (
          <TreeRow key={child.part.id} node={child} selectedId={selectedId} expanded={expanded} toggle={toggle} select={select} counts={counts} />
        ))}
    </>
  )
}

// ─── One part ────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs" style={muted}>
        {label}
      </div>
      <div className="text-sm font-medium">{value || '—'}</div>
    </div>
  )
}

function LinkRecord({ part }: { part: Part }) {
  const { data: wps = [] } = useWorkPackages()
  const { data: defects = [] } = useDefects()
  const { data: inspections = [] } = useInspections()
  const { data: cos = [] } = useChangeOrders()
  const { data: docs = [] } = useDocuments()
  const link = useLinkPart()
  const [type, setType] = useState<PartLinkTarget>('WORK_PACKAGE')
  const [objectId, setObjectId] = useState('')

  const options: { id: string; label: string }[] =
    type === 'WORK_PACKAGE'
      ? wps.map((w) => ({ id: w.id, label: `${w.wp_number} · ${w.title}` }))
      : type === 'DEFECT_RECORD'
        ? defects.map((d) => ({ id: d.id, label: `${d.ncr_number} · ${d.title}` }))
        : type === 'INSPECTION_EVENT'
          ? inspections.map((i) => ({ id: i.id, label: `${i.inspection_number} · ${i.title}` }))
          : type === 'CHANGE_ORDER'
            ? cos.map((c) => ({ id: c.id, label: `${c.co_number} · ${c.title}` }))
            : docs.map((d) => ({ id: d.id, label: `${d.doc_number} · ${d.title}` }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={type}
        onChange={(e) => {
          setType(e.target.value as PartLinkTarget)
          setObjectId('')
        }}
        className="h-8 rounded-md border px-2 text-xs"
        style={selectStyle}
        aria-label="Record type"
      >
        {(Object.keys(TYPE_LABEL) as PartLinkTarget[]).map((k) => (
          <option key={k} value={k}>
            {TYPE_LABEL[k]}
          </option>
        ))}
      </select>
      <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border px-2 text-xs" style={selectStyle} aria-label="Record">
        <option value="">Choose a record on this project…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={!objectId || link.isPending}
        onClick={() =>
          link.mutate(
            { partId: part.id, objectType: type, objectId },
            {
              onSuccess: () => setObjectId(''),
              onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not link'),
            },
          )
        }
      >
        <Link2 size={13} className="mr-1" /> Link
      </Button>
    </div>
  )
}

function PartDetail({
  part,
  parts,
  onEdit,
  onAddChild,
  onSelect,
}: {
  part: Part
  parts: Part[]
  onEdit: () => void
  onAddChild: () => void
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const projectId = useProjectId()
  const { can } = usePermissions()
  const { data: history = [], isLoading } = usePartHistory(part.id)
  const unlink = useUnlinkPart()
  const remove = useRemovePart()
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const ancestry = partAncestry(part, byId)
  const children = parts.filter((p) => p.parent_id === part.id && !p.removed_at)
  const live = history.filter((h) => !h.link.removed_at)
  const past = history.filter((h) => h.link.removed_at)

  const doRemove = () => {
    const reason = window.prompt(`Why is "${part.name}" coming off? (removed, scrapped, replaced… kept in the record)`)
    if (!reason?.trim()) return
    remove.mutate(
      { id: part.id, reason },
      {
        onSuccess: () => toast.success(`"${part.name}" removed; its history stays`),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-1 text-xs" style={muted}>
          {ancestry.slice(0, -1).map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1">
              <button type="button" className="hover:underline" onClick={() => onSelect(a.id)}>
                {a.name}
              </button>
              <ChevronRight size={11} />
            </span>
          ))}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{part.name}</h2>
          {part.category && (
            <Badge style={{ backgroundColor: 'hsl(var(--primary)/0.12)', color: 'hsl(var(--primary))', border: 'none' }}>
              {t(`discipline.${part.category}`)}
            </Badge>
          )}
          {part.removed_at && (
            <Badge style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none' }}>
              Removed {day(part.removed_at)}
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            {can('action_update_part') && !part.removed_at && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil size={13} className="mr-1" /> Edit
              </Button>
            )}
            {can('action_create_part') && !part.removed_at && (
              <Button size="sm" variant="outline" onClick={onAddChild}>
                <Plus size={13} className="mr-1" /> Sub-part
              </Button>
            )}
            {can('action_remove_part') && !part.removed_at && (
              <Button size="sm" variant="ghost" onClick={doRemove} disabled={remove.isPending} aria-label="Remove part">
                <Trash2 size={14} />
              </Button>
            )}
          </div>
        </div>
        {part.removed_at && part.removed_reason && (
          <p className="mt-1 text-sm" style={muted}>
            {part.removed_by_name ? `${part.removed_by_name}: ` : ''}
            {part.removed_reason}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Field label="Where" value={part.location} />
        <Field label="Manufacturer" value={part.manufacturer} />
        <Field label="Model" value={part.model} />
        <Field label="Serial number" value={part.serial_number && <span className="font-mono text-xs">{part.serial_number}</span>} />
        <Field label="Installed" value={part.installed_on && day(part.installed_on)} />
        <Field label="Recorded by" value={part.created_by_name} />
      </div>
      {part.notes && <p className="whitespace-pre-wrap text-sm">{part.notes}</p>}

      {children.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Inside it</h3>
          <div className="flex flex-wrap gap-1.5">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-[hsl(var(--muted))]"
                style={{ borderColor: 'hsl(var(--border))' }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record">Record ({live.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="flex flex-col gap-3">
          <p className="text-xs" style={muted}>
            Every work package, NCR, inspection, change order and document about this part, on
            every project you are on for this asset.
          </p>
          {isLoading && <p className="text-sm" style={muted}>Loading…</p>}
          {!isLoading && live.length === 0 && (
            <p className="text-sm" style={muted}>Nothing linked yet.</p>
          )}
          {live.map((h) => {
            const here = h.projectId === projectId
            return (
              <div key={h.link.id} className="flex items-center gap-2 border-b pb-2 text-sm last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
                <span className="w-24 shrink-0 text-xs" style={muted}>
                  {TYPE_LABEL[h.objectType]}
                </span>
                <div className="min-w-0 flex-1">
                  {here ? (
                    <Link to={routeFor(h.objectType, h.link.object_id)} className="font-medium hover:underline">
                      {h.number ?? '—'} <span className="font-normal">{h.title}</span>
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {h.number ?? '—'} <span className="font-normal">{h.title}</span>
                    </span>
                  )}
                  <div className="text-xs" style={muted}>
                    {[h.status?.replace(/_/g, ' '), h.date && day(h.date), !here && h.projectName].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {here && can('action_unlink_part') && (
                  <button
                    type="button"
                    aria-label="Unlink"
                    className="opacity-50 hover:opacity-100"
                    onClick={() => {
                      const reason = window.prompt('Why does this record no longer concern the part? (kept in the record)')
                      if (reason === null) return
                      unlink.mutate(
                        { partId: part.id, objectType: h.objectType, objectId: h.link.object_id, reason },
                        { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not unlink') },
                      )
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )
          })}
          {past.length > 0 && (
            <details className="text-xs" style={muted}>
              <summary className="cursor-pointer">{past.length} earlier link{past.length === 1 ? '' : 's'}, since removed</summary>
              <ul className="mt-1 flex flex-col gap-1">
                {past.map((h) => (
                  <li key={h.link.id}>
                    <span className="line-through">{h.number} {h.title}</span>
                    {h.link.removed_reason && ` — ${h.link.removed_reason}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {can('action_link_part') && !part.removed_at && <LinkRecord part={part} />}
        </TabsContent>
        <TabsContent value="history">
          <ObjectHistory objectType="PART" objectId={part.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── The page ────────────────────────────────────────────────────────────────

export default function PartsPage() {
  const { data: project } = useProject()
  const { data: parts = [], isLoading, error } = useParts()
  const { data: links = [] } = usePartLinks()
  const { data: defects = [] } = useDefects()
  const { data: wps = [] } = useWorkPackages()
  const { can } = usePermissions()
  const create = useCreatePart()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('part')

  const [query, setQuery] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<{ editing: Part | null; parentId: string } | null>(null)

  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  const tree = useMemo(() => buildPartTree(parts, showRemoved), [parts, showRemoved])

  // Open NCRs and active work packages, rolled up from each part to every
  // part above it, so a collapsed system still says where the trouble is.
  const counts = useMemo(() => {
    const openNcr = new Set(defects.filter((d) => d.status !== 'CLOSED').map((d) => d.id))
    const activeWp = new Set(wps.filter((w) => w.status === 'ACTIVE' || w.status === 'EXPANDED').map((w) => w.id))
    const out = new Map<string, Counts>()
    const seen = new Map<string, Set<string>>()
    for (const l of links) {
      const part = byId.get(l.part_id)
      if (!part) continue
      const isNcr = l.object_type === 'DEFECT_RECORD' && openNcr.has(l.object_id)
      const isWp = l.object_type === 'WORK_PACKAGE' && activeWp.has(l.object_id)
      if (!isNcr && !isWp) continue
      for (const a of partAncestry(part, byId)) {
        // A record linked to two parts of one system counts once for it.
        const key = `${l.object_type}:${l.object_id}`
        const s = seen.get(a.id) ?? new Set<string>()
        if (s.has(key)) continue
        s.add(key)
        seen.set(a.id, s)
        const c = out.get(a.id) ?? { openNcrs: 0, activeWps: 0 }
        if (isNcr) c.openNcrs++
        if (isWp) c.activeWps++
        out.set(a.id, c)
      }
    }
    return out
  }, [links, defects, wps, byId])

  const select = (id: string) => {
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('part', id)
      return next
    })
    // Open the way down to it.
    const part = byId.get(id)
    if (part) {
      setExpanded((prev) => {
        const next = new Set(prev)
        for (const a of partAncestry(part, byId).slice(0, -1)) next.add(a.id)
        return next
      })
    }
  }

  // Arriving from a chip: reveal the part in the tree.
  useEffect(() => {
    if (selectedId && byId.has(selectedId)) select(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, byId.size])

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return flattenTree(tree)
      .map((n) => n.part)
      .filter((p) =>
        [p.name, p.location, p.manufacturer, p.model, p.serial_number]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
  }, [query, tree])

  const isProperty = project?.project_type === 'PROPERTY'
  const needsVessel = project !== undefined && !isProperty && !project.vessel_id
  const assetName = isProperty ? project?.name : project?.vessel?.name
  const selected = selectedId ? byId.get(selectedId) ?? null : null

  const seedStarter = async () => {
    const starter = STARTER_SYSTEMS[isProperty ? 'property' : 'boat']
    try {
      for (const s of starter) await create.mutateAsync({ name: s.name, category: s.category })
      toast.success(`Recorded ${starter.length} systems. Add what sits inside each one.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record the systems')
    }
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--destructive))' }}>
        Could not load the parts: {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Boxes size={22} style={{ color: 'hsl(var(--accent))' }} />
            Parts{assetName ? ` of ${assetName}` : ''}
          </h1>
          <p className="mt-1 max-w-3xl text-sm" style={muted}>
            The {isProperty ? 'building' : 'boat'} as the record knows it: its systems and the
            components inside them, and everything ever done to each one.
            {!isProperty && ' Parts belong to the vessel, so they carry over to every project on her.'}
          </p>
        </div>
        {can('action_create_part') && !needsVessel && (
          <Button size="sm" onClick={() => setDialog({ editing: null, parentId: selected && !selected.removed_at ? selected.id : '' })}>
            <Plus size={14} className="mr-1" /> Record part
          </Button>
        )}
      </div>

      {needsVessel ? (
        <Card>
          <CardContent className="p-6 text-sm">
            This project has no vessel recorded yet, and parts belong to the vessel.{' '}
            <Link to="/app/project" className="font-medium underline">
              Add the boat's details
            </Link>{' '}
            first, then come back to build her parts.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div style={{ padding: '2rem', ...muted }}>Loading…</div>
      ) : parts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6 text-sm">
            <p>
              No parts recorded yet. Start with the main systems and add components as work
              touches them — or ask the agent to build the tree from a spec or a job list.
            </p>
            {can('action_create_part') && (
              <Button size="sm" variant="outline" onClick={seedStarter} disabled={create.isPending}>
                Start with the standard {isProperty ? 'building' : 'boat'} systems
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="self-start">
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5" style={muted} />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, make, serial…" className="h-9 pl-8" />
              </div>
              <div className="flex items-center justify-between text-xs" style={muted}>
                <span>{parts.filter((p) => !p.removed_at).length} parts</span>
                <div className="flex gap-3">
                  <button type="button" className="hover:underline" onClick={() => setExpanded(new Set(parts.map((p) => p.id)))}>
                    Expand all
                  </button>
                  <label className="inline-flex cursor-pointer items-center gap-1">
                    <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                    Removed
                  </label>
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto">
                {matches
                  ? matches.length === 0
                    ? <p className="p-2 text-sm" style={muted}>No match.</p>
                    : matches.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => select(p.id)}
                          className="block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-[hsl(var(--muted))]"
                          style={{ background: selectedId === p.id ? 'hsl(var(--accent) / 0.12)' : undefined }}
                        >
                          {partPath(p, byId)}
                        </button>
                      ))
                  : tree.map((n) => (
                      <TreeRow key={n.part.id} node={n} selectedId={selectedId} expanded={expanded} toggle={toggle} select={select} counts={counts} />
                    ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              {selected ? (
                <PartDetail
                  part={selected}
                  parts={parts}
                  onSelect={select}
                  onEdit={() => setDialog({ editing: selected, parentId: selected.parent_id ?? '' })}
                  onAddChild={() => setDialog({ editing: null, parentId: selected.id })}
                />
              ) : (
                <p className="text-sm" style={muted}>
                  Choose a part to see what it is and everything done to it.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <PartDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        editing={dialog?.editing ?? null}
        defaultParentId={dialog?.parentId ?? ''}
        parts={parts}
        onSaved={(p) => select(p.id)}
      />
    </div>
  )
}
