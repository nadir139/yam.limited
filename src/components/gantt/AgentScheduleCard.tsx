import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import Gantt from './Gantt'
import { plural, shortDate } from './scale'
import { useProjectSchedule } from '@/lib/use-schedule'

// The schedule, drawn in the conversation.
//
// When the agent reads or changes the plan, the reply is followed by the part
// of the chart it is about: the packages it touched and the ones they wait on
// or hold up, live from the same engine as the Schedule page. It reads the
// record directly, so it shows the plan as it is now, not as the agent
// described it a minute ago.

const MAX_ROWS = 14

export default function AgentScheduleCard({ focusIds }: { focusIds?: string[] }) {
  const { schedule, dependencies, markers, lines, isLoading } = useProjectSchedule()

  const { ids, highlight } = useMemo(() => {
    const focus = (focusIds ?? []).filter((id) => schedule.byId[id])
    if (focus.length) {
      // What was touched, plus its immediate neighbours in the plan.
      const set = new Set(focus)
      for (const d of dependencies) {
        if (set.has(d.successor_id)) set.add(d.predecessor_id)
        if (set.has(d.predecessor_id)) set.add(d.successor_id)
      }
      // A single changed package on its own says little; add the packages
      // nearest to it in time, so the reader sees what it sits among.
      if (set.size < 5) {
        const anchor = schedule.byId[focus[0]].forecastStart
        if (anchor !== null) {
          const nearest = schedule.items
            .filter((i) => !set.has(i.id) && i.forecastStart !== null)
            .sort((a, b) => Math.abs(a.forecastStart! - anchor) - Math.abs(b.forecastStart! - anchor))
          for (const i of nearest) {
            if (set.size >= 5) break
            set.add(i.id)
          }
        }
      }
      const ordered = [...set]
        .map((id) => schedule.byId[id])
        .filter(Boolean)
        .sort((a, b) => (a.forecastStart ?? Infinity) - (b.forecastStart ?? Infinity))
        .slice(0, MAX_ROWS)
        .map((i) => i.id)
      return { ids: ordered, highlight: new Set(focus) }
    }
    const ordered = [...schedule.items]
      .sort((a, b) => (a.forecastStart ?? Infinity) - (b.forecastStart ?? Infinity))
      .slice(0, MAX_ROWS)
      .map((i) => i.id)
    return { ids: ordered, highlight: new Set<string>() }
  }, [focusIds, schedule, dependencies])

  if (isLoading || ids.length === 0) return null

  const span = (() => {
    const days = ids.flatMap((id) => [schedule.byId[id].forecastStart, schedule.byId[id].forecastEnd]).filter((d): d is number => d !== null)
    return days.length ? Math.max(...days) - Math.min(...days) : 0
  })()
  const firstDay = ids.map((id) => schedule.byId[id].forecastStart).find((d) => d !== null) ?? null
  const slip =
    schedule.forecastFinish !== null && schedule.committedFinish !== null
      ? schedule.forecastFinish - schedule.committedFinish
      : null

  return (
    <div className="mt-3 rounded-[var(--radius)] border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CalendarRange size={13} style={{ color: 'hsl(var(--accent))' }} />
          Schedule
        </span>
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>
          Forecast finish {shortDate(schedule.forecastFinish)}
          {slip !== null && slip !== 0 && (
            <span style={{ color: slip > 0 ? 'hsl(0 72% 51%)' : 'hsl(152 50% 38%)' }}>
              {' '}· {slip > 0 ? `+${plural(slip, 'day')}` : `${plural(-slip, 'day')} early`}
            </span>
          )}
          {schedule.unscheduled.length > 0 && ` · ${schedule.unscheduled.length} unscheduled`}
        </span>
        <Link to="/app/schedule" className="ml-auto text-xs font-medium hover:underline" style={{ color: 'hsl(var(--accent))' }}>
          Open the full schedule →
        </Link>
      </div>
      <Gantt
        schedule={schedule}
        dependencies={dependencies}
        markers={markers}
        lines={lines}
        zoom={span > 50 ? 'week' : 'day'}
        compact
        onlyIds={ids}
        highlight={highlight}
        focusDay={firstDay}
      />
    </div>
  )
}
