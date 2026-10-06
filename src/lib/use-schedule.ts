import { useMemo } from 'react'
import {
  useApprovals,
  useChangeOrders,
  useDefects,
  useDependencies,
  useInspections,
  useProject,
  useWorkPackages,
} from './query-hooks'
import { computeSchedule, delaysFromChangeOrders, toDay, type ScheduleResult } from './schedule'
import { localToday } from './format'
import type { GanttLine, GanttMarker } from '@/components/gantt/Gantt'
import type { WorkPackageDependency } from './types'

export interface ProjectSchedule {
  schedule: ScheduleResult
  dependencies: WorkPackageDependency[]
  markers: GanttMarker[]
  lines: GanttLine[]
  isLoading: boolean
  error: unknown
}

/**
 * The project's schedule, derived from the world model.
 *
 * Bars come from work packages; what pushes them comes from dependencies and
 * from change orders (through the NCR that raised them). Inspections, owner
 * approvals and open NCRs become marks on the package they belong to. Nothing
 * here is stored: it is recomputed from the record every time it changes, so
 * the chart cannot disagree with the objects it is drawn from.
 */
export function useProjectSchedule(): ProjectSchedule {
  const project = useProject()
  const wps = useWorkPackages()
  const deps = useDependencies()
  const cos = useChangeOrders()
  const defects = useDefects()
  const inspections = useInspections()
  const approvals = useApprovals()

  const today = localToday()

  return useMemo(() => {
    const workPackages = wps.data ?? []
    const dependencies = deps.data ?? []
    const changeOrders = cos.data ?? []
    const defectRows = defects.data ?? []

    const schedule = computeSchedule({
      workPackages,
      dependencies,
      delays: delaysFromChangeOrders(changeOrders, defectRows),
      today,
    })

    const markers: GanttMarker[] = []

    for (const insp of inspections.data ?? []) {
      const day = toDay(insp.actual_date ?? insp.scheduled_date)
      if (day === null || !insp.work_package_id) continue
      markers.push({
        workPackageId: insp.work_package_id,
        day,
        kind: 'inspection',
        label: `${insp.inspection_number} · ${insp.title} · ${insp.result.replace(/_/g, ' ')}`,
        tone:
          insp.result === 'PASS' ? 'ok'
          : insp.result === 'CONDITIONAL_PASS' ? 'warn'
          : insp.result === 'FAIL' ? 'bad'
          : 'neutral',
      })
    }

    // An owner decision gates the package its change order came from.
    const coById = new Map(changeOrders.map((c) => [c.id, c]))
    const wpForDefect = new Map(defectRows.map((d) => [d.id, d.work_package_id]))
    for (const a of approvals.data ?? []) {
      if (a.status !== 'PENDING' || !a.deadline || !a.change_order_id) continue
      const co = coById.get(a.change_order_id)
      const wpId = co?.defect_record_id ? wpForDefect.get(co.defect_record_id) : null
      const day = toDay(a.deadline)
      if (!wpId || day === null) continue
      markers.push({
        workPackageId: wpId,
        day,
        kind: 'gate',
        label: `${a.approval_number} · owner decision due`,
        tone: day < schedule.today ? 'bad' : 'warn',
      })
    }

    for (const d of defectRows) {
      if (d.status === 'CLOSED' || !d.work_package_id) continue
      const day = toDay(d.discovered_date)
      if (day === null) continue
      markers.push({
        workPackageId: d.work_package_id,
        day,
        kind: 'ncr',
        label: `${d.ncr_number} · ${d.title} · ${d.severity}`,
        tone: d.severity === 'CRITICAL' || d.severity === 'HIGH' ? 'bad' : 'warn',
      })
    }

    const lines: GanttLine[] = [{ day: schedule.today, label: 'Today', tone: 'today' }]
    const p = project.data
    const ps = toDay(p?.planned_start)
    const pd = toDay(p?.planned_delivery)
    if (ps !== null) lines.push({ day: ps, label: 'Project planned start', tone: 'plan', edge: 'start' })
    if (pd !== null) lines.push({ day: pd, label: 'Planned delivery', tone: 'plan', edge: 'end' })
    if (schedule.forecastFinish !== null && schedule.forecastFinish !== pd) {
      lines.push({ day: schedule.forecastFinish, label: 'Forecast finish', tone: 'forecast', edge: 'end' })
    }
    if (schedule.baselineFinish !== null && schedule.baselineFinish !== schedule.forecastFinish) {
      lines.push({ day: schedule.baselineFinish, label: 'Baseline finish', tone: 'baseline', edge: 'end' })
    }

    return {
      schedule,
      dependencies,
      markers,
      lines,
      isLoading: project.isLoading || wps.isLoading || deps.isLoading,
      error: project.error ?? wps.error ?? deps.error,
    }
  }, [
    project.data, project.isLoading, project.error,
    wps.data, wps.isLoading, wps.error,
    deps.data, deps.isLoading, deps.error,
    cos.data, defects.data, inspections.data, approvals.data,
    today,
  ])
}
