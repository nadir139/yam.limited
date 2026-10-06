import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarRange, Link2, Flag, GitBranch, Lock, AlertTriangle, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Gantt, { type GroupBy } from '@/components/gantt/Gantt'
import ScheduleDetailPanel from '@/components/gantt/ScheduleDetailPanel'
import { plural, shortDate, type Zoom } from '@/components/gantt/scale'
import { useProjectSchedule } from '@/lib/use-schedule'
import { fromDay } from '@/lib/schedule'
import {
  useLinkWorkPackages,
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
  const { schedule, dependencies, markers, lines, isLoading, error } = useProjectSchedule()
  const { can } = usePermissions()
  const reschedule = useRescheduleWorkPackage()
  const link = useLinkWorkPackages()
  const baseline = useSetScheduleBaseline()

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

  const doReschedule = (id: string, start: number, end: number, reason?: string) => {
    const item = schedule.byId[id]
    const before = { start: item.plannedStart, end: item.plannedEnd }
    reschedule.mutate(
      { id, start: fromDay(start), end: fromDay(end), reason: reason ?? 'Moved on the schedule' },
      {
        onSuccess: () => {
          toast.success(`${item.wpNumber} → ${shortDate(start)} – ${shortDate(end)}`, {
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

      <Gantt
        schedule={schedule}
        dependencies={dependencies}
        markers={markers}
        lines={lines}
        zoom={zoom}
        groupBy={groupBy}
        showBaseline={showBaseline}
        showDependencies={showDeps}
        editable={canReschedule}
        linkMode={linkMode}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onReschedule={(id, s, e) => doReschedule(id, s, e)}
        onPlace={(id, day) => doReschedule(id, day, day + 4, 'Placed on the schedule')}
        onLink={doLink}
      />

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
