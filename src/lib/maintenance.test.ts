import { describe, expect, it } from 'vitest'
import { dueText, intervalText, parseHours, worstByPart } from './maintenance'
import type { ServiceDue } from './types'

const row = (over: Partial<ServiceDue>): ServiceDue => ({
  interval_id: 'i',
  part_id: 'p',
  part_name: 'Main engine',
  title: 'Oil and filter',
  every_hours: 250,
  every_days: 365,
  last_done_on: '2026-03-01',
  last_hours: 4000,
  last_is_baseline: true,
  hours_now: 4200,
  hours_read_at: '2026-10-01T10:00:00Z',
  hours_since: 200,
  due_hours: 4250,
  hours_left: 50,
  due_on: '2027-03-01',
  days_left: 141,
  status: 'OK',
  ...over,
})

describe('maintenance text', () => {
  it('states the interval', () => {
    expect(intervalText(row({}))).toBe('every 250 h or 365 days')
    expect(intervalText(row({ every_days: null }))).toBe('every 250 h')
    expect(intervalText(row({ every_hours: null, every_days: 1 }))).toBe('every 1 day')
  })
  it('says when it is due, both ways', () => {
    expect(dueText(row({}))).toBe('in 50 h (at 4,250 h) · in 141 days')
    expect(dueText(row({ hours_left: -6, days_left: 3, status: 'OVERDUE' }))).toBe('6 h over · in 3 days')
    expect(dueText(row({ hours_left: null, hours_now: null, due_hours: null }))).toBe('hours unknown: record a reading · in 141 days')
    expect(dueText(row({ status: 'NO_BASELINE' }))).toBe('say when it was last done')
  })
  it('colours a part by its worst interval', () => {
    const m = worstByPart([row({ status: 'OK' }), row({ status: 'OVERDUE' }), row({ part_id: 'q', status: 'DUE_SOON' })])
    expect(m.get('p')).toBe('OVERDUE')
    expect(m.get('q')).toBe('DUE_SOON')
  })
  it('reads hours as people write them', () => {
    expect(parseHours('4,312')).toBe(4312)
    expect(parseHours('4312.5 h')).toBe(4312.5)
    expect(parseHours('-3')).toBeNull()
    expect(parseHours('about 4000')).toBeNull()
  })
})
