import { describe, expect, it } from 'vitest'
import { checkMonth, describeRow, parseWorkRanges, restPeriods, type RestSchedule } from './rest-hours'

// The same cases are run against the database's rest_breaches in the
// migration 033 test, so the browser and the server judge a record alike.

const work = (ranges: string) => {
  const r = parseWorkRanges(ranges)
  if (!r) throw new Error(`bad ranges ${ranges}`)
  return r
}
const month = (days: number, ranges: string, over: Record<number, string> = {}): RestSchedule =>
  Object.fromEntries(Array.from({ length: days }, (_, i) => [String(i + 1), work(over[i + 1] ?? ranges)]))

describe('parseWorkRanges', () => {
  it('reads hours and half-hours', () => {
    const r = work('08:00-12:00, 13:30-18')
    expect(r.filter(Boolean).length).toBe(8 + 9)
    expect(describeRow(r)).toBe('08:00–12:00, 13:30–18:00')
  })
  it('runs over midnight within the day', () => {
    expect(describeRow(work('20:00-04:00'))).toBe('00:00–04:00, 20:00–24:00')
  })
  it('refuses what it cannot read', () => {
    expect(parseWorkRanges('eight to noon')).toBeNull()
    expect(parseWorkRanges('08:15-12:00')).toBeNull()
  })
  it('an empty day is all rest', () => {
    expect(work('').some(Boolean)).toBe(false)
  })
})

describe('restPeriods', () => {
  it('splits rest around work', () => {
    expect(restPeriods(work('08:00-12:00, 14:00-18:00'))).toEqual([16, 4, 12])
  })
})

describe('checkMonth', () => {
  it('a normal day job breaks nothing', () => {
    const r = checkMonth(month(30, '08:00-12:00, 13:00-18:00'), 30)
    expect(r.breaches).toEqual([])
    expect(r.days[0]).toMatchObject({ recorded: true, workHours: 9, restHours: 15 })
  })

  it('a 15-hour day breaks the 10-hour rule and the 14-hour stretch', () => {
    const r = checkMonth(month(7, '08:00-12:00, 13:00-18:00', { 3: '06:00-21:00' }), 7)
    expect(r.breachDays).toEqual([2, 3])
    expect(r.breaches).toContainEqual({ day: 3, rule: 'REST_24H' })
    expect(r.breaches).toContainEqual({ day: 3, rule: 'MAX_WORK_14H' })
  })

  it('enough rest every calendar day can still break a 24-hour window', () => {
    // From 10:00 on day 1 to 10:00 on day 2: 14.5 h of work, 9.5 h of rest,
    // though day 1 alone has 12 h of rest and no stretch passes 14 h.
    const r = checkMonth(month(3, '', { 1: '10:00-17:00, 19:00-24:00', 2: '00:00-02:30' }), 3)
    expect(r.breaches).toEqual([{ day: 1, rule: 'REST_24H' }])
  })

  it('a night watch pattern (4 on, 8 off) is compliant', () => {
    expect(checkMonth(month(14, '00:00-04:00, 12:00-16:00'), 14).breaches).toEqual([])
  })

  it('a short break is not a third rest period', () => {
    expect(checkMonth(month(3, '07:00-10:00, 10:30-12:00, 13:00-19:00'), 3).breaches).toEqual([])
  })

  it('too many rest periods in a day', () => {
    const r = checkMonth(month(1, '06:00-08:00, 10:00-12:00, 14:00-16:00, 18:00-20:00'), 1)
    expect(r.breaches).toEqual([{ day: 1, rule: 'TWO_PERIODS' }])
  })

  it('77 hours in seven days', () => {
    // 13 h of work a day: 11 h rest a day, 77 h a week: exactly enough.
    expect(checkMonth(month(7, '06:00-19:00'), 7).breaches).toEqual([])
    // 13.5 h a day: 73.5 h a week: not enough, though every day has 10.5 h.
    const r = checkMonth(month(7, '06:00-19:30'), 7)
    expect(r.breaches).toEqual([{ day: 1, rule: 'REST_7D' }])
  })

  it('an unrecorded day is not judged as rest', () => {
    const s = month(8, '06:00-19:30')
    delete s['4']
    const r = checkMonth(s, 8)
    expect(r.breaches.filter((b) => b.rule === 'REST_7D')).toEqual([])
    expect(r.days[3]).toMatchObject({ recorded: false })
  })
})
