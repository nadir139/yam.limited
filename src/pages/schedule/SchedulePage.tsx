import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarDays, CalendarRange, Link2, Flag, GitBranch, Lock, AlertTriangle, Crosshair, GanttChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Gantt, { type GroupBy } from '@/components/gantt/Gantt'
import ScheduleDetailPanel from '@/components/gantt/ScheduleDetailPanel'
import ScheduleCalendar, { type CalendarEvent } from '@/components/gantt/ScheduleCalendar'
import { plural, shortDate, type Zoom } from '@/components/gantt/scale'
import { useProjectSchedule } from '@/lib/use-schedule'
import { fromDay, toDay } from '@/lib/schedule'
import { workPackageSystems } from '@/lib/parts'
import {
  useApprovals,
  useInspections,
  useLinkWorkPackages,
  useProject,
  useProjectActionItems,
  usePartLinks,
  useParts,
  usePermissions,
  useRescheduleWorkPackage,
  useSetScheduleBaseline,
} from '@/lib/query-hooks'

// The schedule of the world model.
//
// Not a separate plan: every bar is a work package, every arrow a recorded
// dependency, every move an Action with its before and after in the history.
// What the chart adds is the derived part — where the work will really land
// once late starts, predecessors and change orders are counted — and which
// packages decide the finish date.

const ZOOMS: { key: Zoom; label: string }[] = [
  { key: 'day', label: 'Days' },
  { key: 'week', label: 'Weeks' },
  { key: 'month', label: 'Months' },
]

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'bad' | 'warn' | 'ok'; hint?: string }) {
  const color =
    tone === 'bad' ? 'hsl(0 72% 51%)' : tone === 'warn' ? 'hsl(38 90% 45%)' : tone === 'ok' ? 'hsl(152 50% 38%)' : undefined
  return (
    <div className="min-w-[120px] rounded-[var(--radius)] border px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }} title={hint}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
        {label}
      </div>
      <div className="text-sm font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const navigate = useNavigate()
  const { schedule, dependencies, markers, lines, isLoading, error, predict } = useProjectSchedule()
  const { data: inspections = [] } = useInspections()
  const { data: approvals = [] } = useApprovals()
  const { data: actionItems = [] } = useProjectActionItems()
  const { data: project } = useProject()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'calendar' ? 'calendar' : 'timeline'
  const setView = (v: 'timeline' | 'calendar') =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (v === 'calendar') next.set('view', 'calendar')
      else next.delete('view')
      return next
    })

  // Everything else in the model that has a date, for the calendar: the
  // attendances booked, the owner's decisions due, what people owe by when,
  // and the project's own milestones.
  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = []
    for (const i of inspections) {
      const day = toDay(i.actual_date ?? i.scheduled_date)
      if (day === null) continue
      out.push({
        id: `i${i.id}`,
        day,
        kind: 'inspection',
        label: `${i.inspection_number} ${i.title}`,
        tone: i.result === 'PASS' ? 'ok' : i.result === 'FAIL' ? 'bad' : i.result === 'CONDITIONAL_PASS' ? 'warn' : 'neutral',
        href: i.work_package_id ? `/app/work-packages/${i.work_package_id}` : '/app/inspections',
      })
    }
    for (const a of approvals) {
      const day = toDay(a.status === 'PENDING' ? a.deadline : a.decision_date)
      if (day === null) continue
      out.push({
        id: `a${a.id}`,
        day,
        kind: 'approval',
        label: `${a.approval_number} ${a.status === 'PENDING' ? 'decision due' : a.status.toLowerCase()}`,
        tone: a.status === 'PENDING' ? (day < schedule.today ? 'bad' : 'warn') : a.status === 'APPROVED' ? 'ok' : 'neutral',
        href: '/app/approvals',
      })
    }
    for (const it of actionItems) {
      const day = toDay(it.due_date)
      if (day === null || it.status === 'DONE' || it.status === 'DECLINED') continue
      out.push({
        id: `t${it.id}`,
        day,
        kind: 'action',
        label: `${it.assignee_name}: ${it.body}`,
        tone: day < schedule.today ? 'bad' : 'neutral',
        href: '/app/action-items',
      })
    }
    const ps = toDay(project?.planned_start)
    const pd = toDay(project?.planned_delivery)
    if (ps !== null) out.push({ id: 'm-start', day: ps, kind: 'milestone', label: 'Project planned start', tone: 'neutral' })
    if (pd !== null) out.push({ id: 'm-delivery', day: pd, kind: 'milestone', label: 'Planned delivery', tone: 'neutral' })
    if (schedule.forecastFinish !== null && schedule.forecastFinish !== pd) {
      out.push({
        id: 'm-forecast',
        day: schedule.forecastFinish,
        kind: 'milestone',
        label: 'Forecast finish',
        tone: pd !== null && schedule.forecastFinish > pd ? 'bad' : 'ok',
      })
    }
    return out
  }, [inspections, approvals, actionItems, project, schedule.today, schedule.forecastFinish])
  const { can } = usePermissions()
  const reschedule = useRescheduleWorkPackage()
  const link = useLinkWorkPackages()
  const baseline = useSetScheduleBaseline()
  const { data: parts = [] } = useParts()
  const { data: partLinks = [] } = usePartLinks()
  const partGroups = useMemo(() => workPackageSystems(parts, partLinks), [parts, partLinks])

  const [zoom, setZoom] = useState<Zoom>('week')
  const [groupBy, setGroupBy] = useState<GroupBy>('discipline')
  const [showBaseline, setShowBaseline] = useState(true)
  const [showDeps, setShowDeps] = useState(true)
  const [linkMode, setLinkMode] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const canReschedule = can('action_reschedule_work_package')
  const canLink = can('action_link_work_packages')
  const canBaseline = can('action_set_schedule_baseline')

  const stats = useMemo(() => {
    const live = schedule.items.filter((i) => !i.complete)
    return {
      critical: live.filter((i) => i.critical).length,
      late: live.filter((i) => i.lateStart || i.overdue).length,
      awaiting: live.filter((i) => i.awaitingApproval).length,
      unscheduled: schedule.unscheduled.length,
    }
  }, [schedule])

  // What a move does to the rest of the model, in words: the record is
  // connected, so moving one package can hold it behind a predecessor, push
  // the packages after it, move the finish, or strand an inspection booked
  // inside its old dates.
  const consequences = (id: string, start: number, end: number, adjusted?: string | null) => {
    const next = predict(id, fromDay(start), fromDay(end))
    const it = next.byId[id]
    const notes: string[] = []
    if (adjusted) notes.push(`${adjusted}.`)
    if (it && !it.started && it.forecastStart !== null && it.forecastStart > start && it.drivenBy && it.drivenBy !== 'not started') {
      notes.push(`It waits on ${it.drivenBy}, so it cannot start before ${shortDate(it.forecastStart)}.`)
    }
    const moved = next.items
      .filter((o) => o.id !== id)
      .filter((o) => {
        const was = schedule.byId[o.id]
        return was && (o.forecastStart !== was.forecastStart || o.forecastEnd !== was.forecastEnd)
      })
      .map((o) => o.wpNumber)
    if (moved.length) {
      notes.push(`Also moves ${moved.slice(0, 4).join(', ')}${moved.length > 4 ? ` and ${moved.length - 4} more` : ''}.`)
    }
    if (next.forecastFinish !== null && next.forecastFinish !== schedule.forecastFinish) {
      notes.push(`Forecast finish ${shortDate(schedule.forecastFinish)} → ${shortDate(next.forecastFinish)}.`)
    }
    if (it && it.forecastStart !== null && it.forecastEnd !== null) {
      const outside = inspections.filter((i) => {
        if (i.work_package_id !== id || i.actual_date || i.result !== 'PENDING') return false
        const d = toDay(i.scheduled_date)
        return d !== null && (d < it.forecastStart! || d > it.forecastEnd!)
      })
      if (outside.length) {
        notes.push(
          `${outside.map((i) => `${i.inspection_number} (${shortDate(toDay(i.scheduled_date))})`).join(', ')} now falls outside the work.`,
        )
      }
    }
    return { notes, item: it }
  }

  const doReschedule = (id: string, start: number, end: number, reason?: string, adjusted?: string | null) => {
    const item = schedule.byId[id]
    const before = { start: item.plannedStart, end: item.plannedEnd }
    const { notes, item: after } = consequences(id, start, end, adjusted)
    reschedule.mutate(
      { id, start: fromDay(start), end: fromDay(end), reason: reason ?? 'Moved on the schedule' },
      {
        onSuccess: () => {
          // Say where the bar now is (the forecast), not just what was stored.
          const shown = after?.forecastStart != null ? `${shortDate(after.forecastStart)} – ${shortDate(after.forecastEnd)}` : `${shortDate(start)} – ${shortDate(end)}`
          toast.success(`${item.wpNumber} → ${shown}`, {
            description: notes.length ? notes.join(' ') : undefined,
            duration: notes.length ? 9000 : 5000,
            action:
              before.start !== null && before.end !== null
                ? {
                    label: 'Undo',
                    onClick: () =>
                      reschedule.mutate({
                        id,
                        start: fromDay(before.start!),
                        end: fromDay(before.end!),
                        reason: 'Undo',
                      }),
                  }
                : undefined,
          })
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reschedule'),
      },
    )
  }

  const doLink = (predecessorId: string, successorId: string) => {
    link.mutate(
      { predecessorId, successorId },
      {
        onSuccess: () =>
          toast.success(`${schedule.byId[successorId].wpNumber} now waits on ${schedule.byId[predecessorId].wpNumber}`),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not link'),
      },
    )
  }

  if (isLoading) {
    return <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading…</div>
  }
  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--destructive))' }}>
        Could not load the schedule: {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  const finishSlip =
    schedule.forecastFinish !== null && schedule.committedFinish !== null
      ? schedule.forecastFinish - schedule.committedFinish
      : null

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarRange size={22} style={{ color: 'hsl(var(--accent))' }} />
            Schedule
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Bars show where the work will really land: late starts, dependencies and change
            orders included. Dashed outlines are the plan; grey lines underneath are the baseline.
          </p>
        </div>
        {canBaseline && (
          <Button
            variant="outline"
            size="sm"
            disabled={baseline.isPending}
            onClick={() => {
              if (!window.confirm('Freeze the current planned dates as the baseline? Slip will be measured against it from now on.')) return
              baseline.mutate('Set from the schedule', {
                onSuccess: (n) => toast.success(`Baseline set for ${plural(n, 'work package')}`),
                onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not set the baseline'),
              })
            }}
          >
            <Flag size={14} className="mr-1.5" />
            {schedule.baselineFinish !== null ? 'Re-baseline' : 'Set baseline'}
          </Button>
        )}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <Stat label="Committed finish" value={shortDate(schedule.committedFinish)} hint="Latest baseline end, or planned end where a package has no baseline" />
        <Stat
          label="Forecast finish"
          value={shortDate(schedule.forecastFinish)}
          tone={finishSlip !== null && finishSlip > 0 ? 'bad' : finishSlip !== null ? 'ok' : undefined}
        />
        <Stat
          label="Slip"
          value={finishSlip === null ? '—' : finishSlip > 0 ? `+${plural(finishSlip, 'day')}` : finishSlip < 0 ? `${plural(-finishSlip, 'day')} early` : 'On plan'}
          tone={finishSlip !== null && finishSlip > 0 ? 'bad' : 'ok'}
        />
        <Stat label="Critical" value={String(stats.critical)} tone={stats.critical ? 'warn' : undefined} hint="Packages with no float: any delay moves the finish" />
        <Stat label="Late" value={String(stats.late)} tone={stats.late ? 'bad' : undefined} hint="Not started after their planned start, or past their end" />
        <Stat label="Awaiting owner" value={String(stats.awaiting)} tone={stats.awaiting ? 'warn' : undefined} hint="A change order on the package waits on an approval" />
        <Stat label="Unscheduled" value={String(stats.unscheduled)} tone={stats.unscheduled ? 'warn' : undefined} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}>
          {([
            ['timeline', 'Timeline', GanttChart],
            ['calendar', 'Calendar', CalendarDays],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              style={{
                background: view === key ? 'hsl(var(--primary))' : 'transparent',
                color: view === key ? 'hsl(var(--primary-foreground))' : undefined,
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        {view === 'timeline' && (
        <>
        <div className="inline-flex overflow-hidden rounded-md border" style={{ borderColor: 'hsl(var(--border))' }}>
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZoom(z.key)}
              className="px-3 py-1.5 text-xs font-medium"
              style={{
                background: zoom === z.key ? 'hsl(var(--primary))' : 'transparent',
                color: zoom === z.key ? 'hsl(var(--primary-foreground))' : undefined,
              }}
            >
              {z.label}
            </button>
          ))}
        </div>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="h-8 rounded-md border px-2 text-xs"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
          aria-label="Group by"
        >
          <option value="discipline">Group by discipline</option>
          <option value="part">Group by system</option>
          <option value="status">Group by status</option>
          <option value="none">No grouping</option>
        </select>

        <Button variant={showDeps ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowDeps((v) => !v)}>
          <GitBranch size={13} className="mr-1.5" /> Dependencies
        </Button>
        <Button variant={showBaseline ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowBaseline((v) => !v)}>
          <Flag size={13} className="mr-1.5" /> Baseline
        </Button>
        {canLink && (
          <Button variant={linkMode ? 'default' : 'outline'} size="sm" onClick={() => setLinkMode((v) => !v)}>
            <Link2 size={13} className="mr-1.5" /> {linkMode ? 'Linking… (click to stop)' : 'Link packages'}
          </Button>
        )}
        </>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm" style={{ boxShadow: '0 0 0 2px hsl(0 72% 51%)' }} /> Critical</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45" style={{ background: 'hsl(152 55% 40%)' }} /> Inspection</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 border-2" style={{ borderColor: 'hsl(38 90% 50%)' }} /> Owner decision</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: 'hsl(0 72% 51%)' }} /> Open NCR</span>
          <span className="inline-flex items-center gap-1"><Lock size={11} /> Awaiting approval</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle size={11} /> Late</span>
          <span className="inline-flex items-center gap-1"><Crosshair size={11} /> Today</span>
        </div>
      </div>

      {view === 'calendar' ? (
        <ScheduleCalendar
          schedule={schedule}
          events={events}
          editable={canReschedule}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReschedule={(id, s, e, adjusted) => doReschedule(id, s, e, 'Moved on the calendar', adjusted)}
          onOpen={(href) => navigate(href)}
        />
      ) : (
      <Gantt
        schedule={schedule}
        dependencies={dependencies}
        markers={markers}
        lines={lines}
        zoom={zoom}
        groupBy={groupBy}
        partGroups={partGroups}
        showBaseline={showBaseline}
        showDependencies={showDeps}
        editable={canReschedule}
        linkMode={linkMode}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReschedule={(id, s, e, adjusted) => doReschedule(id, s, e, 'Moved on the schedule', adjusted)}
        onPlace={(id, day) => {
          // Work not started cannot be placed in the past.
          const d = Math.max(day, schedule.today)
          doReschedule(id, d, d + 4, 'Placed on the schedule', d !== day ? 'It cannot begin before today' : null)
        }}
        onLink={doLink}
      />
      )}

      {!canReschedule && (
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Your role on this project can read the schedule but not change it.
        </p>
      )}

      <ScheduleDetailPanel
        item={selectedId ? schedule.byId[selectedId] ?? null : null}
        schedule={schedule}
        dependencies={dependencies}
        canReschedule={canReschedule}
        canLink={canLink}
        onClose={() => setSelectedId(null)}
        onReschedule={doReschedule}
        onOpen={(id) => navigate(`/app/work-packages/${id}`)}
      />
    </div>
  )
}
