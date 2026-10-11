import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { PenLine, Plus, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useAddOrbEntry,
  useMasterSignOrb,
  useMyRole,
  useOrbEntries,
  usePermissions,
  useProject,
  useStrikeOrbEntry,
  useVessel,
} from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { useProjectId } from '@/contexts/ProjectContext'
import { useOutbox } from '@/hooks/useOutbox'
import { KEPT_MESSAGE, isQueued } from '@/lib/outbox'
import { ORB_CODES, codeInfo, itemsLabel, linesFrom, type OrbCode, type OrbLine } from '@/lib/oil-record'
import type { OrbEntry } from '@/lib/types'

// The Oil Record Book, Part I (migration 039).
//
// Kept the way the paper book is read: one numbered line after another, the
// code and item numbers, what was done, who made the entry and when, and the
// master's countersignature. Nothing is erased: a wrong entry is struck
// through with the reason and stays legible, and the correction is a new
// entry that says which one it replaces. Prints in the book's layout.

const muted = { color: 'hsl(var(--muted-foreground))' }
const when = (iso: string) => format(parseISO(iso), 'd MMM yyyy HH:mm')
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

export default function OilRecordPage() {
  const { data: project } = useProject()
  const { data: vessel } = useVessel()
  const { data: entries = [], isLoading } = useOrbEntries()
  const { can } = usePermissions()
  const { data: role = null } = useMyRole()
  const { user } = useAuth()
  const sign = useMasterSignOrb()
  const strike = useStrikeOrbEntry()
  const projectId = useProjectId()
  const { items: outbox } = useOutbox()
  const [correcting, setCorrecting] = useState<OrbEntry | null>(null)
  const [writing, setWriting] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())

  const canWrite = can('action_add_orb_entry')
  const isMaster = role === 'CAPTAIN' && can('action_master_sign_orb')
  const unsigned = entries.filter((e) => !e.master_signed_at).length
  const years = useMemo(() => {
    const ys = new Set(entries.map((e) => parseISO(e.occurred_at).getFullYear()))
    ys.add(new Date().getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [entries])
  const shown = entries.filter((e) => parseISO(e.occurred_at).getFullYear() === year)
  const corrected = new Set(entries.map((e) => e.corrects_id).filter(Boolean))
  const byId = new Map(entries.map((e) => [e.id, e]))
  const kept = outbox.filter((i) => i.kind === 'orb' && i.projectId === projectId)

  if (project && project.project_type !== 'OPERATIONS') {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          The Oil Record Book belongs to a boat's logbook. Switch to it in the project menu, or open one from{' '}
          <Link to="/app/project" className="underline">the project overview</Link>.
        </CardContent>
      </Card>
    )
  }

  const doSign = () =>
    sign.mutate(undefined, {
      onSuccess: (r) => toast.success(r.signed ? `Countersigned ${r.signed} entr${r.signed === 1 ? 'y' : 'ies'}` : 'Nothing waiting for your signature'),
      onError: (e) => toast.error(e.message),
    })
  const doStrike = (e: OrbEntry) => {
    const reason = window.prompt(`Why is entry ${e.entry_no} struck through? It stays legible; record the correct entry next.`)
    if (!reason?.trim()) return
    strike.mutate(
      { id: e.id, reason: reason.trim() },
      { onSuccess: () => setCorrecting({ ...e, struck_at: new Date().toISOString() }), onError: (err) => toast.error(err.message) },
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Oil Record Book</h1>
          <p className="text-sm" style={muted}>
            {vessel?.name ?? project?.vessel?.name ?? ''} · Part I, machinery space operations · {entries.length} entr
            {entries.length === 1 ? 'y' : 'ies'}
            {unsigned > 0 && <span style={{ color: 'hsl(35 80% 35%)' }}> · {unsigned} awaiting the master's signature</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Year" className="h-9 rounded-md border bg-background px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {isMaster && unsigned > 0 && (
            <Button size="sm" onClick={doSign} disabled={sign.isPending}>
              <PenLine size={14} className="mr-1" /> Countersign {unsigned}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer size={14} className="mr-1" /> Print / PDF
          </Button>
          {canWrite && !writing && !correcting && (
            <Button size="sm" onClick={() => setWriting(true)}>
              <Plus size={14} className="mr-1" /> New entry
            </Button>
          )}
        </div>
      </div>

      {canWrite && (writing || correcting) && (
        <EntryForm
          key={correcting?.id ?? 'new'}
          correcting={correcting}
          onDone={() => {
            setCorrecting(null)
            setWriting(false)
          }}
        />
      )}

      <Card className="print:hidden">
        <CardContent className="p-0">
          {kept.length > 0 && (
            <ul className="divide-y border-b">
              {kept.map((i) => (
                <li key={i.id} className="px-3 py-2 text-sm" style={{ background: 'hsl(35 90% 96%)' }}>
                  <span className="font-medium">Not numbered yet</span> ·{' '}
                  <span style={{ color: i.status === 'failed' ? 'hsl(var(--destructive))' : 'hsl(35 80% 35%)' }}>
                    {i.status === 'failed' ? `refused: ${i.lastError}` : 'kept on this device, sent when back online'}
                  </span>
                  <div className="text-xs" style={muted}>{i.summary}</div>
                </li>
              ))}
            </ul>
          )}
          {isLoading ? (
            <p className="p-4 text-sm" style={muted}>Loading…</p>
          ) : shown.length === 0 ? (
            <p className="p-4 text-sm" style={muted}>No entries in {year}.</p>
          ) : (
            <ul className="divide-y">
              {shown.map((e) => {
                const lines = e.lines as unknown as OrbLine[]
                const struck = !!e.struck_at
                const mine = user?.id && e.recorded_by === user.id
                const replaced = e.corrects_id ? byId.get(e.corrects_id) : undefined
                return (
                  <li key={e.id} className="flex gap-3 px-3 py-2.5 text-sm">
                    <div className="w-10 shrink-0 font-mono text-xs" style={muted}>#{e.entry_no}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs" style={muted}>
                        <span className="font-mono">{when(e.occurred_at)}</span>
                        <span className="font-semibold" style={{ color: 'hsl(var(--foreground))' }}>{itemsLabel(e.code, lines)}</span>
                        <span>{codeInfo(e.code as OrbCode).title}</span>
                      </div>
                      <div className={struck ? 'line-through opacity-60' : ''}>
                        {lines.map((l, k) => (
                          <div key={k}>
                            {l.item && <span className="mr-1 font-mono text-xs">{l.item}</span>}
                            {l.text}
                          </div>
                        ))}
                        {(e.quantity != null || e.tank) && (
                          <div className="text-xs" style={muted}>
                            {e.quantity != null && `${Number(e.quantity).toLocaleString('en-GB')} ${e.unit === 't' ? 't' : 'm³'}`}
                            {e.quantity != null && e.tank ? ' · ' : ''}
                            {e.tank}
                          </div>
                        )}
                      </div>
                      {replaced && <div className="text-xs" style={muted}>Corrects entry #{replaced.entry_no}</div>}
                      <div className="mt-0.5 text-xs" style={muted}>
                        Signed {e.recorded_by_name}
                        {e.recorded_by_role ? ` (${e.recorded_by_role.toLowerCase().replace('_', ' ')})` : ''}, {when(e.created_at)}
                        {e.master_signed_at ? ` · master ${e.master_signed_by_name}, ${when(e.master_signed_at)}` : ' · awaiting master'}
                      </div>
                      {struck && (
                        <div className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                          Struck through by {e.struck_by_name}, {when(e.struck_at!)}: {e.struck_reason}
                        </div>
                      )}
                    </div>
                    {canWrite && (
                      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                        {!struck && (mine || role === 'CAPTAIN') && (
                          <button type="button" className="hover:underline" onClick={() => doStrike(e)}>Strike through</button>
                        )}
                        {struck && !corrected.has(e.id) && (
                          <button type="button" className="hover:underline" onClick={() => setCorrecting(e)}>Record correction</button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <PrintBook entries={shown} year={year} vesselName={vessel?.name ?? ''} flag={vessel?.flag_state ?? ''} hullId={vessel?.hull_id ?? ''} />
    </div>
  )
}

function EntryForm({ correcting, onDone }: { correcting: OrbEntry | null; onDone: () => void }) {
  const add = useAddOrbEntry()
  const [code, setCode] = useState<OrbCode>((correcting?.code as OrbCode) ?? 'C')
  const [at, setAt] = useState(() => (correcting ? toLocalInput(parseISO(correcting.occurred_at)) : toLocalInput(new Date())))
  const [written, setWritten] = useState<Record<string, string>>(() =>
    correcting ? Object.fromEntries((correcting.lines as unknown as OrbLine[]).map((l) => [l.item ?? '', l.text])) : {},
  )
  const [quantity, setQuantity] = useState(correcting?.quantity != null ? String(correcting.quantity) : '')
  const [tank, setTank] = useState(correcting?.tank ?? '')
  const [position, setPosition] = useState(correcting?.position ?? '')
  const info = codeInfo(code)
  const lines = linesFrom(code, written)
  const qty = quantity.trim() ? Number(quantity.replace(',', '.')) : null
  const qtyOk = qty === null ? !info.quantity?.required : Number.isFinite(qty) && qty >= 0
  const valid = !!lines && qtyOk && !!at

  const submit = () =>
    add.mutate(
      {
        code,
        lines: lines!,
        occurredAt: new Date(at).toISOString(),
        quantity: info.quantity && qty !== null ? qty : null,
        unit: info.quantity && qty !== null ? info.quantity.unit : null,
        tank,
        position,
        correctsId: correcting?.id ?? null,
      },
      {
        onSuccess: (res) => {
          toast.success(isQueued(res) ? KEPT_MESSAGE : correcting ? 'Correction recorded' : 'Entry made and signed')
          setWritten({})
          setQuantity('')
          onDone()
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <Card className="print:hidden">
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{correcting ? `Correction of entry #${correcting.entry_no}` : 'New entry'}</h2>
          <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <div>
            <Label htmlFor="orb-code">Code</Label>
            <select id="orb-code" className="h-9 w-full rounded-md border bg-background px-2" value={code} onChange={(e) => setCode(e.target.value as OrbCode)}>
              {ORB_CODES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.title}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="orb-at">Date and time of the operation</Label>
            <Input id="orb-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {info.items.map((i) => (
            <div key={i.item}>
              <Label htmlFor={`orb-item-${i.item}`} className="text-xs">
                {i.item && <span className="mr-1 font-mono">{i.item}</span>}
                {i.asks}
              </Label>
              <Textarea
                id={`orb-item-${i.item}`}
                rows={1}
                className="min-h-[38px]"
                value={written[i.item] ?? ''}
                onChange={(e) => setWritten((w) => ({ ...w, [i.item]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs" style={muted}>Fill in the items that apply; empty ones are left out of the entry.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {info.quantity && (
            <div>
              <Label htmlFor="orb-qty">{info.quantity.label} ({info.quantity.unit === 't' ? 'tonnes' : 'm³'}){info.quantity.required ? ' (required)' : ''}</Label>
              <Input id="orb-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="orb-tank">Tank(s)</Label>
            <Input id="orb-tank" value={tank} onChange={(e) => setTank(e.target.value)} placeholder="As on the IOPP certificate" />
          </div>
          <div>
            <Label htmlFor="orb-position">Position or port</Label>
            <Input id="orb-position" value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
        </div>
        <Button className="self-start" disabled={!valid || add.isPending} onClick={submit}>
          {add.isPending ? 'Signing…' : correcting ? 'Sign the correction' : 'Sign the entry'}
        </Button>
        <p className="text-xs" style={muted}>
          Signing records you as the officer making the entry, with the time. Entries cannot be changed afterwards: a wrong one
          is struck through with the reason, and the correction is a new entry.
        </p>
      </CardContent>
    </Card>
  )
}

/** The book's own layout, for printing or saving as PDF. */
function PrintBook({ entries, year, vesselName, flag, hullId }: { entries: OrbEntry[]; year: number; vesselName: string; flag: string; hullId: string }) {
  return (
    <div className="hidden print:block">
      <h1 className="text-lg font-bold">Oil Record Book, Part I: machinery space operations · {year}</h1>
      <p className="mb-2 text-xs">
        Name of ship: {vesselName}
        {hullId ? ` · Distinctive number or letters: ${hullId}` : ''}
        {flag ? ` · Flag: ${flag}` : ''}
      </p>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {['No.', 'Date', 'Code', 'Item', 'Record of operations / signature of officer in charge', "Master's signature"].map((h) => (
              <th key={h} className="border px-1 py-0.5 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.flatMap((e) => {
            const lines = e.lines as unknown as OrbLine[]
            const struck = e.struck_at ? 'line-through' : ''
            return lines.map((l, k) => (
              <tr key={`${e.id}-${k}`}>
                <td className="border px-1 py-0.5">{k === 0 ? e.entry_no : ''}</td>
                <td className="border px-1 py-0.5 whitespace-nowrap">{k === 0 ? format(parseISO(e.occurred_at), 'dd-MMM-yyyy') : ''}</td>
                <td className="border px-1 py-0.5">{k === 0 ? e.code : ''}</td>
                <td className="border px-1 py-0.5">{l.item ?? ''}</td>
                <td className="border px-1 py-0.5">
                  <span className={struck}>{l.text}</span>
                  {k === lines.length - 1 && (
                    <div>
                      {e.quantity != null && `${Number(e.quantity)} ${e.unit === 't' ? 't' : 'm³'} · `}
                      Signed: {e.recorded_by_name}, {format(parseISO(e.created_at), 'dd-MMM-yyyy HH:mm')}
                      {e.struck_at && ` · Struck through by ${e.struck_by_name}, ${format(parseISO(e.struck_at), 'dd-MMM-yyyy')}: ${e.struck_reason}`}
                    </div>
                  )}
                </td>
                <td className="border px-1 py-0.5">
                  {k === 0 && e.master_signed_at ? `${e.master_signed_by_name}, ${format(parseISO(e.master_signed_at), 'dd-MMM-yyyy')}` : ''}
                </td>
              </tr>
            ))
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[9px]">
        Electronic record book: entries are signed by the person making them and countersigned by the master; none can be
        deleted or altered, and struck-through entries remain legible with the reason (IMO MEPC.312(74)).
      </p>
    </div>
  )
}
