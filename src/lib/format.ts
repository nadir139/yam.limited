import { format as formatDate, formatDistanceToNow, parseISO } from 'date-fns'

// Rendering values that may not be there.
//
// Almost every numeric and date column in this schema is nullable, and a
// project created through the app has most of them empty on day one — no
// budget, no planned dates. Turning on `strictNullChecks` surfaced thirty-one
// places that assumed otherwise, in two shapes:
//
//   Math.round((actual / planned) * 100)   → NaN when both are 0 or null
//   format(new Date(planned_start), …)     → "Invalid Date" when null
//
// The first shape had already shipped once as "NaN% used" on the dashboard of
// every newly created project. These helpers are what stop it being fixed one
// site at a time.

/** An em dash, not "0" or "null" — absence is a fact worth showing as one. */
export const NONE = '—'

export function eur(n: number | null | undefined): string {
  if (n == null) return NONE
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

/**
 * A percentage, or null when it cannot honestly be computed.
 *
 * Returns null rather than 0 for "no budget set": those are different facts,
 * and a progress bar sitting at 0% implies a budget nobody has agreed.
 */
export function percent(part: number | null | undefined, whole: number | null | undefined) {
  if (part == null || whole == null || whole <= 0) return null
  return Math.round((part / whole) * 100)
}

/** `42%`, or an em dash when there is nothing to divide by. */
export function percentLabel(part: number | null | undefined, whole: number | null | undefined) {
  const p = percent(part, whole)
  return p == null ? NONE : `${p}%`
}

/** Safe for a progress bar, which needs a number even when the truth is "unknown". */
export const percentValue = (
  part: number | null | undefined,
  whole: number | null | undefined,
) => percent(part, whole) ?? 0

/**
 * Parses a `date` or `timestamptz` value.
 *
 * Not `new Date(iso)`: that reads a bare `2026-10-06` as UTC midnight, which
 * is the previous evening anywhere west of Greenwich and 02:00 in Sardinia.
 * parseISO reads a date-only value as local midnight — the day it names.
 */
export function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = parseISO(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function day(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  const d = parseDay(iso)
  return d ? formatDate(d, pattern) : NONE
}

/**
 * Today as a `date` column value, in the viewer's own timezone.
 *
 * `new Date().toISOString().split('T')[0]` is today in UTC — so a result
 * recorded at 01:00 in Sardinia was filed against yesterday.
 */
export const localToday = () => formatDate(new Date(), 'yyyy-MM-dd')

/**
 * Whether a `date` deadline has passed. A deadline is the whole of its day:
 * an approval due today is due, not overdue.
 */
export const isOverdue = (date: string | null | undefined) =>
  Boolean(date) && date!.slice(0, 10) < localToday()

export function sinceNow(iso: string | null | undefined): string {
  if (!iso) return NONE
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? NONE : formatDistanceToNow(d, { addSuffix: true })
}

/** Milliseconds for sorting; missing dates sort oldest rather than throwing. */
export const at = (iso: string | null | undefined) => parseDay(iso)?.getTime() ?? 0

/** Numeric columns are nullable; totals and comparisons need a number. */
export const num = (n: number | null | undefined) => n ?? 0
