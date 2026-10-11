import { describe, expect, it } from 'vitest'
import { utcHHMM, utcTime } from './techlog'

describe('utcTime', () => {
  it('reads date and time as UTC', () => {
    expect(utcTime('2026-10-03', '08:10')).toBe('2026-10-03T08:10:00.000Z')
  })
  it('rolls a time before the previous one to the next day (a flight past midnight)', () => {
    expect(utcTime('2026-10-03', '01:20', '2026-10-03T23:40:00.000Z')).toBe('2026-10-04T01:20:00.000Z')
  })
  it('refuses what is not a date and a time', () => {
    expect(utcTime('03/10/2026', '08:10')).toBeNull()
    expect(utcTime('2026-10-03', '8h')).toBeNull()
  })
})

describe('utcHHMM', () => {
  it('shows UTC whatever the offset written', () => {
    expect(utcHHMM('2026-10-03T10:10:00+02:00')).toBe('08:10')
  })
})
