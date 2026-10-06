import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Lock, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ScheduleDependency, ScheduleItem, ScheduleResult } from '@/lib/schedule'
import { DAY_WIDTH, headerTicks, isWeekend, plural, shortDate, type Zoom } from './scale'

// The Gantt is a view of the world model in time, not a separate plan.
//
// Every bar is a work package; its position is the engine's forecast, so a bar
// that a late predecessor or an unapproved change order has pushed sits where
// the work will actually happen, with the original plan drawn as a ghost
// behind it. Inspections are milestones on their package's row, owner
// approvals are gates, open NCRs are marks on the package they hit. Moving a
// bar calls an Action, so the chart can only say what the record says.

export type GroupBy = 'discipline' | 'status' | 'none'

export interface GanttMarker {
  /** Row to draw on: a work package id, or null for the project row. */
  workPackageId: string | null
  day: number
  kind: 'inspection' | 'gate' | 'ncr'
  label: string
  tone: 'ok' | 'warn' | 'bad' | 'neutral'
}

export interface GanttLine {
  day: number
  label: string
  tone: 'today' | 'plan' | 'forecast' | 'baseline'
  /** Which side of the day the line marks: a start is its morning, a finish its evening. */
  edge?: 'start' | 'end'
}

export interface GanttProps {
  schedule: ScheduleResult
  dependencies: ScheduleDependency[]
  markers?: GanttMarker[]
  lines?: GanttLine[]
  zoom: Zoom
  groupBy?: GroupBy
  showBaseline?: boolean
  showDependencies?: boolean
  editable?: boolean
  linkMode?: boolean
  /** Work packages to emphasise (e.g. the ones the agent just changed). */
  highlight?: Set<string>
  selectedId?: string | null
  /** Smaller rows, no left table interactions — for the chat. */
  compact?: boolean
  /** Only these items, in this order (the mini chart). Defaults to all. */
  onlyIds?: string[]
  onReschedule?: (id: string, start: number, end: number) => void
  onPlace?: (id: string, day: number) => void
  onLink?: (predecessorId: string, successorId: string) => void
  onSelect?: (id: string) => void
  /** Scroll so this day is in view on first render. */
  focusDay?: number | null
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'hsl(215 20% 62%)',
  SCOPED: 'hsl(215 55% 52%)',
  ACTIVE: 'hsl(185 60% 40%)',
  EXPANDED: 'hsl(38 85% 50%)',
  ON_HOLD: 'hsl(215 10% 55%)',
  COMPLETE: 'hsl(152 50% 40%)',
}

const TONE: Record<GanttMarker['tone'], string> = {
  ok: 'hsl(152 55% 40%)',
  warn: 'hsl(38 90% 50%)',
  bad: 'hsl(0 72% 51%)',
  neutral: 'hsl(215 20% 55%)',
}

const LINE_COLOR: Record<GanttLine['tone'], string> = {
  today: 'hsl(185 70% 42%)',
  plan: 'hsl(215 50% 40%)',
  forecast: 'hsl(0 72% 51%)',
  baseline: 'hsl(215 15% 55%)',
}

type Row =
  | { kind: 'group'; key: string; label: string; items: ScheduleItem[] }
  | { kind: 'item'; item: ScheduleItem }

interface Drag {
  id: string
  mode: 'move' | 'start' | 'end'
  originX: number
  delta: number
  moved: boolean
}

export default function Gantt({
  schedule,
  dependencies,
  markers = [],
  lines = [],
  zoom,
  groupBy = 'none',
  showBaseline = true,
  showDependencies = true,
  editable = false,
  linkMode = false,
  highlight,
  selectedId,
  compact = false,
  onlyIds,
  onReschedule,
  onPlace,
  onLink,
  onSelect,
  focusDay,
}: GanttProps) {
  const ROW = compact ? 28 : 38
  const HEADER = compact ? 40 : 50
  const LEFT = compact ? 200 : 300
  const dw = DAY_WIDTH[zoom]

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!linkMode) setLinkFrom(null)
  }, [linkMode])

  // ── Range ────────────────────────────────────────────────────────────────
  const items = useMemo(() => {
    if (!onlyIds) return schedule.items
    return onlyIds.map((id) => schedule.byId[id]).filter((i): i is ScheduleItem => Boolean(i))
  }, [schedule, onlyIds])

  const [from, to] = useMemo(() => {
    const days: number[] = [schedule.today]
    for (const it of items) {
      for (const d of [it.forecastStart, it.forecastEnd, it.plannedStart, it.plannedEnd, it.baselineStart, it.baselineEnd]) {
        if (d !== null) days.push(d)
      }
    }
    for (const m of markers) days.push(m.day)
    for (const l of lines) days.push(l.day)
    const pad = zoom === 'month' ? 30 : zoom === 'week' ? 14 : 5
    let lo = Math.min(...days) - pad
    let hi = Math.max(...days) + pad * 2
    if (hi - lo < (zoom === 'day' ? 30 : zoom === 'week' ? 90 : 365)) hi = lo + (zoom === 'day' ? 30 : zoom === 'week' ? 90 : 365)
    // Start the axis on a Monday so week columns line up.
    while (new Date(lo * 86_400_000).getUTCDay() !== 1) lo--
    return [lo, hi]
  }, [items, markers, lines, schedule.today, zoom])

  const totalDays = to - from + 1
  const trackWidth = totalDays * dw
  const x = (day: number) => (day - from) * dw

  const ticks = useMemo(() => headerTicks(from, to, zoom), [from, to, zoom])

  // ── Rows ─────────────────────────────────────────────────────────────────
  const rows: Row[] = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (onlyIds) return 0
      const sa = a.forecastStart ?? Number.MAX_SAFE_INTEGER
      const sb = b.forecastStart ?? Number.MAX_SAFE_INTEGER
      return sa - sb || a.wpNumber.localeCompare(b.wpNumber)
    })
    if (groupBy === 'none') return sorted.map((item) => ({ kind: 'item', item }) as Row)
    const groups = new Map<string, ScheduleItem[]>()
    for (const it of sorted) {
      const key = groupBy === 'discipline' ? it.discipline : it.status
      groups.set(key, [...(groups.get(key) ?? []), it])
    }
    const out: Row[] = []
    for (const [key, list] of groups) {
      out.push({ kind: 'group', key, label: key.replace(/_/g, ' '), items: list })
      if (!collapsed.has(key)) for (const item of list) out.push({ kind: 'item', item })
    }
    return out
  }, [items, groupBy, collapsed, onlyIds])

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.kind === 'item') m.set(r.item.id, i)
    })
    return m
  }, [rows])

  // Scroll today (or the requested day) into view once.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !scrollRef.current) return
    const target = focusDay ?? schedule.today
    scrollRef.current.scrollLeft = Math.max(0, x(target) - (scrollRef.current.clientWidth - LEFT) / 3)
    scrolled.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from])

  // ── Dragging ─────────────────────────────────────────────────────────────
  const beginDrag = (e: ReactPointerEvent, item: ScheduleItem, mode: Drag['mode']) => {
    if (linkMode) return
    e.stopPropagation()
    if (!editable || item.complete || !item.scheduled) {
      onSelect?.(item.id)
      return
    }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({ id: item.id, mode, originX: e.clientX, delta: 0, moved: false })
  }

  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return
    const px = e.clientX - drag.originX
    const delta = Math.round(px / dw)
    if (delta !== drag.delta || (!drag.moved && Math.abs(px) > 3)) {
      setDrag({ ...drag, delta, moved: drag.moved || Math.abs(px) > 3 })
    }
  }

  const endDrag = () => {
    if (!drag) return
    const item = schedule.byId[drag.id]
    if (!drag.moved) {
      onSelect?.(drag.id)
    } else if (drag.delta !== 0 && item.plannedStart !== null && item.plannedEnd !== null) {
      let start = item.plannedStart
      let end = item.plannedEnd
      if (drag.mode === 'move') {
        start += drag.delta
        end += drag.delta
      } else if (drag.mode === 'end') {
        end = Math.max(start, end + drag.delta)
      } else {
        start = Math.min(end, start + drag.delta)
      }
      onReschedule?.(item.id, start, end)
    }
    setDrag(null)
  }

  const clickBar = (item: ScheduleItem) => {
    if (!linkMode) return
    if (!linkFrom) {
      setLinkFrom(item.id)
    } else if (linkFrom !== item.id) {
      onLink?.(linkFrom, item.id)
      setLinkFrom(null)
    }
  }

  // ── Geometry for one item (with any drag applied) ────────────────────────
  const geometry = (it: ScheduleItem) => {
    if (it.forecastStart === null || it.forecastEnd === null) return null
    let s = it.forecastStart
    let e = it.forecastEnd
    if (drag && drag.id === it.id && drag.moved) {
      if (drag.mode === 'move') {
        s += drag.delta
        e += drag.delta
      } else if (drag.mode === 'end') e = Math.max(s, e + drag.delta)
      else s = Math.min(e, s + drag.delta)
    }
    return { left: x(s), width: Math.max(dw, (e - s + 1) * dw), s, e }
  }

  const markersByRow = useMemo(() => {
    const m = new Map<string, GanttMarker[]>()
    for (const mk of markers) {
      const key = mk.workPackageId ?? '__project'
      m.set(key, [...(m.get(key) ?? []), mk])
    }
    return m
  }, [markers])

  const muted = 'hsl(var(--muted-foreground))'
  const border = 'hsl(var(--border))'

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={scrollRef}
      className="relative overflow-auto rounded-[var(--radius)] border select-none"
      style={{ borderColor: border, background: 'hsl(var(--card))', maxHeight: compact ? 320 : 'calc(100vh - 260px)' }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
    >
      <div style={{ width: LEFT + trackWidth, position: 'relative' }}>
        {/* Header */}
        <div
          className="sticky top-0 z-30 flex"
          style={{ height: HEADER, background: 'hsl(var(--card))', borderBottom: `1px solid ${border}` }}
        >
          <div
            className="sticky left-0 z-40 flex items-end px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ width: LEFT, minWidth: LEFT, background: 'hsl(var(--card))', color: muted, borderRight: `1px solid ${border}` }}
          >
            Work package
          </div>
          <div className="relative" style={{ width: trackWidth }}>
            {ticks.top.map((t) => (
              <div
                key={`t${t.day}`}
                className="absolute top-0 truncate px-1.5 text-[11px] font-semibold"
                style={{ left: x(t.day), width: t.span * dw, height: HEADER / 2, lineHeight: `${HEADER / 2}px`, borderLeft: `1px solid ${border}` }}
              >
                {t.span * dw > 40 ? t.label : ''}
              </div>
            ))}
            {ticks.bottom.map((t) => (
              <div
                key={`b${t.day}`}
                className="absolute truncate text-center text-[10px]"
                style={{
                  left: x(t.day),
                  width: t.span * dw,
                  top: HEADER / 2,
                  height: HEADER / 2,
                  lineHeight: `${HEADER / 2}px`,
                  color: zoom === 'day' && isWeekend(t.day) ? 'hsl(var(--muted-foreground) / 0.6)' : muted,
                  borderLeft: `1px solid ${t.strong ? border : 'transparent'}`,
                  fontWeight: t.day === schedule.today ? 700 : 400,
                }}
              >
                {t.span * dw >= 14 ? t.label : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="relative">
          {/* Weekend shading and vertical lines, behind the rows */}
          <div className="pointer-events-none absolute top-0 bottom-0" style={{ left: LEFT, width: trackWidth }}>
            {zoom !== 'month' &&
              Array.from({ length: totalDays }, (_, i) => from + i)
                .filter(isWeekend)
                .map((d) => (
                  <div key={d} className="absolute top-0 bottom-0" style={{ left: x(d), width: dw, background: 'hsl(var(--muted) / 0.45)' }} />
                ))}
            {lines.map((l) => (
              <div
                key={`${l.tone}${l.day}`}
                className="absolute top-0 bottom-0 z-20"
                title={`${l.label} · ${shortDate(l.day)}`}
                style={{
                  left: x(l.day) + (l.tone === 'today' ? dw / 2 : l.edge === 'start' ? 0 : dw),
                  width: 0,
                  borderLeft: `${l.tone === 'today' ? 2 : 1.5}px ${l.tone === 'today' ? 'solid' : 'dashed'} ${LINE_COLOR[l.tone]}`,
                }}
              />
            ))}
          </div>

          {rows.map((row, i) => {
            if (row.kind === 'group') {
              const spans = row.items.filter((it) => it.forecastStart !== null)
              const gs = spans.length ? Math.min(...spans.map((s) => s.forecastStart!)) : null
              const ge = spans.length ? Math.max(...spans.map((s) => s.forecastEnd!)) : null
              const isCollapsed = collapsed.has(row.key)
              return (
                <div key={`g${row.key}`} className="flex" style={{ height: ROW, borderBottom: `1px solid ${border}`, background: 'hsl(var(--muted) / 0.35)' }}>
                  <button
                    type="button"
                    className="sticky left-0 z-10 flex items-center gap-1.5 px-2 text-left text-xs font-semibold uppercase tracking-wide"
                    style={{ width: LEFT, minWidth: LEFT, background: 'hsl(var(--muted))', borderRight: `1px solid ${border}` }}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        if (next.has(row.key)) next.delete(row.key)
                        else next.add(row.key)
                        return next
                      })
                    }
                  >
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {row.label}
                    <span className="font-normal normal-case" style={{ color: muted }}>
                      · {row.items.length}
                    </span>
                  </button>
                  <div className="relative" style={{ width: trackWidth }}>
                    {gs !== null && ge !== null && (
                      <div
                        className="absolute rounded-sm"
                        title={`${row.label}: ${shortDate(gs)} → ${shortDate(ge)}`}
                        style={{ left: x(gs), width: (ge - gs + 1) * dw, top: ROW / 2 - 3, height: 6, background: 'hsl(var(--foreground) / 0.35)' }}
                      />
                    )}
                  </div>
                </div>
              )
            }

            const it = row.item
            const g = geometry(it)
            const color = STATUS_COLOR[it.status] ?? STATUS_COLOR.DRAFT
            const isSelected = selectedId === it.id
            const isHighlighted = highlight?.has(it.id)
            const isLinkSource = linkFrom === it.id
            const rowMarkers = markersByRow.get(it.id) ?? []
            const ghostShift =
              it.plannedStart !== null && it.forecastStart !== null &&
              (it.plannedStart !== it.forecastStart || it.plannedEnd !== it.forecastEnd)

            return (
              <div
                key={it.id}
                className="flex"
                style={{
                  height: ROW,
                  borderBottom: `1px solid ${border}`,
                  background: isSelected ? 'hsl(var(--accent) / 0.08)' : isHighlighted ? 'hsl(38 90% 50% / 0.08)' : undefined,
                }}
              >
                {/* Left table */}
                <button
                  type="button"
                  onClick={() => onSelect?.(it.id)}
                  className="sticky left-0 z-10 flex min-w-0 items-center gap-2 px-3 text-left"
                  style={{ width: LEFT, minWidth: LEFT, background: 'hsl(var(--card))', borderRight: `1px solid ${border}` }}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color }} title={it.status} />
                  <span className="flex-shrink-0 font-mono text-[11px] font-semibold" style={{ color: 'hsl(var(--accent))' }}>
                    {it.wpNumber}
                  </span>
                  <span className={`min-w-0 truncate ${compact ? 'text-xs' : 'text-[13px]'}`}>{it.title}</span>
                  {!compact && it.slipDays !== null && it.slipDays > 0 && (
                    <span className="ml-auto flex-shrink-0 text-[10px] font-semibold" style={{ color: TONE.bad }} title="Slip against the baseline (or the plan, with no baseline)">
                      +{it.slipDays}d
                    </span>
                  )}
                </button>

                {/* Track */}
                <div
                  className="relative"
                  style={{ width: trackWidth, cursor: !it.scheduled && editable && onPlace ? 'copy' : undefined }}
                  onClick={(e) => {
                    if (it.scheduled || !editable || !onPlace) return
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                    onPlace(it.id, from + Math.floor((e.clientX - rect.left) / dw))
                  }}
                >
                  {!it.scheduled && !compact && (
                    <div className="pointer-events-none absolute inset-y-0 flex items-center text-[11px] italic" style={{ left: x(schedule.today) + 8, color: muted }}>
                      {editable && onPlace ? 'Not scheduled — click on the timeline to place it' : 'Not scheduled'}
                    </div>
                  )}

                  {/* Baseline */}
                  {showBaseline && it.baselineStart !== null && it.baselineEnd !== null && (
                    <div
                      className="absolute rounded-sm"
                      title={`Baseline ${shortDate(it.baselineStart)} → ${shortDate(it.baselineEnd)}`}
                      style={{ left: x(it.baselineStart), width: (it.baselineEnd - it.baselineStart + 1) * dw, bottom: 3, height: 4, background: 'hsl(var(--foreground) / 0.22)' }}
                    />
                  )}

                  {/* The plan, when the forecast has moved away from it */}
                  {ghostShift && it.plannedStart !== null && it.plannedEnd !== null && (
                    <div
                      className="absolute rounded"
                      title={`Planned ${shortDate(it.plannedStart)} → ${shortDate(it.plannedEnd)}`}
                      style={{ left: x(it.plannedStart), width: (it.plannedEnd - it.plannedStart + 1) * dw, top: 6, height: ROW - 14, border: `1.5px dashed ${color}`, opacity: 0.55 }}
                    />
                  )}

                  {/* The bar: the forecast */}
                  {g && (
                    <div
                      onPointerDown={(e) => beginDrag(e, it, 'move')}
                      onClick={() => clickBar(it)}
                      title={[
                        `${it.wpNumber} · ${it.title}`,
                        `Forecast ${shortDate(g.s)} → ${shortDate(g.e)} (${plural(g.e - g.s + 1, 'day')})`,
                        it.drivenBy && it.drivenBy !== 'not started' ? `Pushed by ${it.drivenBy}` : '',
                        it.lateStart ? 'Planned start has passed and work has not started' : '',
                        it.overdue ? 'Past its end and not complete' : '',
                        it.delayDays ? `+${it.delayDays}d from ${it.delaySources.join(', ')}` : '',
                        it.awaitingApproval ? 'A change order on it awaits the owner' : '',
                        it.critical ? 'On the critical path' : it.floatDays !== null ? `${plural(it.floatDays, 'day')} of float` : '',
                      ].filter(Boolean).join('\n')}
                      className="absolute flex items-center overflow-hidden rounded"
                      style={{
                        left: g.left,
                        width: g.width,
                        top: compact ? 5 : 7,
                        height: ROW - (compact ? 10 : 16),
                        background: it.status === 'ON_HOLD'
                          ? `repeating-linear-gradient(135deg, ${color}, ${color} 4px, hsl(var(--card)) 4px, hsl(var(--card)) 7px)`
                          : color,
                        boxShadow: [
                          it.critical ? '0 0 0 2px hsl(0 72% 51%)' : '',
                          isSelected || isLinkSource ? '0 0 0 2px hsl(var(--foreground))' : '',
                          isHighlighted ? '0 0 0 3px hsl(38 90% 50% / 0.6)' : '',
                        ].filter(Boolean).join(', ') || undefined,
                        cursor: linkMode ? 'crosshair' : editable && !it.complete ? 'grab' : 'pointer',
                        opacity: drag?.id === it.id ? 0.85 : 1,
                        zIndex: 5,
                      }}
                    >
                      {/* Progress to today on work under way */}
                      {it.started && !it.complete && g.s <= schedule.today && (
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{ width: Math.min(g.width, (schedule.today - g.s + 1) * dw), background: 'hsl(0 0% 0% / 0.18)' }}
                        />
                      )}
                      {/* Days added by change orders, at the end of the bar */}
                      {it.delayDays > 0 && (
                        <div
                          className="absolute inset-y-0 right-0"
                          style={{ width: Math.min(g.width, it.delayDays * dw), background: 'repeating-linear-gradient(135deg, hsl(0 72% 51% / 0.55), hsl(0 72% 51% / 0.55) 3px, transparent 3px, transparent 6px)' }}
                        />
                      )}
                      {g.width > 46 && (
                        <span className="relative truncate px-1.5 font-mono text-[10px] font-semibold text-white">
                          {it.wpNumber}
                        </span>
                      )}
                      {it.awaitingApproval && <Lock size={10} className="relative ml-auto mr-1 flex-shrink-0 text-white" />}
                      {(it.lateStart || it.overdue) && <AlertTriangle size={10} className="relative mr-1 flex-shrink-0 text-white" />}

                      {editable && !it.complete && !linkMode && (
                        <>
                          <div
                            onPointerDown={(e) => beginDrag(e, it, 'start')}
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40"
                          />
                          <div
                            onPointerDown={(e) => beginDrag(e, it, 'end')}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40"
                          />
                        </>
                      )}
                    </div>
                  )}

                  {/* Bar label outside, when the bar is too short to hold it */}
                  {g && g.width <= 46 && !compact && (
                    <span className="pointer-events-none absolute truncate text-[10px]" style={{ left: g.left + g.width + 4, top: ROW / 2 - 7, color: muted, maxWidth: 160 }}>
                      {it.title}
                    </span>
                  )}

                  {/* Milestones, gates and NCRs on this package */}
                  {rowMarkers.map((m, j) => (
                    <div
                      key={j}
                      title={`${m.label} · ${shortDate(m.day)}`}
                      className="absolute z-10"
                      style={{
                        left: x(m.day) + dw / 2 - (m.kind === 'ncr' ? 4 : 6),
                        top: m.kind === 'ncr' ? 2 : ROW / 2 - 6,
                        width: m.kind === 'ncr' ? 8 : 12,
                        height: m.kind === 'ncr' ? 8 : 12,
                        borderRadius: m.kind === 'ncr' ? '50%' : 2,
                        transform: m.kind === 'ncr' ? undefined : 'rotate(45deg)',
                        background: m.kind === 'gate' ? 'hsl(var(--card))' : TONE[m.tone],
                        border: `2px solid ${TONE[m.tone]}`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Dependencies */}
          {showDependencies && (
            <svg
              className="pointer-events-none absolute top-0 z-[6]"
              style={{ left: LEFT }}
              width={trackWidth}
              height={rows.length * ROW}
            >
              <defs>
                <marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="hsl(var(--muted-foreground))" />
                </marker>
                <marker id="gantt-arrow-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="hsl(0 72% 51%)" />
                </marker>
              </defs>
              {dependencies.map((d) => {
                const pi = rowIndex.get(d.predecessor_id)
                const si = rowIndex.get(d.successor_id)
                if (pi === undefined || si === undefined) return null
                const p = schedule.byId[d.predecessor_id]
                const s = schedule.byId[d.successor_id]
                const pg = geometry(p)
                const sg = geometry(s)
                if (!pg || !sg) return null
                const y1 = pi * ROW + ROW / 2
                const y2 = si * ROW + ROW / 2
                const x1 = d.kind === 'SS' ? pg.left : pg.left + pg.width
                const x2 = sg.left
                const out = d.kind === 'SS' ? x1 - 8 : x1 + 8
                const midY = y1 + (y2 > y1 ? ROW / 2 : -ROW / 2)
                const path = x2 - 8 >= out
                  ? `M${x1},${y1} H${out} V${y2} H${x2}`
                  : `M${x1},${y1} H${out} V${midY} H${x2 - 10} V${y2} H${x2}`
                const crit = p.critical && s.critical
                return (
                  <path
                    key={`${d.predecessor_id}${d.successor_id}`}
                    d={path}
                    fill="none"
                    stroke={crit ? 'hsl(0 72% 51%)' : 'hsl(var(--muted-foreground))'}
                    strokeWidth={crit ? 1.6 : 1.2}
                    strokeOpacity={crit ? 0.9 : 0.6}
                    markerEnd={`url(#${crit ? 'gantt-arrow-crit' : 'gantt-arrow'})`}
                  />
                )
              })}
            </svg>
          )}
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-sm" style={{ color: muted }}>
            No work packages yet.
          </div>
        )}
      </div>

      {linkMode && (
        <div
          className="sticky bottom-2 left-2 z-40 m-2 inline-block rounded-md px-3 py-1.5 text-xs shadow"
          style={{ background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
        >
          {linkFrom
            ? `Now click the package that waits on ${schedule.byId[linkFrom]?.wpNumber}`
            : 'Click the package that must happen first'}
        </div>
      )}
    </div>
  )
}
