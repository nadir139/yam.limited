import { useMemo, useRef, useState } from 'react'
import { KEPT_MESSAGE, isQueued } from '@/lib/outbox'
import { format, parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  usePermissions,
  useRecordReading,
  useRecordService,
  useRetireServiceInterval,
  useSetServiceInterval,
  useVoidReading,
  useVoidServiceRecord,
} from '@/lib/query-hooks'
import { newClientId } from '@/lib/db'
import { partPath } from '@/lib/parts'
import { STATUS_META, dueText, intervalText, parseHours } from '@/lib/maintenance'
import type { Part, PartReading, ReadingKind, ServiceDue, ServiceInterval, ServiceRecord } from '@/lib/types'

// Maintenance (migration 036): what is due, and the forms that record
// readings, services and intervals. Used by the Maintenance page and by a
// part's Maintenance tab, so both show the same record the same way.
//
// Nothing here edits or deletes: a wrong reading or service is struck out
// with a reason and stays readable, an interval is retired with a reason.
// Each submission carries one client id, reused if the same submission is
// retried, so a save that timed out and is sent again is recorded once.

const muted = { color: 'hsl(var(--muted-foreground))' }
const day = (d: string) => format(parseISO(d), 'd MMM yyyy')
const hours = (v: number) => `${v.toLocaleString('en-GB')} h`
const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm'

export interface MaintenanceRecord {
  readings: PartReading[]
  intervals: ServiceInterval[]
  services: ServiceRecord[]
}

/**
 * A client id for one write. Sending the same content again (a retry after
 * a timeout) reuses the id, so the server records it once; changed content
 * gets a new id, so a corrected figure is never mistaken for the first one.
 */
function useSubmissionId() {
  const ref = useRef<{ key: string; id: string } | null>(null)
  return {
    id: (content: unknown) => {
      const key = JSON.stringify(content)
      if (!ref.current || ref.current.key !== key) ref.current = { key, id: newClientId() }
      return ref.current.id
    },
    next: () => (ref.current = null),
  }
}

export function StatusDot({ status }: { status: ServiceDue['status'] }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_META[status].colour }} />
}

/** Current parts, by their path in the tree. */
export function PartPicker({ id, parts, value, onChange }: { id: string; parts: Part[]; value: string; onChange: (v: string) => void }) {
  const options = useMemo(() => {
    const byId = new Map(parts.map((p) => [p.id, p]))
    return parts
      .filter((p) => !p.removed_at && p.vessel_id)
      .map((p) => ({ id: p.id, label: partPath(p, byId) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [parts])
  return (
    <select id={id} className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a part…</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  )
}

/** Records what a meter shows. A figure lower than the last asks whether the meter was replaced. */
export function ReadingForm({ parts, partId: fixedPart, onDone }: { parts: Part[]; partId?: string; onDone?: () => void }) {
  const record = useRecordReading()
  const sub = useSubmissionId()
  const [partId, setPartId] = useState(fixedPart ?? '')
  const [kind, setKind] = useState<ReadingKind>('RUNNING_HOURS')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [reset, setReset] = useState<string | null>(null)
  const num = parseHours(value)
  const part = fixedPart ?? partId

  const submit = () => {
    if (!part || num === null) return
    const content = {
      partId: part,
      value: num,
      kind,
      unit: kind === 'OTHER' ? unit : undefined,
      readAt: at ? new Date(at).toISOString() : null,
      note,
      resetReason: reset ?? undefined,
    }
    record.mutate(
      { ...content, clientId: sub.id(content) },
      {
        onSuccess: (res) => {
          toast.success(isQueued(res) ? KEPT_MESSAGE : 'Reading recorded')
          sub.next()
          setValue('')
          setNote('')
          setAt('')
          setReset(null)
          onDone?.()
        },
        onError: (e) => {
          // Out of step with earlier readings: the meter may have been replaced.
          if (/out of step/.test(e.message) && reset === null) setReset('')
          toast.error(e.message)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {!fixedPart && (
        <>
          <Label htmlFor="reading-part">Part</Label>
          <PartPicker id="reading-part" parts={parts} value={partId} onChange={setPartId} />
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="reading-kind">Reading</Label>
          <select id="reading-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ReadingKind)}>
            <option value="RUNNING_HOURS">Running hours</option>
            <option value="FUEL_LEVEL">Fuel (L)</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <Label htmlFor="reading-value">{kind === 'RUNNING_HOURS' ? 'Hours on the meter' : 'Value'}</Label>
          <Input
            id="reading-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              // A corrected figure is a new question: only ask about a meter
              // reset again if the server still finds it out of step. A reset
              // given just to get past a typo would restart the hour count.
              setReset(null)
            }}
            placeholder={kind === 'RUNNING_HOURS' ? '4,312' : ''}
          />
        </div>
      </div>
      {kind === 'OTHER' && (
        <div>
          <Label htmlFor="reading-unit">Unit</Label>
          <Input id="reading-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bar, °C, L…" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="reading-at">Read at (blank: now)</Label>
          <Input id="reading-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="reading-note">Note</Label>
          <Input id="reading-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {reset !== null && (
        <div>
          <Label htmlFor="reading-reset">The meter was replaced or reset because…</Label>
          <Input id="reading-reset" value={reset} onChange={(e) => setReset(e.target.value)} placeholder="New hour meter fitted with the ECU" />
        </div>
      )}
      <Button
        size="sm"
        className="self-start"
        disabled={!part || num === null || (kind === 'OTHER' && !unit.trim()) || (reset !== null && !reset.trim()) || record.isPending}
        onClick={submit}
      >
        {record.isPending ? 'Recording…' : 'Record reading'}
      </Button>
    </div>
  )
}

/** Sets up or changes a service interval. A change asks why once services count against it. */
export function IntervalForm({
  parts,
  partId: fixedPart,
  interval,
  onDone,
}: {
  parts: Part[]
  partId?: string
  interval?: ServiceInterval
  onDone?: () => void
}) {
  const save = useSetServiceInterval()
  const [partId, setPartId] = useState(fixedPart ?? interval?.part_id ?? '')
  const [title, setTitle] = useState(interval?.title ?? '')
  const [everyHours, setEveryHours] = useState(interval?.every_hours != null ? String(interval.every_hours) : '')
  const [everyDays, setEveryDays] = useState(interval?.every_days != null ? String(interval.every_days) : '')
  const [notes, setNotes] = useState(interval?.notes ?? '')
  const [lastOn, setLastOn] = useState('')
  const [lastHours, setLastHours] = useState('')
  const [reason, setReason] = useState('')
  const h = everyHours.trim() ? parseHours(everyHours) : null
  const d = everyDays.trim() ? Number(everyDays) : null
  const lh = lastHours.trim() ? parseHours(lastHours) : null
  const valid =
    !!(fixedPart ?? partId) &&
    title.trim().length >= 3 &&
    (h !== null || d !== null) &&
    (!everyHours.trim() || (h !== null && h > 0)) &&
    (!everyDays.trim() || (d !== null && Number.isInteger(d) && d > 0)) &&
    (!lastHours.trim() || lh !== null)

  const submit = () =>
    save.mutate(
      {
        intervalId: interval?.id ?? null,
        partId: fixedPart ?? partId,
        title: title.trim(),
        everyHours: h,
        everyDays: d,
        notes,
        lastDoneOn: lastOn || null,
        lastDoneHours: lh,
        reason,
      },
      {
        onSuccess: () => {
          toast.success(interval ? 'Interval changed' : 'Interval set up')
          onDone?.()
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <div className="flex flex-col gap-2 text-sm">
      {!fixedPart && !interval && (
        <>
          <Label htmlFor="interval-part">Part</Label>
          <PartPicker id="interval-part" parts={parts} value={partId} onChange={setPartId} />
        </>
      )}
      <Label htmlFor="interval-title">Service</Label>
      <Input id="interval-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oil and filter change" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="interval-hours">Every … running hours</Label>
          <Input id="interval-hours" inputMode="decimal" value={everyHours} onChange={(e) => setEveryHours(e.target.value)} placeholder="250" />
        </div>
        <div>
          <Label htmlFor="interval-days">or every … days</Label>
          <Input id="interval-days" inputMode="numeric" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} placeholder="365" />
        </div>
      </div>
      <Label htmlFor="interval-notes">Notes (parts, maker's reference)</Label>
      <Input id="interval-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {!interval ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="interval-last-on">Last done on</Label>
            <Input id="interval-last-on" type="date" value={lastOn} onChange={(e) => setLastOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="interval-last-hours">at … hours</Label>
            <Input id="interval-last-hours" inputMode="decimal" value={lastHours} onChange={(e) => setLastHours(e.target.value)} />
          </div>
        </div>
      ) : (
        <>
          <Label htmlFor="interval-reason">Why it is changing</Label>
          <Input id="interval-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Maker's bulletin 2026-04" />
        </>
      )}
      <Button size="sm" className="self-start" disabled={!valid || save.isPending} onClick={submit}>
        {save.isPending ? 'Saving…' : interval ? 'Save change' : 'Set up interval'}
      </Button>
    </div>
  )
}

/** Records maintenance done: against an interval, or described in words. */
export function ServiceForm({
  partId,
  intervalId,
  hoursNow,
  onDone,
}: {
  partId: string
  intervalId?: string | null
  hoursNow?: number | null
  onDone?: () => void
}) {
  const record = useRecordService()
  const sub = useSubmissionId()
  const [doneOn, setDoneOn] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hoursAt, setHoursAt] = useState(hoursNow != null ? String(hoursNow) : '')
  const [note, setNote] = useState('')
  const h = hoursAt.trim() ? parseHours(hoursAt) : null
  const valid = (!hoursAt.trim() || h !== null) && (!!intervalId || note.trim().length > 0)

  const submit = () => {
    const content = { partId, intervalId: intervalId ?? null, doneOn, hoursAt: h, note }
    record.mutate(
      { ...content, clientId: sub.id(content) },
      {
        onSuccess: (res) => {
          toast.success(isQueued(res) ? KEPT_MESSAGE : 'Maintenance recorded')
          sub.next()
          onDone?.()
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`svc-on-${intervalId ?? partId}`}>Done on</Label>
          <Input id={`svc-on-${intervalId ?? partId}`} type="date" value={doneOn} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => setDoneOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`svc-h-${intervalId ?? partId}`}>At … running hours</Label>
          <Input id={`svc-h-${intervalId ?? partId}`} inputMode="decimal" value={hoursAt} onChange={(e) => setHoursAt(e.target.value)} />
        </div>
      </div>
      <Label htmlFor={`svc-note-${intervalId ?? partId}`}>{intervalId ? 'Note (optional)' : 'What was done'}</Label>
      <Input id={`svc-note-${intervalId ?? partId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={intervalId ? 'Racor filters changed too' : 'Impeller replaced'} />
      <Button size="sm" className="self-start" disabled={!valid || record.isPending} onClick={submit}>
        {record.isPending ? 'Recording…' : 'Record as done'}
      </Button>
    </div>
  )
}

/** Each interval with what it needs next; open one for its history and actions. */
export function DueList({
  rows,
  record,
  parts,
  showPart = true,
}: {
  rows: ServiceDue[]
  record: MaintenanceRecord | undefined
  parts: Part[]
  showPart?: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) return <p className="text-sm" style={muted}>No service intervals yet.</p>
  return (
    <ul className="flex flex-col divide-y">
      {rows.map((r) => (
        <DueRow
          key={r.interval_id}
          row={r}
          record={record}
          parts={parts}
          showPart={showPart}
          open={open === r.interval_id}
          onToggle={() => setOpen((o) => (o === r.interval_id ? null : r.interval_id))}
        />
      ))}
    </ul>
  )
}

function DueRow({
  row,
  record,
  parts,
  showPart,
  open,
  onToggle,
}: {
  row: ServiceDue
  record: MaintenanceRecord | undefined
  parts: Part[]
  showPart: boolean
  open: boolean
  onToggle: () => void
}) {
  const { can } = usePermissions()
  const retire = useRetireServiceInterval()
  const voidService = useVoidServiceRecord()
  const [mode, setMode] = useState<'none' | 'done' | 'edit'>('none')
  const interval = record?.intervals.find((i) => i.id === row.interval_id)
  const history = (record?.services ?? []).filter((s) => s.interval_id === row.interval_id)
  const meta = STATUS_META[row.status]

  const doRetire = () => {
    const reason = window.prompt(`Why does "${row.title}" no longer apply? It is kept with its history.`)
    if (!reason?.trim()) return
    retire.mutate({ id: row.interval_id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }
  const doVoid = (s: ServiceRecord) => {
    const reason = window.prompt('Why strike this service out? It stays readable, crossed through.')
    if (!reason?.trim()) return
    voidService.mutate({ id: s.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }

  return (
    <li className="py-2 text-sm">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="mt-1.5"><StatusDot status={row.status} /></span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{row.title}</span>
          {showPart && <span style={muted}> · {row.part_name}</span>}
          <span className="block text-xs" style={muted}>
            {intervalText(row)} · <span style={{ color: row.status === 'OK' ? undefined : meta.colour }}>{meta.label}: {dueText(row)}</span>
          </span>
          {row.last_done_on && (
            <span className="block text-xs" style={muted}>
              Last {row.last_is_baseline ? 'done (before YAM)' : 'done'} {day(row.last_done_on)}
              {row.last_hours != null && ` at ${hours(row.last_hours)}`}
              {row.hours_now != null && ` · meter now ${hours(row.hours_now)}`}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 pl-5">
          <div className="flex flex-wrap gap-1">
            {can('action_record_service') && (
              <Button size="sm" variant={mode === 'done' ? 'default' : 'outline'} onClick={() => setMode((m) => (m === 'done' ? 'none' : 'done'))}>
                Record as done
              </Button>
            )}
            {can('action_set_service_interval') && interval && (
              <>
                <Button size="sm" variant={mode === 'edit' ? 'default' : 'outline'} onClick={() => setMode((m) => (m === 'edit' ? 'none' : 'edit'))}>
                  Change interval
                </Button>
                <Button size="sm" variant="ghost" onClick={doRetire} disabled={retire.isPending}>
                  Retire
                </Button>
              </>
            )}
          </div>
          {mode === 'done' && <ServiceForm partId={row.part_id} intervalId={row.interval_id} hoursNow={row.hours_now} onDone={() => setMode('none')} />}
          {mode === 'edit' && interval && <IntervalForm parts={parts} interval={interval} onDone={() => setMode('none')} />}
          {interval?.notes && <p className="text-xs" style={muted}>{interval.notes}</p>}
          <ServiceHistory services={history} onVoid={can('action_record_service') ? doVoid : undefined} />
        </div>
      )}
    </li>
  )
}

/** Services done, newest first; struck-out ones stay, crossed through, with the reason. */
export function ServiceHistory({ services, onVoid }: { services: ServiceRecord[]; onVoid?: (s: ServiceRecord) => void }) {
  if (services.length === 0) return <p className="text-xs" style={muted}>Nothing done yet.</p>
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {services.map((s) => (
        <li key={s.id} className="flex items-start gap-2">
          <span className={`min-w-0 flex-1 ${s.voided_at ? 'line-through opacity-60' : ''}`}>
            {day(s.done_on)}
            {s.hours_at != null && ` at ${hours(s.hours_at)}`}
            {s.is_baseline ? ' · before YAM' : ''}
            {s.note && !s.is_baseline && ` · ${s.note}`}
            <span style={muted}> · {s.recorded_by_name}</span>
          </span>
          {s.voided_at ? (
            <span style={{ color: 'hsl(var(--destructive))' }}>struck out: {s.void_reason}</span>
          ) : (
            onVoid && (
              <button type="button" className="opacity-60 hover:opacity-100" aria-label="Strike out service" onClick={() => onVoid(s)}>
                <Ban size={12} />
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  )
}

/** Readings, newest first; struck-out ones stay with the reason. */
export function ReadingsList({ readings, parts, limit = 20 }: { readings: PartReading[]; parts: Part[]; limit?: number }) {
  const { can } = usePermissions()
  const voidReading = useVoidReading()
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])
  if (readings.length === 0) return <p className="text-xs" style={muted}>No readings yet.</p>
  const doVoid = (r: PartReading) => {
    const reason = window.prompt('Why strike this reading out? It stays readable, crossed through.')
    if (!reason?.trim()) return
    voidReading.mutate({ id: r.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {readings.slice(0, limit).map((r) => (
        <li key={r.id} className="flex items-start gap-2">
          <span className={`min-w-0 flex-1 ${r.voided_at ? 'line-through opacity-60' : ''}`}>
            <span className="font-mono">{format(parseISO(r.read_at), 'd MMM HH:mm')}</span> · {byId.get(r.part_id)?.name ?? 'part'}:{' '}
            <span className="font-medium">{Number(r.value).toLocaleString('en-GB')} {r.unit}</span>
            {r.reset_reason && <span style={{ color: 'hsl(35 80% 40%)' }}> · meter reset: {r.reset_reason}</span>}
            {r.note && ` · ${r.note}`}
            <span style={muted}> · {r.recorded_by_name}</span>
          </span>
          {r.voided_at ? (
            <span style={{ color: 'hsl(var(--destructive))' }}>struck out: {r.void_reason}</span>
          ) : (
            can('action_record_reading') && (
              <button type="button" className="opacity-60 hover:opacity-100" aria-label="Strike out reading" onClick={() => doVoid(r)}>
                <Ban size={12} />
              </button>
            )
          )}
        </li>
      ))}
    </ul>
  )
}
