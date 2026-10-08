import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCheck, Flag, Gavel, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fromDay, planForDrop, toDay, type ScheduleItem, type ScheduleResult } from '@/lib/schedule'
import { STATUS_COLOR } from './Gantt'
import { plural, shortDate } from './scale'

// The schedule as a month calendar.
//
// The same record as the Gantt, laid out the way people plan a week: every
// work package is a bar across the days it will really take (the engine's
// forecast), and the other dated objects of the model sit on their day —
// inspections booked, owner decisions due, action items due, the project's
// milestones. Dragging a bar to another day calls the same Action through the
// same translation as the Gantt (planForDrop), so the two views cannot
// disagree about what a move means.

export interface CalendarEvent {
  id: string
  day: number
  kind: 'inspection' | 'approval' | 'action' | 'milestone'
  label: string
  tone: 'ok' | 'warn' | 'bad' | 'neutral'
  /** Where tapping it goes. */
  href?: string
}

interface Props {
  schedule: ScheduleResult
  events: CalendarEvent[]
  editable: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onReschedule: (id: string, start: number, end: number, adjusted?: string | null) => void
  onOpen: (href: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TONE: Record<CalendarEvent['tone'], string> = {
  ok: 'hsl(152 55% 40%)',
  warn: 'hsl(38 90% 45%)',
  bad: 'hsl(0 72% 51%)',
  neutral: 'hsl(215 20% 50%)',
}
const ICON = { inspection: ClipboardCheck, approval: Gavel, action: ListChecks, milestone: Flag }
const LANES = 3
const LANE_H = 18
const HEAD_H = 22

/** Monday on or before a day number (day 0 was a Thursday). */
const mondayOf = (day: number) => day - ((new Date(day * 86_400_000).getUTCDay() + 6) % 7)

interface Grab {
  id: string
  /** The day of the bar that was grabbed, so it moves under the pointer. */
  grabDay: number
  hoverDay: number
  moved: boolean
}

export default function ScheduleCalendar({ schedule, events, editable, selectedId, onSelect, onReschedule, onOpen }: Props) {
  const today = schedule.today
  const [month, setMonth] = useState(() => fromDay(today).slice(0, 7))
  const [pickedDay, setPickedDay] = useState<number | null>(today)
  const [grab, setGrab] = useState<Grab | null>(null)
  const grabRef = useRef<Grab | null>(null)
  grabRef.current = grab

  const first = toDay(`${month}-01`)!
  const gridStart = mondayOf(first)
  const weeks = Array.from({ length: 6 }, (_, w) => gridStart + w * 7)
  const [y, m] = month.split('-').map(Number)

  const shiftMonth = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }

  const bars = useMemo(
    () => schedule.items.filter((i) => i.forecastStart !== null && i.forecastEnd !== null),
    [schedule.items],
  )
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>()
    for (const e of events) map.set(e.day, [...(map.get(e.day) ?? []), e])
    return map
  }, [events])

  // While dragging, the days the bar will occupy once saved.
  const preview = useMemo(() => {
    if (!grab?.moved) return null
    const it = schedule.byId[grab.id]
    const plan = it && planForDrop(it, 'move', grab.hoverDay - grab.grabDay, today)
    if (!it || !plan) return null
    const s = it.started ? it.forecastStart! : plan.start
    const e = it.started ? Math.max(plan.end + it.delayDays, today, s) : plan.end + it.delayDays
    return { s, e }
  }, [grab, schedule.byId, today])

  const dayAt = (clientX: number, clientY: number): number | null => {
    // The bar being dragged sits on top of the day cells: look through it.
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const cell = (el as HTMLElement).closest?.('[data-day]') as HTMLElement | null
      if (cell) return Number(cell.dataset.day)
    }
    return null
  }

  const begin = (e: ReactPointerEvent, it: ScheduleItem) => {
    e.stopPropagation()
    if (!editable || it.complete) {
      onSelect(it.id)
      return
    }
    // A swipe on a phone scrolls the page: pick a bar up only once selected.
    if (e.pointerType === 'touch' && selectedId !== it.id) {
      onSelect(it.id)
      return
    }
    const d = dayAt(e.clientX, e.clientY)
    if (d === null) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setGrab({ id: it.id, grabDay: d, hoverDay: d, moved: false })
  }

  useEffect(() => {
    if (!grab) return
    const move = (e: PointerEvent) => {
      const g = grabRef.current
      if (!g) return
      const d = dayAt(e.clientX, e.clientY)
      if (d !== null && d !== g.hoverDay) setGrab({ ...g, hoverDay: d, moved: true })
    }
    const up = () => {
      const g = grabRef.current
      setGrab(null)
      if (!g) return
      if (!g.moved || g.hoverDay === g.grabDay) {
        onSelect(g.id)
        return
      }
      const it = schedule.byId[g.id]
      const plan = it && planForDrop(it, 'move', g.hoverDay - g.grabDay, today)
      if (it && plan && (plan.start !== it.plannedStart || plan.end !== it.plannedEnd)) {
        onReschedule(it.id, plan.start, plan.end, plan.adjusted)
      }
    }
    const cancel = () => setGrab(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grab?.id])

  const picked = pickedDay
  const pickedBars = picked === null ? [] : bars.filter((b) => b.forecastStart! <= picked && b.forecastEnd! >= picked)
  const pickedEvents = picked === null ? [] : eventsByDay.get(picked) ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={15} />
        </Button>
        <div className="min-w-[150px] text-center text-sm font-semibold">
          {MONTHS[m - 1]} {y}
        </div>
        <Button size="sm" variant="outline" onClick={() => shiftMonth(1)} aria-label="Next month">
          <ChevronRight size={15} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setMonth(fromDay(today).slice(0, 7))
            setPickedDay(today)
          }}
        >
          Today
        </Button>
        {editable && (
          <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Drag a bar to another day to move the work; on a phone, tap it first.
          </span>
        )}
      </div>

      <div className="select-none overflow-hidden rounded-[var(--radius)] border" style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}>
        <div className="grid grid-cols-7 border-b text-center text-[11px] font-semibold uppercase tracking-wide" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1.5">{d}</div>
          ))}
        </div>

        {weeks.map((ws) => {
          const we = ws + 6
          // Bars crossing this week, stacked into lanes.
          const segs = bars
            .filter((b) => b.forecastStart! <= we && b.forecastEnd! >= ws)
            .sort((a, b) => a.forecastStart! - b.forecastStart! || b.forecastEnd! - a.forecastEnd!)
            .map((b) => ({ item: b, s: Math.max(b.forecastStart!, ws), e: Math.min(b.forecastEnd!, we) }))
          const laneEnds: number[] = []
          const placed = segs.map((sg) => {
            let lane = laneEnds.findIndex((end) => end < sg.s)
            if (lane === -1) {
              lane = laneEnds.length
              laneEnds.push(sg.e)
            } else laneEnds[lane] = sg.e
            return { ...sg, lane }
          })
          const shown = placed.filter((p) => p.lane < LANES)
          const hidden = (day: number) => placed.filter((p) => p.lane >= LANES && p.s <= day && p.e >= day).length
          const lanesUsed = Math.min(LANES, laneEnds.length)

          return (
            <div key={ws} className="relative grid grid-cols-7 border-b last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
              {Array.from({ length: 7 }, (_, i) => ws + i).map((d) => {
                const inMonth = fromDay(d).slice(0, 7) === month
                const isToday = d === today
                const inPreview = preview && d >= preview.s && d <= preview.e
                const dayEvents = eventsByDay.get(d) ?? []
                const more = hidden(d)
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    key={d}
                    data-day={d}
                    onClick={() => setPickedDay(d)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPickedDay(d)}
                    className="relative flex min-h-[92px] cursor-pointer flex-col items-start border-r p-1 text-left last:border-r-0 sm:min-h-[108px]"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      background: inPreview
                        ? 'hsl(var(--accent) / 0.16)'
                        : pickedDay === d
                        ? 'hsl(var(--accent) / 0.07)'
                        : inMonth
                        ? undefined
                        : 'hsl(var(--muted) / 0.4)',
                    }}
                  >
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold"
                      style={{
                        background: isToday ? 'hsl(var(--accent))' : undefined,
                        color: isToday ? 'hsl(var(--accent-foreground))' : inMonth ? undefined : 'hsl(var(--muted-foreground))',
                      }}
                    >
                      {Number(fromDay(d).slice(8, 10))}
                    </span>
                    <div style={{ marginTop: lanesUsed * LANE_H + 2 }} className="flex w-full min-w-0 flex-col gap-0.5">
                      {more > 0 && (
                        <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>+{more} more</span>
                      )}
                      {dayEvents.slice(0, 3).map((ev) => {
                        const Icon = ICON[ev.kind]
                        return (
                          <span key={ev.id} className="flex min-w-0 items-center gap-1 text-[10px] leading-tight" title={ev.label} style={{ color: TONE[ev.tone] }}>
                            <Icon size={10} className="shrink-0" />
                            <span className="truncate">{ev.label}</span>
                          </span>
                        )
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>+{dayEvents.length - 3}</span>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Work package bars across the week */}
              {shown.map(({ item: it, s, e, lane }) => {
                const color = STATUS_COLOR[it.status] ?? STATUS_COLOR.DRAFT
                const startsHere = s === it.forecastStart
                const endsHere = e === it.forecastEnd
                const selected = selectedId === it.id
                return (
                  <div
                    key={`${it.id}-${ws}`}
                    onPointerDown={(ev) => begin(ev, it)}
                    title={`${it.wpNumber} · ${it.title}\n${shortDate(it.forecastStart)} → ${shortDate(it.forecastEnd)} (${plural(it.forecastEnd! - it.forecastStart! + 1, 'day')})${it.critical ? '\nOn the critical path' : ''}`}
                    className="absolute z-10 flex items-center overflow-hidden px-1 text-[10px] font-semibold text-white"
                    style={{
                      left: `calc(${((s - ws) / 7) * 100}% + 2px)`,
                      width: `calc(${((e - s + 1) / 7) * 100}% - 4px)`,
                      top: HEAD_H + lane * LANE_H,
                      height: LANE_H - 3,
                      background: color,
                      opacity: grab?.id === it.id && grab.moved ? 0.45 : 1,
                      borderRadius: `${startsHere ? 4 : 0}px ${endsHere ? 4 : 0}px ${endsHere ? 4 : 0}px ${startsHere ? 4 : 0}px`,
                      boxShadow: [it.critical ? 'inset 0 0 0 1.5px hsl(0 72% 51%)' : '', selected ? '0 0 0 2px hsl(var(--foreground))' : '']
                        .filter(Boolean)
                        .join(', ') || undefined,
                      cursor: editable && !it.complete ? 'grab' : 'pointer',
                      touchAction: editable && selected ? 'none' : 'pan-x pan-y',
                    }}
                  >
                    <span className="truncate">
                      {startsHere || s === ws ? `${it.wpNumber} ${it.title}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* The picked day, as a list: what is under way and what falls on it. */}
      {picked !== null && (
        <div className="rounded-[var(--radius)] border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="mb-2 text-sm font-semibold">{shortDate(picked)}</div>
          {pickedBars.length === 0 && pickedEvents.length === 0 && (
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Nothing scheduled.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {pickedBars.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => onSelect(it.id)} className="flex w-full items-center gap-2 text-left text-sm hover:underline">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATUS_COLOR[it.status] ?? STATUS_COLOR.DRAFT }} />
                  <span className="font-mono text-xs" style={{ color: 'hsl(var(--accent))' }}>{it.wpNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{it.title}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {picked === it.forecastStart ? 'starts' : picked === it.forecastEnd ? 'finishes' : `day ${picked - it.forecastStart! + 1}`}
                  </span>
                </button>
              </li>
            ))}
            {pickedEvents.map((ev) => {
              const Icon = ICON[ev.kind]
              return (
                <li key={ev.id}>
                  <button
                    type="button"
                    onClick={() => ev.href && onOpen(ev.href)}
                    className="flex w-full items-center gap-2 text-left text-sm hover:underline"
                    style={{ color: TONE[ev.tone] }}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{ev.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
