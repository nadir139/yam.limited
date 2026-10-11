// Hours of rest, as STCW (A-VIII/1) and MLC 2006 (Standard A2.3) count them.
//
// A month's record is one row per day of 48 half-hours, true where the person
// was working. Half-hours rather than hours because watches change on the half
// hour often enough that an hourly grid either over- or under-states rest,
// and the record is evidence: a port state inspector reads it against the
// rules below.
//
//   1. At least 10 hours of rest in any 24-hour period.
//   2. At least 77 hours of rest in any 7-day period.
//   3. Rest in no more than two periods, one of them at least 6 hours long.
//      Counted per day: the rest periods that START that day (a night's rest
//      running over midnight is one period, counted on the evening it began),
//      and among the periods that overlap the day, one of 6 hours or more.
//      Breaks under an hour are not rest periods: STCW excludes short
//      breaks, and a coffee break must not count as a third period.
//   4. No more than 14 hours between consecutive rest periods, so no stretch
//      of work longer than 14 hours.
//
// Days left unrecorded are unknown, not rest: no window that touches one is
// judged. The same rules run in the database (rest_breaches, migration
// 033) so the record stored is judged by the server, not by the browser that
// sent it; the tests below and the SQL test use the same cases.

export const SLOTS_PER_DAY = 48
export const SLOT_HOURS = 0.5
/** Shorter rest than this is a break, not a rest period. */
export const MIN_REST_PERIOD_HOURS = 1

/** day of month ("1".."31") → 48 booleans, true = working that half-hour. */
export type RestSchedule = Record<string, boolean[]>

export type RestRule = 'REST_24H' | 'REST_7D' | 'TWO_PERIODS' | 'MAX_WORK_14H'

export const RULE_TEXT: Record<RestRule, string> = {
  REST_24H: 'Less than 10 hours of rest in a 24-hour period',
  REST_7D: 'Less than 77 hours of rest in a 7-day period',
  TWO_PERIODS: 'Rest split into more than two periods, or none of at least 6 hours',
  MAX_WORK_14H: 'More than 14 hours between rest periods',
}

export interface Breach {
  /** Day of month the breach is counted on: where its window starts, or where the long stretch ends. */
  day: number
  rule: RestRule
}

export interface DaySummary {
  day: number
  recorded: boolean
  restHours: number
  workHours: number
}

export interface RestResult {
  days: DaySummary[]
  breaches: Breach[]
  /** Days of the month with at least one breach, ascending. */
  breachDays: number[]
}

const isRow = (v: unknown): v is boolean[] => Array.isArray(v) && v.length === SLOTS_PER_DAY && v.every((x) => typeof x === 'boolean')

/** A valid day row, or null when the day is not recorded (or malformed). */
export const dayRow = (s: RestSchedule, day: number): boolean[] | null => {
  const r = s[String(day)]
  return isRow(r) ? r : null
}

/**
 * Rest periods within one day: lengths in slots. A period that runs over
 * midnight is split at it, as the per-day forms record it.
 */
export function restPeriods(row: boolean[]): number[] {
  const out: number[] = []
  let run = 0
  for (const working of row) {
    if (!working) run++
    else if (run) {
      out.push(run)
      run = 0
    }
  }
  if (run) out.push(run)
  return out
}

export function checkMonth(schedule: RestSchedule, daysInMonth: number): RestResult {
  const rows: Array<boolean[] | null> = []
  for (let d = 1; d <= daysInMonth; d++) rows.push(dayRow(schedule, d))
  // The month as one line of half-hours; null where the day is unrecorded.
  const slots: Array<boolean | null> = rows.flatMap((r) => (r ? r : Array<null>(SLOTS_PER_DAY).fill(null)))
  const breaches: Breach[] = []
  const add = (day: number, rule: RestRule) => {
    if (!breaches.some((b) => b.day === day && b.rule === rule)) breaches.push({ day, rule })
  }

  // Rest in slots [from, from + len), or null if any of them is unrecorded.
  const restIn = (from: number, len: number): number | null => {
    if (from + len > slots.length) return null
    let rest = 0
    for (let i = from; i < from + len; i++) {
      const s = slots[i]
      if (s === null) return null
      if (!s) rest++
    }
    return rest
  }

  // 1. Every 24-hour window, starting on each half-hour.
  const day24 = SLOTS_PER_DAY
  for (let start = 0; start + day24 <= slots.length; start++) {
    const rest = restIn(start, day24)
    if (rest !== null && rest * SLOT_HOURS < 10) add(Math.floor(start / SLOTS_PER_DAY) + 1, 'REST_24H')
  }

  // 2. Every 7-day window, starting at the beginning of each day.
  for (let d = 0; d + 7 <= daysInMonth; d++) {
    const rest = restIn(d * SLOTS_PER_DAY, 7 * SLOTS_PER_DAY)
    if (rest !== null && rest * SLOT_HOURS < 77) add(d + 1, 'REST_7D')
  }

  // 3. Rest periods on the month's line: [start, end) in slots, an hour or
  //    longer, unbroken across midnight; an unrecorded day ends a period.
  const periods: Array<[number, number]> = []
  for (let i = 0; i < slots.length; ) {
    if (slots[i] !== false) {
      i++
      continue
    }
    let j = i
    while (j < slots.length && slots[j] === false) j++
    if ((j - i) * SLOT_HOURS >= MIN_REST_PERIOD_HOURS) periods.push([i, j])
    i = j
  }
  rows.forEach((row, i) => {
    if (!row) return
    const from = i * SLOTS_PER_DAY
    const to = from + SLOTS_PER_DAY
    // A period at the very start of the record (or after an unrecorded day)
    // began at some unknown earlier time, not at midnight: not counted as new.
    const starting = periods.filter(([a]) => a >= from && a < to && !(a === 0 || slots[a - 1] === null))
    const overlapping = periods.filter(([a, b]) => a < to && b > from)
    if (starting.length > 2 || !overlapping.some(([a, b]) => (b - a) * SLOT_HOURS >= 6)) add(i + 1, 'TWO_PERIODS')
  })

  // 4. No stretch of work longer than 14 hours, across midnight too. An
  //    unrecorded day breaks the stretch: what happened then is unknown.
  let stretch = 0
  slots.forEach((s, i) => {
    if (s === true) {
      stretch++
      if (stretch * SLOT_HOURS > 14) add(Math.floor(i / SLOTS_PER_DAY) + 1, 'MAX_WORK_14H')
    } else stretch = 0
  })

  const days: DaySummary[] = rows.map((row, i) => {
    const work = row ? row.filter(Boolean).length * SLOT_HOURS : 0
    return { day: i + 1, recorded: !!row, workHours: work, restHours: row ? 24 - work : 0 }
  })
  breaches.sort((a, b) => a.day - b.day || a.rule.localeCompare(b.rule))
  return { days, breaches, breachDays: [...new Set(breaches.map((b) => b.day))] }
}

/** "08:00-12:00, 14:00-18:00" → slots marked as work; null if it cannot be read. */
export function parseWorkRanges(text: string): boolean[] | null {
  const row = Array<boolean>(SLOTS_PER_DAY).fill(false)
  const parts = text.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return row
  for (const part of parts) {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|to)\s*(\d{1,2})(?:[:.](\d{2}))?$/.exec(part)
    if (!m) return null
    const toSlot = (h: string, min?: string) => {
      const hh = Number(h)
      const mm = min ? Number(min) : 0
      if (hh > 24 || (mm !== 0 && mm !== 30) || (hh === 24 && mm !== 0)) return null
      return hh * 2 + (mm === 30 ? 1 : 0)
    }
    const a = toSlot(m[1], m[2])
    const b = toSlot(m[3], m[4])
    if (a === null || b === null || a === b) return null
    // "20:00-04:00" runs over midnight: the part after it is the next day's,
    // and this row only holds this day, so mark to midnight and from midnight.
    if (a < b) for (let i = a; i < b; i++) row[i] = true
    else {
      for (let i = a; i < SLOTS_PER_DAY; i++) row[i] = true
      for (let i = 0; i < b; i++) row[i] = true
    }
  }
  return row
}

/** "08:00–12:00, 14:00–18:00": the work in a day row, as written by hand. */
export function describeRow(row: boolean[]): string {
  const out: string[] = []
  const t = (s: number) => `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
  for (let i = 0; i < SLOTS_PER_DAY; ) {
    if (!row[i]) {
      i++
      continue
    }
    let j = i
    while (j < SLOTS_PER_DAY && row[j]) j++
    out.push(`${t(i)}–${j === SLOTS_PER_DAY ? '24:00' : t(j)}`)
    i = j
  }
  return out.join(', ')
}
