import { useEffect, useMemo, useState } from 'react'
import { KEPT_MESSAGE, isQueued } from '@/lib/outbox'
import { Link } from 'react-router-dom'
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isAfter,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Printer, Ban, AlertCircle, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  useAddLogEntry,
  useCrew,
  useDefects,
  useLogDays,
  useLogEntries,
  usePermissions,
  useProject,
  useMyRole,
  useRaiseNcrFromEntry,
  useRecordLogDay,
  useVoidLogEntry,
} from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import { useOutbox } from '@/hooks/useOutbox'
import { useProjectId } from '@/contexts/ProjectContext'
import type { LogDayWithCrew } from '@/lib/db'
import type { AttendanceStatus, Crew, DefectRecord, LogEntry, LogEntryKind, LogStatus } from '@/lib/types'

// The boat's logbook (migration 032).
//
// One page, built for a phone on deck: the month as a calendar coloured by
// what the boat did each day, the selected day's record (status, position,
// ports, miles, who was aboard), and that day's timestamped entries. A day is
// one fact saved in one go; an entry is never edited, only struck out with a
// reason, and stays readable. Days left blank are counted, because a logbook
// with holes is the first thing a surveyor or an insurer asks about.

const muted = { color: 'hsl(var(--muted-foreground))' }
const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

const STATUS: Record<LogStatus, { label: string; short: string; bg: string; fg: string }> = {
  SEA_SERVICE: { label: 'Sea service', short: 'Sea', bg: 'hsl(210 80% 92%)', fg: 'hsl(210 70% 30%)' },
  STANDBY: { label: 'Standby', short: 'Stby', bg: 'hsl(40 90% 90%)', fg: 'hsl(35 70% 30%)' },
  YARD: { label: 'Yard', short: 'Yard', bg: 'hsl(215 15% 88%)', fg: 'hsl(215 20% 30%)' },
}

const ATTENDANCE: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'PRESENT', label: 'Aboard' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'ABSENT', label: 'Away' },
]

const KINDS: Array<{ value: LogEntryKind; label: string }> = [
  { value: 'NOTE', label: 'Note' },
  { value: 'NAVIGATION', label: 'Navigation' },
  { value: 'ENGINE', label: 'Engine' },
  { value: 'DEFECT', label: 'Defect' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'BUNKERING', label: 'Bunkering' },
  { value: 'WEATHER', label: 'Weather' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
]
const kindLabel = (k: LogEntryKind) => KINDS.find((x) => x.value === k)?.label ?? k

/** Crew who were on the boat on a date: joined by then and not yet left. */
const onBoardOn = (c: Crew, date: string) => (!c.joined_on || c.joined_on <= date) && (!c.left_on || c.left_on >= date)

export default function LogbookPage() {
  const { data: project } = useProject()
  const { can } = usePermissions()
  const { data: role = null } = useMyRole()
  const canWrite = can('action_record_log_day')
  const canNote = can('action_add_log_entry')
  const canRaise = can('action_raise_ncr_from_entry')

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => ymd(new Date()))
  const from = ymd(startOfMonth(month))
  const to = ymd(endOfMonth(month))
  const { data: days = [], isLoading } = useLogDays(from, to)
  const { data: crew = [] } = useCrew()
  const byDate = useMemo(() => new Map(days.map((d) => [d.log_date, d])), [days])

  const today = startOfDay(new Date())
  const monthDays = useMemo(() => {
    const out: Date[] = []
    for (let d = startOfMonth(month); d <= endOfMonth(month); d = addDays(d, 1)) out.push(d)
    return out
  }, [month])
  // Days of this month that are over and have nothing recorded. Today does
  // not count until it ends.
  const missing = monthDays.filter((d) => d < today && !byDate.has(ymd(d))).length
  const seaDays = days.filter((d) => d.status === 'SEA_SERVICE').length
  const miles = days.reduce((s, d) => s + Number(d.nautical_miles ?? 0), 0)

  if (project && project.project_type !== 'OPERATIONS') {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          The logbook belongs to a boat, not to a project of work. Open it from{' '}
          <Link to="/app/project" className="underline">the project overview</Link>, or switch to the
          boat's logbook in the project menu.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{project?.vessel?.name ?? 'Logbook'}</h1>
          <p className="text-sm" style={muted}>
            {format(month, 'MMMM yyyy')}: {seaDays} day{seaDays === 1 ? '' : 's'} at sea · {miles.toLocaleString('en-GB')} nm
            {missing > 0 && (
              <span style={{ color: 'hsl(var(--destructive))' }}>
                {' '}· {missing} day{missing === 1 ? '' : 's'} not logged
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMonth(startOfMonth(new Date()))
              setSelected(ymd(new Date()))
            }}
          >
            Today
          </Button>
          <Button size="icon" variant="outline" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="ml-1">
            <Printer size={14} className="mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start print:hidden">
        <MonthGrid month={month} byDate={byDate} selected={selected} onSelect={setSelected} loading={isLoading} />
        <div className="flex flex-col gap-4">
          <DayEditor
            key={`${selected}:${byDate.get(selected)?.updated_at ?? byDate.get(selected)?.created_at ?? 'new'}`}
            date={selected}
            day={byDate.get(selected) ?? null}
            crew={crew}
            canWrite={canWrite}
          />
          <Entries date={selected} canNote={canNote} canRaise={canRaise} isCaptain={role === 'CAPTAIN'} />
        </div>
      </div>

      <PrintMonth month={month} monthDays={monthDays} byDate={byDate} vesselName={project?.vessel?.name ?? ''} />
    </div>
  )
}

function MonthGrid({
  month,
  byDate,
  selected,
  onSelect,
  loading,
}: {
  month: Date
  byDate: Map<string, LogDayWithCrew>
  selected: string
  onSelect: (d: string) => void
  loading: boolean
}) {
  const today = startOfDay(new Date())
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const cells: Date[] = []
  for (let d = start; d <= endOfMonth(month) || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d)
  return (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium" style={muted}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const key = ymd(d)
            const inMonth = d.getMonth() === month.getMonth()
            const day = byDate.get(key)
            const future = isAfter(d, today)
            const gap = inMonth && d < today && !day && !loading
            const s = day ? STATUS[day.status] : null
            const isSel = key === selected
            return (
              <button
                key={key}
                type="button"
                disabled={!inMonth}
                onClick={() => onSelect(key)}
                aria-label={`${format(d, 'd MMMM')}${s ? `, ${s.label}` : gap ? ', not logged' : ''}`}
                aria-pressed={isSel}
                className="flex min-h-[56px] flex-col items-start rounded-md border p-1 text-left text-xs transition-colors sm:min-h-[72px]"
                style={{
                  visibility: inMonth ? 'visible' : 'hidden',
                  background: s ? s.bg : undefined,
                  color: s ? s.fg : undefined,
                  borderColor: isSel ? 'hsl(var(--accent))' : gap ? 'hsl(var(--destructive) / 0.5)' : 'hsl(var(--border))',
                  borderStyle: gap ? 'dashed' : 'solid',
                  borderWidth: isSel ? 2 : 1,
                  opacity: future ? 0.5 : 1,
                }}
              >
                <span className="font-semibold">{format(d, 'd')}</span>
                {s && <span className="mt-auto text-[10px] font-medium">{s.short}</span>}
                {day && Number(day.nautical_miles) > 0 && (
                  <span className="text-[10px]">{Number(day.nautical_miles)} nm</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]" style={muted}>
          {(Object.keys(STATUS) as LogStatus[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS[k].bg, border: `1px solid ${STATUS[k].fg}` }} />
              {STATUS[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed" style={{ borderColor: 'hsl(var(--destructive))' }} />
            Not logged
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function DayEditor({ date, day, crew, canWrite }: { date: string; day: LogDayWithCrew | null; crew: Crew[]; canWrite: boolean }) {
  const record = useRecordLogDay()
  const [status, setStatus] = useState<LogStatus>(day?.status ?? 'STANDBY')
  const [position, setPosition] = useState(day?.position ?? '')
  const [portFrom, setPortFrom] = useState(day?.port_from ?? '')
  const [portTo, setPortTo] = useState(day?.port_to ?? '')
  const [miles, setMiles] = useState(day ? String(Number(day.nautical_miles)) : '0')
  const [watch, setWatch] = useState(day?.watchkeeping ?? false)
  const [notes, setNotes] = useState(day?.notes ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recorded = useMemo(() => new Map((day?.log_day_crew ?? []).map((r) => [r.crew_id, r.attendance])), [day])
  // Everyone on the boat that day, plus anyone already recorded for it.
  const people = crew.filter((c) => onBoardOn(c, date) || recorded.has(c.id))
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries(people.map((c) => [c.id, recorded.get(c.id) ?? 'PRESENT'])),
  )
  // Crew loaded after the day: give them a default without overwriting choices.
  useEffect(() => {
    setAttendance((a) => {
      const next = { ...a }
      for (const c of people) if (!(c.id in next)) next[c.id] = recorded.get(c.id) ?? 'PRESENT'
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length])

  const d = parseISO(date)
  const today = startOfDay(new Date())
  const passed = d < addDays(today, -1)
  const future = isAfter(d, addDays(today, 1))
  const needsReason = !!day && passed
  const nm = Number(miles)
  const valid = !future && Number.isFinite(nm) && nm >= 0 && nm <= 2000 && (!needsReason || reason.trim().length > 0)

  const save = () => {
    setError(null)
    record.mutate(
      {
        date,
        status,
        position,
        portFrom,
        portTo,
        nauticalMiles: nm,
        watchkeeping: watch,
        notes,
        attendance: people.map((c) => ({ crew_id: c.id, attendance: attendance[c.id] ?? 'PRESENT' })),
        reason: needsReason ? reason.trim() : undefined,
      },
      {
        onSuccess: (res) => toast.success(isQueued(res) ? KEPT_MESSAGE : `${format(d, 'd MMM')} saved`),
        onError: (e) => setError(e.message),
      },
    )
  }

  const readOnly = !canWrite || future
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{format(d, 'EEEE d MMMM yyyy')}</h2>
          {day ? (
            <span className="text-[11px]" style={muted}>
              {day.updated_by_name ? `changed by ${day.updated_by_name}` : `by ${day.created_by_name ?? 'someone'}`}
            </span>
          ) : (
            <span className="text-[11px]" style={muted}>{future ? 'not yet' : 'not logged'}</span>
          )}
        </div>
        {day?.status === 'YARD' && (
          <p className="text-[11px]" style={muted}>
            {day.refit_project_id
              ? 'Counts as a yard day of the refit under way: its team sees the date, port and how many were aboard, not the notes.'
              : 'No refit under way on this boat for this day, so it is not counted toward one.'}
          </p>
        )}

        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Status">
          {(Object.keys(STATUS) as LogStatus[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={status === k}
              disabled={readOnly}
              onClick={() => setStatus(k)}
              className="rounded-md border px-2 py-2 text-sm font-medium"
              style={{
                background: status === k ? STATUS[k].bg : undefined,
                color: status === k ? STATUS[k].fg : undefined,
                borderColor: status === k ? STATUS[k].fg : 'hsl(var(--border))',
              }}
            >
              {STATUS[k].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="lb-from" className="text-xs">From</Label>
            <Input id="lb-from" value={portFrom} onChange={(e) => setPortFrom(e.target.value)} disabled={readOnly} placeholder="Port of departure" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lb-to" className="text-xs">To</Label>
            <Input id="lb-to" value={portTo} onChange={(e) => setPortTo(e.target.value)} disabled={readOnly} placeholder="Destination" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lb-pos" className="text-xs">Position or anchorage</Label>
            <Input id="lb-pos" value={position} onChange={(e) => setPosition(e.target.value)} disabled={readOnly} placeholder="e.g. Cala d'Or, 39°22'N 3°14'E" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lb-nm" className="text-xs">Nautical miles</Label>
            <Input id="lb-nm" type="number" inputMode="decimal" min={0} max={2000} value={miles} onChange={(e) => setMiles(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={watch} onCheckedChange={setWatch} disabled={readOnly} />
          Watchkeeping day
        </label>

        <div className="flex flex-col gap-1">
          <Label htmlFor="lb-notes" className="text-xs">Notes for the day</Label>
          <Textarea id="lb-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
        </div>

        {people.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-medium">Who was aboard</div>
            <ul className="divide-y rounded-md border">
              {people.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {c.first_name} {c.last_name}
                    <span className="ml-1 text-xs" style={muted}>{c.position}</span>
                  </span>
                  <div className="flex gap-0.5">
                    {ATTENDANCE.map((a) => (
                      <button
                        key={a.value}
                        type="button"
                        disabled={readOnly}
                        onClick={() => setAttendance((x) => ({ ...x, [c.id]: a.value }))}
                        aria-pressed={attendance[c.id] === a.value}
                        className="rounded px-1.5 py-0.5 text-[11px]"
                        style={{
                          background: attendance[c.id] === a.value ? 'hsl(var(--accent) / 0.15)' : undefined,
                          color: attendance[c.id] === a.value ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))',
                          fontWeight: attendance[c.id] === a.value ? 600 : 400,
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {people.length === 0 && (
          <p className="text-xs" style={muted}>
            No crew recorded for this day. <Link to="/app/crew" className="underline">Add the crew</Link> to log who
            was aboard.
          </p>
        )}

        {needsReason && canWrite && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="lb-reason" className="text-xs">Why is this past day being changed? (required)</Label>
            <Input id="lb-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. miles entered for the wrong day" />
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 text-xs" style={{ color: 'hsl(var(--destructive))' }}>
            <AlertCircle size={13} className="mt-px flex-shrink-0" /> {error}
          </p>
        )}

        {canWrite ? (
          <Button onClick={save} disabled={!valid || record.isPending}>
            {record.isPending ? 'Saving…' : day ? 'Save changes' : 'Log this day'}
          </Button>
        ) : (
          <p className="text-xs" style={muted}>The captain and crew keep the log; you can read it.</p>
        )}
      </CardContent>
    </Card>
  )
}

function Entries({
  date,
  canNote,
  canRaise,
  isCaptain,
}: {
  date: string
  canNote: boolean
  canRaise: boolean
  isCaptain: boolean
}) {
  const { user } = useAuth()
  const { data: defects = [] } = useDefects()
  const dayStart = parseISO(date)
  const fromIso = dayStart.toISOString()
  const toIso = addDays(dayStart, 1).toISOString()
  const { data: entries = [] } = useLogEntries(fromIso, toIso)
  const projectId = useProjectId()
  // Entries written without signal, kept on this device until sent.
  const { items: outbox } = useOutbox()
  const kept = outbox.filter((i) => {
    if (i.kind !== 'log_entry' || i.projectId !== projectId) return false
    const at = String(i.payload.occurredAt ?? i.createdAt)
    return at >= fromIso && at < toIso
  })
  const add = useAddLogEntry()
  const strike = useVoidLogEntry()
  const isToday = date === ymd(new Date())
  const [kind, setKind] = useState<LogEntryKind>('NOTE')
  const [time, setTime] = useState(() => (isToday ? format(new Date(), 'HH:mm') : '12:00'))
  const [body, setBody] = useState('')

  const submit = () => {
    const [h, m] = time.split(':').map(Number)
    const at = new Date(dayStart)
    at.setHours(h || 0, m || 0, 0, 0)
    add.mutate(
      { body: body.trim(), kind, occurredAt: at.toISOString() },
      {
        onSuccess: (res) => {
          if (isQueued(res)) toast.success(KEPT_MESSAGE)
          setBody('')
          if (isToday) setTime(format(new Date(), 'HH:mm'))
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  const strikeOut = (e: LogEntry) => {
    const reason = window.prompt('Why strike this entry out? It stays readable, crossed through.')
    if (!reason?.trim()) return
    strike.mutate({ id: e.id, reason: reason.trim() }, { onError: (err) => toast.error(err.message) })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <h3 className="text-sm font-semibold">Entries</h3>
        {kept.length > 0 && (
          <ul className="flex flex-col gap-2">
            {kept.map((i) => (
              <li key={i.id} className="rounded-md border border-dashed p-2 text-sm">
                <div className="flex items-center gap-2 text-[11px]" style={muted}>
                  <span className="font-mono">{format(parseISO(String(i.payload.occurredAt ?? i.createdAt)), 'HH:mm')}</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{kindLabel(i.payload.kind as LogEntryKind)}</Badge>
                  <span style={{ color: i.status === 'failed' ? 'hsl(var(--destructive))' : 'hsl(35 80% 35%)' }}>
                    {i.status === 'failed' ? `refused: ${i.lastError}` : 'kept on this device, not sent yet'}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{String(i.payload.body ?? '')}</p>
              </li>
            ))}
          </ul>
        )}
        {entries.length === 0 && kept.length === 0 ? (
          <p className="text-xs" style={muted}>Nothing written for this day.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {entries.map((e) => {
              const mine = !!user && e.author_id === user.id
              return (
                <li key={e.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2 text-[11px]" style={muted}>
                    <span className="font-mono">{format(parseISO(e.occurred_at), 'HH:mm')}</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{kindLabel(e.kind)}</Badge>
                    <span className="min-w-0 flex-1 truncate">{e.author_name}</span>
                    {!e.voided_at && canNote && (mine || isCaptain) && (
                      <button type="button" onClick={() => strikeOut(e)} className="flex items-center gap-0.5 hover:underline" aria-label="Strike out">
                        <Ban size={11} /> Strike out
                      </button>
                    )}
                  </div>
                  <p className={`mt-1 whitespace-pre-wrap ${e.voided_at ? 'line-through opacity-60' : ''}`}>{e.body}</p>
                  {e.voided_at && (
                    <p className="mt-1 text-[11px]" style={{ color: 'hsl(var(--destructive))' }}>
                      Struck out by {e.voided_by_name}: {e.void_reason}
                    </p>
                  )}
                  {e.kind === 'DEFECT' && !e.voided_at && (
                    <DefectLink entry={e} defect={defects.find((d) => d.id === e.defect_id) ?? null} canRaise={canRaise} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {canNote && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex gap-2">
              <select
                aria-label="Kind of entry"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as LogEntryKind)}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
              <Input aria-label="Time" type="time" className="h-9 w-28" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened" />
            <Button size="sm" className="self-end" disabled={!body.trim() || add.isPending} onClick={submit}>
              {add.isPending ? 'Writing…' : 'Add entry'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The month as a table, shown only when printing (or saving as PDF). */
const SEVERITIES: Array<DefectRecord['severity']> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

/** A defect entry's NCR: a link once raised, otherwise a one-step "Raise NCR" (migration 034). */
function DefectLink({ entry, defect, canRaise }: { entry: LogEntry; defect: DefectRecord | null; canRaise: boolean }) {
  const raise = useRaiseNcrFromEntry()
  const [open, setOpen] = useState(false)
  const [severity, setSeverity] = useState<DefectRecord['severity']>('MEDIUM')

  if (entry.defect_id) {
    return (
      <Link to="/app/defects" className="mt-1 inline-flex items-center gap-1 text-[11px] underline">
        <AlertTriangle size={11} /> {defect ? `${defect.ncr_number} · ${defect.status.replace(/_/g, ' ').toLowerCase()}` : 'NCR raised'}
      </Link>
    )
  }
  if (!canRaise) return null
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 flex items-center gap-1 text-[11px] hover:underline">
        <AlertTriangle size={11} /> Raise NCR
      </button>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label="Severity"
        className="h-8 rounded-md border bg-background px-2"
        value={severity}
        onChange={(ev) => setSeverity(ev.target.value as DefectRecord['severity'])}
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
        ))}
      </select>
      <Button
        size="sm"
        className="h-8"
        disabled={raise.isPending}
        onClick={() =>
          raise.mutate(
            { entryId: entry.id, severity },
            {
              onSuccess: (d) => {
                toast.success(`${d.ncr_number} raised`)
                setOpen(false)
              },
              onError: (err) => toast.error(err.message),
            },
          )
        }
      >
        {raise.isPending ? 'Raising…' : 'Raise NCR'}
      </Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  )
}

function PrintMonth({
  month,
  monthDays,
  byDate,
  vesselName,
}: {
  month: Date
  monthDays: Date[]
  byDate: Map<string, LogDayWithCrew>
  vesselName: string
}) {
  return (
    <div className="hidden print:block">
      <h1 className="mb-2 text-lg font-bold">
        {vesselName} · Logbook · {format(month, 'MMMM yyyy')}
      </h1>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {['Date', 'Status', 'From', 'To', 'Position', 'NM', 'Watch', 'Aboard', 'Notes'].map((h) => (
              <th key={h} className="border px-1 py-0.5 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthDays.map((d) => {
            const day = byDate.get(ymd(d))
            const aboard = day?.log_day_crew.filter((r) => r.attendance === 'PRESENT').length
            return (
              <tr key={ymd(d)}>
                <td className="border px-1 py-0.5">{format(d, 'EEE d')}</td>
                <td className="border px-1 py-0.5">{day ? STATUS[day.status].label : d < startOfDay(new Date()) ? 'not logged' : ''}</td>
                <td className="border px-1 py-0.5">{day?.port_from ?? ''}</td>
                <td className="border px-1 py-0.5">{day?.port_to ?? ''}</td>
                <td className="border px-1 py-0.5">{day?.position ?? ''}</td>
                <td className="border px-1 py-0.5 text-right">{day ? Number(day.nautical_miles) : ''}</td>
                <td className="border px-1 py-0.5">{day?.watchkeeping ? 'yes' : ''}</td>
                <td className="border px-1 py-0.5 text-right">{aboard ?? ''}</td>
                <td className="border px-1 py-0.5">{day?.notes ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
