import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, endOfMonth, format, getDaysInMonth, isSameMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Printer, ShieldCheck, ShieldAlert, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useCrew,
  useMyRole,
  usePermissions,
  useProject,
  useRecordRest,
  useRestRecords,
  useRestSummary,
  useTeam,
} from '@/lib/query-hooks'
import { useAuth } from '@/contexts/AuthContext'
import type { Crew, RestRecord } from '@/lib/types'
import {
  RULE_TEXT,
  SLOTS_PER_DAY,
  checkMonth,
  dayRow,
  describeRow,
  parseWorkRanges,
  type RestRule,
  type RestSchedule,
} from '@/lib/rest-hours'

// Hours of rest (migration 033).
//
// A month per crew member, as the STCW/MLC form has it: one row a day, 48
// half-hours, dark where the person worked. Drag across a row to mark work,
// or type the hours ("08:00-12:00, 13:00-18:00") and apply them to a day or to
// every day still blank. The rules are checked as you go with the same engine
// the server uses to judge what is saved.
//
// Private: only the crew member and the captain can read a month (RLS). Every
// one else on the boat sees counts: how many recorded, how many in breach.

const muted = { color: 'hsl(var(--muted-foreground))' }
const WORK = 'hsl(var(--primary))'
const REST = 'hsl(var(--muted))'
const RULES: RestRule[] = ['REST_24H', 'REST_7D', 'TWO_PERIODS', 'MAX_WORK_14H']

/** Crew on the boat at some point in the month. */
const aboardIn = (c: Crew, from: string, to: string) => (!c.joined_on || c.joined_on <= to) && (!c.left_on || c.left_on >= from)

export default function RestPage() {
  const { data: project } = useProject()
  const { user } = useAuth()
  const { data: role = null } = useMyRole()
  const { can } = usePermissions()
  const { data: crew = [] } = useCrew()
  const { data: team = [] } = useTeam()

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const year = month.getFullYear()
  const mon = month.getMonth() + 1
  const from = format(month, 'yyyy-MM-dd')
  const to = format(endOfMonth(month), 'yyyy-MM-dd')
  const { data: records = [], isLoading } = useRestRecords(year, mon)
  const { data: summary } = useRestSummary(year, mon)

  const isCaptain = role === 'CAPTAIN'
  // The caller's own crew row: crew.member_id points at their membership.
  const myMemberIds = useMemo(
    () => new Set(team.filter((m) => user?.email && m.email?.toLowerCase() === user.email.toLowerCase()).map((m) => m.id)),
    [team, user?.email],
  )
  const keepable = useMemo(
    () =>
      crew.filter((c) => aboardIn(c, from, to) && (isCaptain || (c.member_id !== null && myMemberIds.has(c.member_id)))),
    [crew, from, to, isCaptain, myMemberIds],
  )
  const [crewId, setCrewId] = useState<string | null>(null)
  const selected = keepable.find((c) => c.id === crewId) ?? keepable[0] ?? null
  const record = selected ? records.find((r) => r.crew_id === selected.id) ?? null : null
  const canRecord = can('action_record_rest')

  if (project && project.project_type !== 'OPERATIONS') {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          Hours of rest belong to a boat's logbook. Switch to the boat's logbook in the project menu, or open one from{' '}
          <Link to="/app/project" className="underline">the project overview</Link>.
        </CardContent>
      </Card>
    )
  }

  const isCurrent = isSameMonth(month, new Date())

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Hours of rest</h1>
          <p className="text-sm" style={muted}>
            {project?.vessel?.name ?? ''} · {format(month, 'MMMM yyyy')}
            {summary && (
              <>
                {' '}· {summary.crew_recorded} of {summary.crew_aboard} crew recorded
                {summary.crew_with_breaches > 0 && (
                  <span style={{ color: 'hsl(var(--destructive))' }}> · {summary.crew_with_breaches} with breaches</span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>
            This month
          </Button>
          {/* Months that have not begun cannot be recorded (the server refuses them too). */}
          <Button size="icon" variant="outline" aria-label="Next month" disabled={isCurrent} onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight size={16} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()} className="ml-1" disabled={!selected}>
            <Printer size={14} className="mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      {keepable.length === 0 ? (
        <Card className="print:hidden">
          <CardContent className="flex items-start gap-3 p-6 text-sm">
            <Lock size={18} className="mt-0.5 shrink-0" style={muted} />
            <div>
              Hours of rest are private: each crew member keeps their own, and the captain sees everyone's. Others on
              the boat see only the counts above.
              {!isCaptain && myMemberIds.size > 0 && (
                <> You are not on the crew list for {format(month, 'MMMM')}; ask the captain to add you on the <Link to="/app/crew" className="underline">crew page</Link>.</>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {keepable.length > 1 && (
            <div className="flex flex-wrap gap-1 print:hidden" role="tablist" aria-label="Crew member">
              {keepable.map((c) => {
                const r = records.find((x) => x.crew_id === c.id)
                const on = c.id === selected?.id
                return (
                  <Button
                    key={c.id}
                    size="sm"
                    role="tab"
                    aria-selected={on}
                    variant={on ? 'default' : 'outline'}
                    onClick={() => setCrewId(c.id)}
                  >
                    {c.first_name} {c.last_name}
                    {r && r.breach_days > 0 && <ShieldAlert size={13} className="ml-1" aria-label="has breaches" />}
                    {!r && <span className="ml-1 text-[10px] opacity-70">not recorded</span>}
                  </Button>
                )
              })}
            </div>
          )}
          {selected && (
            <MonthSheet
              // A fresh draft whenever the person, the month or the saved record changes.
              key={`${selected.id}:${year}-${mon}:${record?.updated_at ?? record?.created_at ?? 'new'}`}
              crew={selected}
              month={month}
              record={record}
              loading={isLoading}
              canRecord={canRecord}
              vesselName={project?.vessel?.name ?? ''}
            />
          )}
        </>
      )}
    </div>
  )
}

function MonthSheet({
  crew,
  month,
  record,
  loading,
  canRecord,
  vesselName,
}: {
  crew: Crew
  month: Date
  record: RestRecord | null
  loading: boolean
  canRecord: boolean
  vesselName: string
}) {
  const year = month.getFullYear()
  const mon = month.getMonth() + 1
  const days = getDaysInMonth(month)
  const today = new Date()
  // Days after today are not recorded yet: a record is what happened.
  const lastDay = isSameMonth(month, today) ? today.getDate() : days

  const [draft, setDraft] = useState<RestSchedule>(() => (record?.schedule as RestSchedule | null) ?? {})
  const [dirty, setDirty] = useState(false)
  const [selDay, setSelDay] = useState(Math.min(lastDay, days))
  const [hours, setHours] = useState('08:00-12:00, 13:00-18:00')
  const [reason, setReason] = useState('')
  const save = useRecordRest()
  const result = useMemo(() => checkMonth(draft, days), [draft, days])
  const breachDays = new Set(result.breachDays)

  const update = (fn: (s: RestSchedule) => RestSchedule) => {
    setDraft((s) => fn({ ...s }))
    setDirty(true)
  }

  // Drag painting: the first cell pressed decides whether the drag marks work or rest.
  const paint = useRef<boolean | null>(null)
  useEffect(() => {
    const stop = () => (paint.current = null)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])
  const setSlot = (day: number, slot: number, value: boolean) =>
    update((s) => {
      const row = [...(dayRow(s, day) ?? Array<boolean>(SLOTS_PER_DAY).fill(false))]
      row[slot] = value
      s[String(day)] = row
      return s
    })

  const applyHours = (target: 'day' | 'blank') => {
    const row = parseWorkRanges(hours)
    if (!row) {
      toast.error('Write the work as hours, e.g. 08:00-12:00, 13:00-18:00 (on the hour or half hour)')
      return
    }
    update((s) => {
      for (let d = 1; d <= lastDay; d++) {
        if (target === 'day' ? d === selDay : !dayRow(s, d)) s[String(d)] = [...row]
      }
      return s
    })
  }
  const clearDay = () =>
    update((s) => {
      delete s[String(selDay)]
      return s
    })

  const onSave = async () => {
    try {
      await save.mutateAsync({ crewId: crew.id, year, month: mon, schedule: draft, reason })
      setDirty(false)
      toast.success('Hours of rest saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    }
  }

  const recordedDays = result.days.filter((d) => d.recorded).length
  const byRule = RULES.map((rule) => ({ rule, days: result.breaches.filter((b) => b.rule === rule).map((b) => b.day) })).filter(
    (r) => r.days.length,
  )

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start print:hidden">
        <Card>
          <CardContent className="p-3">
            {loading ? (
              <p className="p-4 text-sm" style={muted}>Loading…</p>
            ) : (
              // The grid scrolls sideways on a phone rather than shrinking the half-hours past tapping size.
              <div className="overflow-x-auto">
                <div className="min-w-[560px] select-none" style={{ touchAction: 'none' }}>
                  <div className="flex text-[9px]" style={muted}>
                    <div className="w-9 shrink-0" />
                    <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h}>{h % 2 === 0 ? String(h).padStart(2, '0') : ''}</div>
                      ))}
                    </div>
                    <div className="w-16 shrink-0 text-right">rest</div>
                  </div>
                  {result.days.map(({ day, recorded, restHours }) => {
                    const row = dayRow(draft, day)
                    const future = day > lastDay
                    const editable = canRecord && !future
                    return (
                      <div key={day} className="flex items-center" style={{ opacity: future ? 0.35 : 1 }}>
                        <button
                          type="button"
                          className="w-9 shrink-0 rounded text-left text-[11px] font-medium"
                          style={{
                            background: day === selDay ? 'hsl(var(--accent))' : undefined,
                            color: breachDays.has(day) ? 'hsl(var(--destructive))' : undefined,
                          }}
                          disabled={future}
                          onClick={() => setSelDay(day)}
                          aria-label={`Day ${day}${row ? `: work ${describeRow(row) || 'none'}` : ', not recorded'}${breachDays.has(day) ? ', breach' : ''}`}
                        >
                          {day}
                        </button>
                        <div
                          className="grid h-5 flex-1 gap-px py-px"
                          style={{ gridTemplateColumns: `repeat(${SLOTS_PER_DAY}, minmax(0, 1fr))` }}
                        >
                          {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
                            <div
                              key={slot}
                              className={slot % 2 === 0 ? 'rounded-l-sm' : 'rounded-r-sm'}
                              style={{
                                background: row ? (row[slot] ? WORK : REST) : 'transparent',
                                // Blank past days are outlined (a gap in the record); days to come are left empty.
                                border: row || future ? undefined : '1px dashed hsl(var(--border))',
                                cursor: editable ? 'pointer' : 'default',
                              }}
                              onPointerDown={(e) => {
                                if (!editable) return
                                e.preventDefault()
                                // Touch captures the pointer on the first cell; release it so
                                // the cells the finger crosses get pointerenter too.
                                const el = e.currentTarget
                                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
                                setSelDay(day)
                                paint.current = !(row?.[slot] ?? false)
                                setSlot(day, slot, paint.current)
                              }}
                              onPointerEnter={() => {
                                if (editable && paint.current !== null) setSlot(day, slot, paint.current)
                              }}
                            />
                          ))}
                        </div>
                        <div
                          className="w-16 shrink-0 text-right text-[11px] tabular-nums"
                          style={{ color: breachDays.has(day) ? 'hsl(var(--destructive))' : undefined }}
                        >
                          {recorded ? `${restHours} h` : future ? '' : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* On a phone the controls come first: typing the hours is easier there than tapping half-hours. */}
        <div className="order-first flex flex-col gap-4 lg:order-none">
          <Card>
            <CardContent className="flex flex-col gap-2 p-4 text-sm">
              <div className="font-semibold">
                {crew.first_name} {crew.last_name}
                <span className="font-normal" style={muted}> · {crew.position}</span>
              </div>
              <div style={muted}>
                {recordedDays} of {lastDay} day{lastDay === 1 ? '' : 's'} recorded
                {record?.updated_by_name && ` · last saved by ${record.updated_by_name}`}
              </div>
              {canRecord ? (
                <>
                  <Label htmlFor="rest-hours" className="mt-2">Work hours</Label>
                  <Input id="rest-hours" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="08:00-12:00, 13:00-18:00" />
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => applyHours('day')}>
                      Apply to day {selDay}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyHours('blank')}>
                      Apply to blank days
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearDay} disabled={!dayRow(draft, selDay)}>
                      Clear day {selDay}
                    </Button>
                  </div>
                  {record && (
                    <>
                      <Label htmlFor="rest-reason" className="mt-2">Reason for the change (optional)</Label>
                      <Input id="rest-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                    </>
                  )}
                  <Button className="mt-2" onClick={onSave} disabled={!dirty || save.isPending}>
                    {save.isPending ? 'Saving…' : record ? 'Save changes' : 'Save month'}
                  </Button>
                  {record && <p className="text-xs" style={muted}>The previous version is kept.</p>}
                </>
              ) : (
                <p style={muted}>Your role can read this record but not change it.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2 p-4 text-sm">
              {byRule.length === 0 ? (
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} style={{ color: 'hsl(142 60% 35%)' }} />
                  {recordedDays ? 'Within the rules on every recorded day' : 'Nothing recorded yet'}
                </div>
              ) : (
                byRule.map(({ rule, days: ds }) => (
                  <div key={rule} className="flex items-start gap-2">
                    <ShieldAlert size={16} className="mt-0.5 shrink-0" style={{ color: 'hsl(var(--destructive))' }} />
                    <div>
                      {RULE_TEXT[rule]}
                      <div className="text-xs" style={muted}>Day{ds.length === 1 ? '' : 's'} {ds.join(', ')}</div>
                    </div>
                  </div>
                ))
              )}
              <p className="text-xs" style={muted}>
                STCW A-VIII/1 and MLC 2006 A2.3. Blank days are not counted as rest; windows that touch one are not
                judged.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <PrintSheet crew={crew} month={month} draft={draft} days={days} breaches={result.breaches} vesselName={vesselName} />
    </>
  )
}

/** The month as the paper form: work periods, rest totals, breaches and signatures. */
function PrintSheet({
  crew,
  month,
  draft,
  days,
  breaches,
  vesselName,
}: {
  crew: Crew
  month: Date
  draft: RestSchedule
  days: number
  breaches: Array<{ day: number; rule: RestRule }>
  vesselName: string
}) {
  return (
    <div className="hidden print:block">
      <h1 className="mb-1 text-lg font-bold">
        {vesselName} · Hours of rest · {format(month, 'MMMM yyyy')}
      </h1>
      <p className="mb-2 text-xs">
        {crew.first_name} {crew.last_name} · {crew.position}
      </p>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {['Date', 'Hours of work', 'Work (h)', 'Rest (h)', 'Breach'].map((h) => (
              <th key={h} className="border px-1 py-0.5 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const row = dayRow(draft, day)
            const work = row ? row.filter(Boolean).length / 2 : null
            const rules = breaches.filter((b) => b.day === day).map((b) => b.rule.replace('_', ' '))
            return (
              <tr key={day}>
                <td className="border px-1 py-0.5">{format(new Date(month.getFullYear(), month.getMonth(), day), 'EEE d')}</td>
                <td className="border px-1 py-0.5">{row ? describeRow(row) || 'none' : 'not recorded'}</td>
                <td className="border px-1 py-0.5 text-right">{work ?? ''}</td>
                <td className="border px-1 py-0.5 text-right">{work === null ? '' : 24 - work}</td>
                <td className="border px-1 py-0.5">{rules.join(', ')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t pt-1">Crew member</div>
        <div className="border-t pt-1">Master</div>
      </div>
    </div>
  )
}
