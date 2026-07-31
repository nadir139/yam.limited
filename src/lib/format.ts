import { format as formatDate, formatDistanceToNow } from 'date-fns'

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

export function day(iso: string | null | undefined, pattern = 'd MMM yyyy'): string {
  if (!iso) return NONE
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? NONE : formatDate(d, pattern)
}

export function sinceNow(iso: string | null | undefined): string {
  if (!iso) return NONE
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? NONE : formatDistanceToNow(d, { addSuffix: true })
}

/** Milliseconds for sorting; missing dates sort oldest rather than throwing. */
export const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0)

/** Numeric columns are nullable; totals and comparisons need a number. */
export const num = (n: number | null | undefined) => n ?? 0
