import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FileSearch, Link2, ShieldAlert, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import DrawingViewer, { type DrawingTarget } from '@/components/parts/DrawingViewer'
import {
  useApplyPartImport,
  useDiscardPartImport,
  useDocuments,
  useProject,
  useSavePartImport,
} from '@/lib/query-hooks'
import type { PartImport } from '@/lib/types'
import type { Proposal, ProposalPart, ProposalRef } from '@/lib/proposal'
import { useTranslation } from '@/lib/i18n'

// Reviewing what the reader proposes.
//
// Every row can be renamed, moved to another space or left out; leaving out a
// system leaves out what is under it. Each part shows where it was read, and
// opens the drawing on it. Changes are saved to the draft as you go, so a
// review can be finished later. Apply commits everything in one transaction.

const KIND_LABEL: Record<string, string> = {
  POWERS: 'powers',
  PROTECTS: 'protects',
  CONTROLS: 'controls',
  SIGNALS: 'signals',
  FLOWS_TO: 'flows to',
  CONNECTED: 'connects to',
}
const muted = { color: 'hsl(var(--muted-foreground))' }
const selectStyle = {
  borderColor: 'hsl(var(--border))',
  background: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

export default function ImportReview({ imp }: { imp: PartImport }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: project } = useProject()
  const { data: documents = [] } = useDocuments()
  const save = useSavePartImport()
  const apply = useApplyPartImport()
  const discard = useDiscardPartImport()
  const [proposal, setProposal] = useState<Proposal>(() => normalise(imp.proposal))
  const [dirty, setDirty] = useState(false)
  const [query, setQuery] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [viewer, setViewer] = useState<DrawingTarget | null>(null)
  const readOnly = imp.status !== 'DRAFT'

  // Autosave the draft a moment after the last edit.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!dirty || readOnly) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save.mutate(
        { proposal, documentIds: null, importId: imp.id },
        { onSuccess: () => setDirty(false), onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the draft') },
      )
    }, 1500)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, dirty])

  const edit = (fn: (p: Proposal) => Proposal) => {
    if (readOnly) return
    setProposal((p) => fn(structuredClone(p)))
    setDirty(true)
  }

  const byKey = useMemo(() => new Map(proposal.parts.map((p) => [p.key, p])), [proposal.parts])
  const children = useMemo(() => {
    const m = new Map<string | null, ProposalPart[]>()
    for (const p of proposal.parts) {
      const parent = p.parent_key && byKey.has(p.parent_key) ? p.parent_key : null
      m.set(parent, [...(m.get(parent) ?? []), p])
    }
    for (const list of m.values()) list.sort((a, b) => kindRank(a) - kindRank(b) || a.name.localeCompare(b.name))
    return m
  }, [proposal.parts, byKey])
  const docById = useMemo(() => new Map(documents.map((d) => [d.id, d])), [documents])

  const included = proposal.parts.filter((p) => p.include)
  const stats = {
    parts: included.length,
    matched: included.filter((p) => p.existing_id).length,
    low: included.filter((p) => p.confidence === 'low').length,
    safety: included.filter((p) => p.safety_critical).length,
    spaces: proposal.spaces.filter((s) => s.include).length,
    connections: proposal.connections.filter((c) => c.include && byKey.get(c.from_key)?.include && byKey.get(c.to_key)?.include).length,
  }

  const setPart = (key: string, patch: Partial<ProposalPart>) =>
    edit((p) => {
      const part = p.parts.find((x) => x.key === key)
      if (part) Object.assign(part, patch)
      return p
    })

  // Leaving a part out leaves out everything under it, and the reverse.
  const setInclude = (key: string, include: boolean) =>
    edit((p) => {
      const kids = new Map<string, string[]>()
      for (const x of p.parts) if (x.parent_key) kids.set(x.parent_key, [...(kids.get(x.parent_key) ?? []), x.key])
      const stack = [key]
      while (stack.length) {
        const k = stack.pop()!
        const part = p.parts.find((x) => x.key === k)
        if (part) part.include = include
        stack.push(...(kids.get(k) ?? []))
      }
      return p
    })

  const open = (ref: ProposalRef, part: ProposalPart) => {
    const doc = docById.get(ref.document_id)
    if (!doc?.file_url) {
      toast.error('That document has no file')
      return
    }
    setViewer({ url: doc.file_url, title: `${doc.title} · page ${ref.page}${ref.sheet ? ` · sheet ${ref.sheet}` : ''}`, page: ref.page, bbox: ref.bbox, label: part.name })
  }

  const matches = (p: ProposalPart) => {
    if (onlyLow && p.confidence !== 'low') return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [p.name, p.designation, p.manufacturer, p.model, ...p.aliases].some((v) => v?.toLowerCase().includes(q))
  }
  const visible = (p: ProposalPart): boolean => matches(p) || (children.get(p.key) ?? []).some(visible)

  const doApply = () => {
    if (needsVessel && !proposal.vessel?.name?.trim()) {
      toast.error('Give the vessel a name first')
      return
    }
    if (!window.confirm(`Record ${stats.parts} parts, ${stats.spaces} spaces and ${stats.connections} connections on this asset?`)) return
    clearTimeout(saveTimer.current)
    apply.mutate(
      { importId: imp.id, proposal },
      {
        onSuccess: (r) => {
          toast.success(`Recorded ${r.parts_created} new parts (${r.parts_reused} already there), ${r.spaces_created} spaces, ${r.connections} connections, ${r.references} drawing references`)
          navigate('/app/parts')
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not apply the import'),
      },
    )
  }

  const doDiscard = () => {
    if (!window.confirm('Discard this proposal? Nothing has been recorded from it.')) return
    discard.mutate(imp.id, { onSuccess: () => navigate('/app/parts') })
  }

  const needsVessel = project !== undefined && project.project_type !== 'PROPERTY' && !project.vessel_id

  const renderPart = (p: ProposalPart, depth: number): React.ReactNode => {
    if (!visible(p)) return null
    const kids = children.get(p.key) ?? []
    const isOpen = !collapsed.has(p.key)
    return (
      <div key={p.key}>
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b py-1.5 pr-2 text-sm"
          style={{ paddingLeft: depth * 18, borderColor: 'hsl(var(--border))', opacity: p.include ? 1 : 0.45 }}
        >
          {kids.length ? (
            <button type="button" className="flex h-5 w-5 items-center justify-center" onClick={() => setCollapsed((c) => toggle(c, p.key))} aria-label={isOpen ? 'Collapse' : 'Expand'}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <input type="checkbox" checked={p.include} disabled={readOnly} onChange={(e) => setInclude(p.key, e.target.checked)} aria-label={`Include ${p.name}`} />
          <input
            value={p.name}
            disabled={readOnly}
            onChange={(e) => setPart(p.key, { name: e.target.value })}
            className={`min-w-[12rem] flex-1 rounded border-0 bg-transparent px-1 py-0.5 focus:outline-none focus:ring-1 ${p.kind === 'SYSTEM' ? 'font-semibold' : ''}`}
            style={{ color: 'hsl(var(--foreground))' }}
          />
          {p.kind && p.kind !== 'COMPONENT' && <Badge variant="outline" className="text-[10px]">{p.kind.toLowerCase()}</Badge>}
          {p.designation && <span className="font-mono text-xs" style={muted}>{p.designation}</span>}
          {p.manufacturer && <span className="text-xs" style={muted}>{[p.manufacturer, p.model].filter(Boolean).join(' ')}</span>}
          {p.safety_critical && <ShieldAlert size={13} style={{ color: 'hsl(0 72% 51%)' }} aria-label="Safety-critical" />}
          {p.confidence === 'low' && (
            <span className="rounded px-1.5 text-[10px] font-medium" style={{ background: 'hsl(38 92% 50% / 0.15)', color: 'hsl(38 80% 35%)' }}>check</span>
          )}
          {p.existing_id && (
            <span className="rounded px-1.5 text-[10px] font-medium" style={{ background: 'hsl(var(--accent) / 0.12)', color: 'hsl(var(--accent))' }} title="Already on the asset; only its empty fields will be filled">
              already recorded
            </span>
          )}
          {p.kind !== 'SYSTEM' && (
            <select
              value={p.space_key ?? ''}
              disabled={readOnly}
              onChange={(e) => setPart(p.key, { space_key: e.target.value || null })}
              className="h-7 max-w-[11rem] rounded border px-1 text-xs"
              style={selectStyle}
              aria-label="Space"
            >
              <option value="">no space</option>
              {proposal.spaces.filter((s) => s.include).map((s) => (
                <option key={s.key} value={s.key}>{s.name}</option>
              ))}
            </select>
          )}
          <span className="flex flex-wrap gap-1">
            {p.refs.slice(0, 4).map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => open(r, p)}
                className="inline-flex items-center gap-0.5 rounded border px-1.5 text-[11px] hover:bg-[hsl(var(--muted))]"
                style={{ borderColor: 'hsl(var(--border))' }}
                title={`${docById.get(r.document_id)?.title ?? ''} page ${r.page}${r.grid ? `, ${r.grid}` : ''}`}
              >
                <FileSearch size={11} /> p{r.page}{r.grid ? ` ${r.grid}` : ''}
              </button>
            ))}
            {p.refs.length > 4 && <span className="text-[11px]" style={muted}>+{p.refs.length - 4}</span>}
          </span>
        </div>
        {p.aliases.length > 0 && isOpen && (
          <div className="pb-1 text-[11px]" style={{ paddingLeft: depth * 18 + 52, ...muted }}>also read as: {p.aliases.join(', ')}</div>
        )}
        {isOpen && kids.map((k) => renderPart(k, depth + 1))}
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/parts')} className="-ml-2">
            <ArrowLeft size={14} className="mr-1" /> Parts
          </Button>
          <h1 className="mt-1 text-2xl font-bold">Review the import</h1>
          <p className="mt-1 text-sm" style={muted}>
            {readOnly
              ? `This import was ${imp.status.toLowerCase()}${imp.decided_by_name ? ` by ${imp.decided_by_name}` : ''}.`
              : 'Nothing is recorded yet. Untick what is wrong, rename what is unclear, then apply.'}{' '}
            {!readOnly && (save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Draft saved.')}
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={doDiscard} disabled={discard.isPending}>
              <Trash2 size={14} className="mr-1" /> Discard
            </Button>
            <Button onClick={doApply} disabled={apply.isPending || stats.parts === 0}>
              {apply.isPending ? 'Recording…' : `Apply · ${stats.parts} parts`}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Stat label="Parts" value={stats.parts} />
        <Stat label="Already recorded" value={stats.matched} />
        <Stat label="Spaces" value={stats.spaces} />
        <Stat label="Connections" value={stats.connections} />
        <Stat label="Safety-critical" value={stats.safety} tone={stats.safety ? 'bad' : undefined} />
        <Stat label="To check" value={stats.low} tone={stats.low ? 'warn' : undefined} />
      </div>

      {needsVessel && !readOnly && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4 text-sm">
            <div className="w-full">This project has no vessel yet; applying will record her as:</div>
            {(['name', 'vessel_type', 'build_yard', 'year_built'] as const).map((f) => (
              <label key={f} className="flex flex-col gap-1 text-xs">
                {f === 'name' ? 'Name' : f === 'vessel_type' ? 'Type' : f === 'build_yard' ? 'Builder' : 'Year built'}
                <Input
                  className="h-8 w-44"
                  value={proposal.vessel?.[f] ?? ''}
                  onChange={(e) =>
                    edit((p) => {
                      p.vessel = { name: null, vessel_type: null, build_yard: null, year_built: null, ...(p.vessel ?? {}), [f]: e.target.value || null }
                      return p
                    })
                  }
                />
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {proposal.warnings.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4 text-sm">
            {proposal.warnings.slice(0, 8).map((w, i) => (
              <div key={i} className="flex gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: 'hsl(38 90% 45%)' }} /> {w}
              </div>
            ))}
            {proposal.warnings.length > 8 && <div className="text-xs" style={muted}>and {proposal.warnings.length - 8} more</div>}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="systems">
        <TabsList>
          <TabsTrigger value="systems">By system</TabsTrigger>
          <TabsTrigger value="spaces">By space</TabsTrigger>
          <TabsTrigger value="connections">Connections ({proposal.connections.length})</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
        </TabsList>

        <TabsContent value="systems">
          <Card>
            <CardContent className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, tags, makes…" className="h-8 max-w-xs" />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Only what to check
                </label>
                <button type="button" className="text-xs hover:underline" style={muted} onClick={() => setCollapsed(new Set())}>Expand all</button>
                <button type="button" className="text-xs hover:underline" style={muted} onClick={() => setCollapsed(new Set(proposal.parts.filter((p) => p.kind === 'SYSTEM').map((p) => p.key)))}>Collapse systems</button>
              </div>
              <div>{(children.get(null) ?? []).map((p) => renderPart(p, 0))}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spaces">
          <Card>
            <CardContent className="flex flex-col gap-1 p-3 text-sm">
              {proposal.spaces.length === 0 && <p style={muted}>No spaces were found.</p>}
              {proposal.spaces.map((s) => {
                const inside = proposal.parts.filter((p) => p.space_key === s.key && p.include)
                const parent = proposal.spaces.find((x) => x.key === s.parent_key)
                return (
                  <div key={s.key} className="border-b py-2" style={{ borderColor: 'hsl(var(--border))', opacity: s.include ? 1 : 0.45 }}>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.include}
                        disabled={readOnly}
                        onChange={(e) =>
                          edit((p) => {
                            const sp = p.spaces.find((x) => x.key === s.key)!
                            sp.include = e.target.checked
                            if (!e.target.checked) for (const part of p.parts) if (part.space_key === s.key) part.space_key = null
                            return p
                          })
                        }
                      />
                      <input
                        value={s.name}
                        disabled={readOnly}
                        onChange={(e) => edit((p) => { p.spaces.find((x) => x.key === s.key)!.name = e.target.value; return p })}
                        className="flex-1 rounded border-0 bg-transparent px-1 font-medium focus:outline-none focus:ring-1"
                        style={{ color: 'hsl(var(--foreground))' }}
                      />
                      {parent && <span className="text-xs" style={muted}>inside {parent.name}</span>}
                      {s.existing_id && <span className="text-[10px]" style={{ color: 'hsl(var(--accent))' }}>already recorded</span>}
                    </div>
                    {inside.length > 0 && (
                      <div className="mt-1 pl-6 text-xs" style={muted}>{inside.map((p) => p.name).join(' · ')}</div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections">
          <Card>
            <CardContent className="flex flex-col gap-0 p-3 text-sm">
              {proposal.connections.length === 0 && <p style={muted}>No connections were found.</p>}
              {proposal.connections.map((c) => {
                const from = byKey.get(c.from_key)
                const to = byKey.get(c.to_key)
                const live = c.include && from?.include && to?.include
                return (
                  <div key={c.key} className="flex flex-wrap items-center gap-2 border-b py-1.5" style={{ borderColor: 'hsl(var(--border))', opacity: live ? 1 : 0.45 }}>
                    <input
                      type="checkbox"
                      checked={c.include}
                      disabled={readOnly}
                      onChange={(e) => edit((p) => { p.connections.find((x) => x.key === c.key)!.include = e.target.checked; return p })}
                    />
                    <span className="font-medium">{from?.name ?? '?'}</span>
                    <span className="inline-flex items-center gap-1 text-xs" style={muted}><Link2 size={11} /> {KIND_LABEL[c.kind] ?? c.kind}</span>
                    <span className="font-medium">{to?.name ?? '?'}</span>
                    {c.label && <span className="font-mono text-xs" style={muted}>{c.label}</span>}
                    {c.page && <span className="ml-auto text-xs" style={muted}>{docById.get(c.document_id ?? '')?.title ?? ''} p{c.page}</span>}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pages">
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 text-sm">
              {proposal.documents.map((d) => (
                <div key={d.document_id}>
                  <h3 className="mb-1 font-semibold">{docById.get(d.document_id)?.title ?? 'Document'}</h3>
                  <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    {d.pages.map((p) => (
                      <div key={p.page} className="flex gap-2 text-xs">
                        <span className="w-10 font-mono" style={muted}>p{p.page}</span>
                        <span className="w-24" style={p.kind === 'SCHEMATIC' || p.kind === 'TEXT' ? undefined : muted}>
                          {p.kind === 'SCHEMATIC_COPY' ? 'copy (skipped)' : p.kind.toLowerCase()}
                        </span>
                        <span className="truncate">{[p.sheet, p.title, p.revision].filter(Boolean).join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs" style={muted}>
                Copies of a sheet that is also in the set are read once, from the sheet itself. Photo pages and
                indexes are skipped.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs" style={muted}>
        Categories follow the disciplines ({t('discipline.ELECTRICAL')}, {t('discipline.MECHANICAL')}…). Parts already on the
        asset are matched by name and keep everything already typed in them.
      </p>

      <DrawingViewer target={viewer} onClose={() => setViewer(null)} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'bad' | 'warn' }) {
  return (
    <div className="min-w-[110px] rounded-[var(--radius)] border px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="text-[11px] uppercase tracking-wide" style={muted}>{label}</div>
      <div className="text-sm font-semibold" style={{ color: tone === 'bad' ? 'hsl(0 72% 51%)' : tone === 'warn' ? 'hsl(38 90% 45%)' : undefined }}>
        {value}
      </div>
    </div>
  )
}

function toggle(set: Set<string>, key: string) {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function kindRank(p: ProposalPart) {
  return p.kind === 'SYSTEM' ? 0 : p.kind === 'ASSEMBLY' ? 1 : 2
}

/** A stored proposal, with every list present, whatever version wrote it. */
function normalise(raw: unknown): Proposal {
  const p = (raw ?? {}) as Partial<Proposal>
  return {
    version: 1,
    vessel: p.vessel ?? null,
    documents: p.documents ?? [],
    spaces: p.spaces ?? [],
    parts: (p.parts ?? []).map((x) => ({ ...x, aliases: x.aliases ?? [], refs: x.refs ?? [] })),
    connections: p.connections ?? [],
    warnings: p.warnings ?? [],
  }
}
