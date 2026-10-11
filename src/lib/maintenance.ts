// What is due, in words and colours (migration 036).
//
// service_due() in the database decides the status; this only presents it,
// so the page, the part's tab, the 3D view and the agent never disagree
// about whether something is overdue.

import type { ServiceDue, ServiceStatus } from './types'

export const STATUS_META: Record<ServiceStatus, { label: string; colour: string; rank: number }> = {
  OVERDUE: { label: 'Overdue', colour: '#dc2626', rank: 0 },
  DUE_SOON: { label: 'Due soon', colour: '#d97706', rank: 1 },
  NO_BASELINE: { label: 'Never recorded', colour: '#6b7280', rank: 2 },
  NO_READING: { label: 'Needs a reading', colour: '#6b7280', rank: 3 },
  OK: { label: 'In date', colour: '#16a34a', rank: 4 },
}

const n = (v: number) => Math.round(v).toLocaleString('en-GB')
const plural = (v: number, one: string) => `${n(Math.abs(v))} ${one}${Math.abs(Math.round(v)) === 1 ? '' : 's'}`

/** "every 250 h or 365 days" */
export function intervalText(row: Pick<ServiceDue, 'every_hours' | 'every_days'>): string {
  const parts = [
    row.every_hours != null ? `${n(row.every_hours)} h` : null,
    row.every_days != null ? plural(row.every_days, 'day') : null,
  ].filter(Boolean)
  return `every ${parts.join(' or ')}`
}

/**
 * "in 42 h (at 4,250 h) or 120 days" / "overdue by 6 h" / "never recorded":
 * whichever limits apply, nearest first as the database counts them.
 */
export function dueText(row: ServiceDue): string {
  if (row.status === 'NO_BASELINE') return 'say when it was last done'
  const bits: string[] = []
  if (row.hours_left != null) {
    bits.push(
      row.hours_left <= 0
        ? `${n(-row.hours_left)} h over`
        : `in ${n(row.hours_left)} h${row.due_hours != null ? ` (at ${n(row.due_hours)} h)` : ''}`,
    )
  } else if (row.every_hours != null) {
    bits.push('hours unknown: record a reading')
  }
  if (row.days_left != null) {
    bits.push(row.days_left <= 0 ? `${plural(-row.days_left, 'day')} over` : `in ${plural(row.days_left, 'day')}`)
  }
  return bits.join(' · ')
}

/** The worst status per part, for colouring a part by what it needs. */
export function worstByPart(rows: ServiceDue[]): Map<string, ServiceStatus> {
  const out = new Map<string, ServiceStatus>()
  for (const r of rows) {
    const cur = out.get(r.part_id)
    if (!cur || STATUS_META[r.status].rank < STATUS_META[cur].rank) out.set(r.part_id, r.status)
  }
  return out
}

/** "4,312" from "4312" or "4,312"; null when it is not a number of zero or more. */
export function parseHours(text: string): number | null {
  const t = text.replace(/[,\s]/g, '').replace(/h$/i, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}
