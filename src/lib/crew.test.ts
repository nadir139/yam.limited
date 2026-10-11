import { describe, expect, it } from 'vitest'
import { certState, daysUntil } from './crew'

describe('certificate expiry', () => {
  const today = '2026-10-11'
  it('counts days to expiry', () => {
    expect(daysUntil('2026-10-21', today)).toBe(10)
    expect(daysUntil('2026-10-01', today)).toBe(-10)
  })
  it('flags expired and soon-to-expire certificates', () => {
    expect(certState({ expires_on: '2026-10-10' }, today)).toBe('EXPIRED')
    expect(certState({ expires_on: today }, today)).toBe('EXPIRING')
    expect(certState({ expires_on: '2027-01-09' }, today)).toBe('EXPIRING')
    expect(certState({ expires_on: '2027-01-10' }, today)).toBe('VALID')
    expect(certState({ expires_on: null }, today)).toBe('NO_EXPIRY')
  })
})
