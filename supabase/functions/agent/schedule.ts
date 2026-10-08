// The schedule engine: from the recorded plan to what will actually happen.
//
// One implementation, used twice. The app imports it (src/lib/schedule.ts
// re-exports this file) to draw the Gantt; the agent imports it to answer
// "what slips if…". Two copies would disagree within a month, and a user who
// sees one forecast on the chart and another from the agent stops trusting
// both. So this file has no imports and no runtime-specific APIs: it must
// compile unchanged in Vite and in Deno.
//
// What is stored: planned, actual and baseline dates; dependencies; change
// orders with a schedule delta. What is derived here: the forecast, slip,
// float and the critical path. Deriving it means it can never be stale.

export interface ScheduleWorkPackage {
  id: string
  wp_number: string
  title: string
  discipline: string
  status: string
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  baseline_start: string | null
  baseline_end: string | null
}

export interface ScheduleDependency {
  predecessor_id: string
  successor_id: string
  kind: string // 'FS' | 'SS'
  lag_days: number
}

/** A change order's schedule delta, attributed to the work package it hits. */
export interface ScheduleDelay {
  work_package_id: string
  days: number
  source: string // e.g. CO-2026-003
  pending: boolean // still awaiting owner approval
}

export interface ScheduleItem {
  id: string
  wpNumber: string
  title: string
  discipline: string
  status: string
  scheduled: boolean
  complete: boolean
  started: boolean
  /** As planned (day numbers). Null when unscheduled. */
  plannedStart: number | null
  plannedEnd: number | null
  baselineStart: number | null
  baselineEnd: number | null
  actualStart: number | null
  actualEnd: number | null
  /** What will happen, given progress, dependencies and change orders. */
  forecastStart: number | null
  forecastEnd: number | null
  /** Forecast end minus baseline end (or planned end with no baseline). */
  slipDays: number | null
  /** Days this item can slip before the project finish moves. */
  floatDays: number | null
  critical: boolean
  /** Days added by change orders, and which ones. */
  delayDays: number
  delaySources: string[]
  /** A change order affecting it still waits on an owner decision. */
  awaitingApproval: boolean
  /** Why the forecast start is later than planned, if it is. */
  drivenBy: string | null
  /** Not started, and the planned start has passed. */
  lateStart: boolean
  /** Started but past its forecast end and not complete. */
  overdue: boolean
}

export interface ScheduleResult {
  items: ScheduleItem[]
  byId: Record<string, ScheduleItem>
  /** Earliest planned/forecast day across the plan. */
  start: number | null
  /** Latest forecast end across the plan. */
  forecastFinish: number | null
  plannedFinish: number | null
  baselineFinish: number | null
  /**
   * What the finish was committed to: each package's baseline end where it has
   * one, its planned end where it does not. Slip is measured against this.
   * Using the baseline alone would compare the whole project with only the
   * packages that happened to be baselined.
   */
  committedFinish: number | null
  criticalPath: string[]
  unscheduled: string[]
  today: number
}

const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' (or an ISO timestamp) to a whole day number, timezone-free. */
export function toDay(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS)
}

/** A day number back to 'YYYY-MM-DD'. */
export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

export function computeSchedule(input: {
  workPackages: ScheduleWorkPackage[]
  dependencies: ScheduleDependency[]
  delays?: ScheduleDelay[]
  /** Today as 'YYYY-MM-DD' in the viewer's timezone. */
  today: string
}): ScheduleResult {
  const today = toDay(input.today) ?? Math.floor(Date.now() / DAY_MS)
  const items: ScheduleItem[] = []
  const byId: Record<string, ScheduleItem> = {}

  const delaysFor = new Map<string, ScheduleDelay[]>()
  for (const d of input.delays ?? []) {
    if (!d.days) continue
    const list = delaysFor.get(d.work_package_id) ?? []
    list.push(d)
    delaysFor.set(d.work_package_id, list)
  }

  for (const wp of input.workPackages) {
    let ps = toDay(wp.planned_start)
    let pe = toDay(wp.planned_end)
    // One date is a one-day package, as the reschedule Action treats it.
    ps = ps ?? pe
    pe = pe ?? ps
    if (ps !== null && pe !== null && pe < ps) pe = ps

    const delays = delaysFor.get(wp.id) ?? []
    const complete = wp.status === 'COMPLETE'
    const item: ScheduleItem = {
      id: wp.id,
      wpNumber: wp.wp_number,
      title: wp.title,
      discipline: wp.discipline,
      status: wp.status,
      scheduled: ps !== null,
      complete,
      started: Boolean(wp.actual_start) || complete || wp.status === 'ACTIVE' || wp.status === 'EXPANDED',
      plannedStart: ps,
      plannedEnd: pe,
      baselineStart: toDay(wp.baseline_start),
      baselineEnd: toDay(wp.baseline_end),
      actualStart: toDay(wp.actual_start),
      actualEnd: toDay(wp.actual_end),
      forecastStart: null,
      forecastEnd: null,
      slipDays: null,
      floatDays: null,
      critical: false,
      delayDays: delays.reduce((sum, d) => sum + d.days, 0),
      delaySources: delays.map((d) => d.source),
      awaitingApproval: delays.some((d) => d.pending),
      drivenBy: null,
      lateStart: false,
      overdue: false,
    }
    items.push(item)
    byId[item.id] = item
  }

  const deps = input.dependencies.filter((d) => byId[d.predecessor_id] && byId[d.successor_id])
  const preds = new Map<string, ScheduleDependency[]>()
  const succs = new Map<string, ScheduleDependency[]>()
  for (const d of deps) {
    preds.set(d.successor_id, [...(preds.get(d.successor_id) ?? []), d])
    succs.set(d.predecessor_id, [...(succs.get(d.predecessor_id) ?? []), d])
  }

  // Topological order (Kahn). The database refuses cycles; anything left over
  // after the sort is appended so a bad row degrades the forecast, not the page.
  const indegree = new Map(items.map((i) => [i.id, 0]))
  for (const d of deps) indegree.set(d.successor_id, (indegree.get(d.successor_id) ?? 0) + 1)
  const queue = items.filter((i) => indegree.get(i.id) === 0).map((i) => i.id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const d of succs.get(id) ?? []) {
      const n = (indegree.get(d.successor_id) ?? 0) - 1
      indegree.set(d.successor_id, n)
      if (n === 0) queue.push(d.successor_id)
    }
  }
  for (const i of items) if (!order.includes(i.id)) order.push(i.id)

  // Forward pass: earliest the work can really happen.
  for (const id of order) {
    const it = byId[id]
    if (!it.scheduled) continue
    const duration = it.plannedEnd! - it.plannedStart!

    if (it.complete && it.actualEnd !== null) {
      it.forecastStart = it.actualStart ?? it.plannedStart
      it.forecastEnd = it.actualEnd
      continue
    }

    let start = it.actualStart ?? it.plannedStart!
    if (!it.started) {
      // Waiting on predecessors.
      for (const d of preds.get(id) ?? []) {
        const p = byId[d.predecessor_id]
        if (p.forecastStart === null || p.forecastEnd === null) continue
        const earliest =
          d.kind === 'SS' ? p.forecastStart + d.lag_days : p.forecastEnd + 1 + d.lag_days
        if (earliest > start) {
          start = earliest
          it.drivenBy = p.wpNumber
        }
      }
      // A start date in the past that has not happened has not happened.
      if (start < today) {
        it.lateStart = true
        start = today
        it.drivenBy = it.drivenBy ?? 'not started'
      }
    }

    // Work under way finishes when its plan says it finishes: the planned
    // end is the commitment, and a start that slipped does not quietly move
    // it. (Counting the planned duration from the actual start instead meant
    // dragging the end of a started bar on the chart changed nothing you
    // could see.) Work not yet started keeps its duration from wherever it
    // can really begin.
    let end = it.started
      ? Math.max(start, it.plannedEnd!) + it.delayDays
      : start + duration + it.delayDays
    if (it.started && !it.complete && end < today) {
      it.overdue = true
      end = today
    }
    it.forecastStart = start
    it.forecastEnd = end
  }

  // Project finish, then a backward pass for float and the critical path.
  const scheduled = items.filter((i) => i.forecastEnd !== null)
  const forecastFinish = scheduled.length ? Math.max(...scheduled.map((i) => i.forecastEnd!)) : null

  const lateFinish = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const it = byId[id]
    if (it.forecastEnd === null || it.forecastStart === null || forecastFinish === null) continue
    const duration = it.forecastEnd - it.forecastStart
    let lf = forecastFinish
    for (const d of succs.get(id) ?? []) {
      const s = byId[d.successor_id]
      const sLf = lateFinish.get(s.id)
      if (sLf === undefined || s.forecastEnd === null || s.forecastStart === null) continue
      const sLs = sLf - (s.forecastEnd - s.forecastStart)
      const limit = d.kind === 'SS' ? sLs - d.lag_days + duration : sLs - 1 - d.lag_days
      lf = Math.min(lf, limit)
    }
    lateFinish.set(id, lf)
    it.floatDays = it.complete ? null : lf - it.forecastEnd
    it.critical = !it.complete && it.floatDays !== null && it.floatDays <= 0
  }

  for (const it of items) {
    const reference = it.baselineEnd ?? it.plannedEnd
    if (it.forecastEnd !== null && reference !== null) it.slipDays = it.forecastEnd - reference
  }

  const plannedEnds = items.map((i) => i.plannedEnd).filter((d): d is number => d !== null)
  const committedEnds = items
    .map((i) => i.baselineEnd ?? i.plannedEnd)
    .filter((d): d is number => d !== null)
  const baselineEnds = items.map((i) => i.baselineEnd).filter((d): d is number => d !== null)
  const starts = items
    .flatMap((i) => [i.plannedStart, i.forecastStart, i.baselineStart])
    .filter((d): d is number => d !== null)

  return {
    items,
    byId,
    start: starts.length ? Math.min(...starts) : null,
    forecastFinish,
    plannedFinish: plannedEnds.length ? Math.max(...plannedEnds) : null,
    baselineFinish: baselineEnds.length ? Math.max(...baselineEnds) : null,
    committedFinish: committedEnds.length ? Math.max(...committedEnds) : null,
    criticalPath: order.filter((id) => byId[id].critical),
    unscheduled: items.filter((i) => !i.scheduled).map((i) => i.id),
    today,
  }
}

/**
 * Change orders' schedule deltas, attributed to the work package they hit.
 *
 * A change order reaches a package through the NCR that raised it. Rejected
 * ones add nothing; one still awaiting the owner counts, flagged as pending,
 * because the plan should show the risk before the decision rather than after.
 */
export function delaysFromChangeOrders(
  changeOrders: Array<{
    co_number: string
    status: string
    schedule_delta_days: number | null
    defect_record_id: string | null
  }>,
  defects: Array<{ id: string; work_package_id: string | null }>,
): ScheduleDelay[] {
  const wpForDefect = new Map(defects.map((d) => [d.id, d.work_package_id]))
  const out: ScheduleDelay[] = []
  for (const co of changeOrders) {
    if (co.status === 'REJECTED' || !co.schedule_delta_days || !co.defect_record_id) continue
    const wp = wpForDefect.get(co.defect_record_id)
    if (!wp) continue
    out.push({
      work_package_id: wp,
      days: co.schedule_delta_days,
      source: co.co_number,
      pending: co.status === 'PENDING_APPROVAL' || co.status === 'DRAFT',
    })
  }
  return out
}

// ─── From a drop on the chart to a plan ─────────────────────────────────────

export type DragMode = 'move' | 'start' | 'end'

export interface DropPlan {
  /** Planned dates to store, as day numbers. */
  start: number
  end: number
  /** Why the plan is not exactly what was dropped, when it is not. */
  adjusted: string | null
}

/**
 * The planned dates that put a bar where it was let go of.
 *
 * The chart draws the forecast; the record stores the plan. They differ for
 * work under way (it runs from its actual start), for work that is late to
 * start (it cannot begin before today), for work held by a predecessor and
 * for work carrying change-order days (drawn on the end of the bar). Adding
 * the drag distance to the plan, as the chart used to, therefore moved the
 * record somewhere other than where the bar was dropped. This works back from
 * the dropped bar instead.
 *
 * `delta` is in days. Returns null when the item cannot be moved that way
 * (complete, unscheduled, or the start of work already under way).
 */
export function planForDrop(it: ScheduleItem, mode: DragMode, delta: number, today: number): DropPlan | null {
  if (it.complete || it.forecastStart === null || it.forecastEnd === null || it.plannedStart === null || it.plannedEnd === null) {
    return null
  }
  const delay = it.delayDays

  if (it.started) {
    // Under way: the start is a fact. Only the finish moves, whichever part
    // of the bar was dragged.
    if (mode === 'start') return null
    const end = Math.max(it.forecastStart, it.forecastEnd + delta - delay)
    return {
      start: Math.min(it.plannedStart, end),
      end,
      adjusted: mode === 'move' ? 'Work under way keeps its start; its finish moved' : null,
    }
  }

  let s = it.forecastStart
  let e = it.forecastEnd
  if (mode === 'move') {
    s += delta
    e += delta
  } else if (mode === 'start') {
    s = Math.min(e - delay, s + delta)
  } else {
    e = Math.max(s + delay, e + delta)
  }

  // Work not started cannot be planned to start in the past.
  let adjusted: string | null = null
  if (s < today) {
    adjusted = 'It has not started, so it cannot begin before today'
    if (mode === 'move') e += today - s
    s = today
  }
  return { start: s, end: Math.max(s, e - delay), adjusted }
}
