import { fromDay } from '@/lib/schedule'

// The time axis. Everything on the chart is positioned in whole days, from the
// same day numbers the schedule engine uses, so a bar and its forecast can
// never disagree about where a date is.

export type Zoom = 'day' | 'week' | 'month'

/** Pixels per day at each zoom level. */
export const DAY_WIDTH: Record<Zoom, number> = { day: 34, week: 14, month: 4.5 }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** Day of week, 0 = Sunday, for a day number. */
export const weekday = (day: number) => new Date(day * 86_400_000).getUTCDay()
export const isWeekend = (day: number) => {
  const w = weekday(day)
  return w === 0 || w === 6
}

export interface Tick {
  day: number
  span: number
  label: string
  /** Emphasised boundary (month start, or week start in day view). */
  strong?: boolean
}

/** Top row: months (or years in month view). Bottom row: days, weeks or months. */
export function headerTicks(from: number, to: number, zoom: Zoom): { top: Tick[]; bottom: Tick[] } {
  const top: Tick[] = []
  const bottom: Tick[] = []

  const ymd = (d: number) => {
    const s = fromDay(d)
    return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1, d: Number(s.slice(8, 10)) }
  }

  // Top row
  let cursor = from
  while (cursor <= to) {
    const { y, m } = ymd(cursor)
    let end = cursor
    while (end + 1 <= to) {
      const n = ymd(end + 1)
      if (zoom === 'month' ? n.y !== y : n.m !== m || n.y !== y) break
      end++
    }
    top.push({
      day: cursor,
      span: end - cursor + 1,
      label: zoom === 'month' ? String(y) : `${MONTHS[m]} ${y}`,
      strong: true,
    })
    cursor = end + 1
  }

  // Bottom row
  cursor = from
  while (cursor <= to) {
    const { y, m, d } = ymd(cursor)
    if (zoom === 'day') {
      bottom.push({ day: cursor, span: 1, label: `${WEEKDAYS[weekday(cursor)]}${d}`, strong: weekday(cursor) === 1 })
      cursor++
    } else if (zoom === 'week') {
      // Weeks start on Monday.
      let end = cursor
      while (end + 1 <= to && weekday(end + 1) !== 1) end++
      bottom.push({ day: cursor, span: end - cursor + 1, label: String(d) })
      cursor = end + 1
    } else {
      let end = cursor
      while (end + 1 <= to) {
        const n = ymd(end + 1)
        if (n.m !== m || n.y !== y) break
        end++
      }
      bottom.push({ day: cursor, span: end - cursor + 1, label: MONTHS[m] })
      cursor = end + 1
    }
  }

  return { top, bottom }
}

/** Short human date for tooltips and the side panel. */
export function shortDate(day: number | null): string {
  if (day === null) return '—'
  const s = fromDay(day)
  return `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`
}

export const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`
