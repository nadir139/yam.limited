import { describe, expect, it } from 'vitest'
import { sameParty, suggest, type Candidates } from './finance-match'

const c: Candidates = {
  bunkerings: [{ id: 'orb-2', occurred_at: '2026-09-02T07:30:00Z', label: 'ORB #2 H 26.2 MGO 12.5 t' }],
  workPackages: [{ id: 'wp-1', label: 'WP-HULL-001 Antifouling', contractor: 'Astilleros de Mallorca' }],
  changeOrders: [{ id: 'co-1', label: 'CO-2026-001 Shaft seal', cost: 4200 }],
  logDays: [{ id: 'd-6', date: '2026-09-06', port: 'Port Adriano' }],
}
const tx = (counterparty: string, amount: number, booked_at = '2026-09-02T10:00:00Z') => ({
  booked_at, amount, counterparty, description: counterparty, reference: null,
})

describe('suggest', () => {
  it('links fuel to the bunkering in the Oil Record Book', () => {
    expect(suggest(tx('Repsol Marine Palma', -1850.4), c)[0]).toMatchObject({ category: 'FUEL', objectType: 'ORB_ENTRY', objectId: 'orb-2' })
  })
  it('does not link fuel paid a week away from the bunkering', () => {
    const s = suggest(tx('Repsol Marine Palma', -1850.4, '2026-09-12T10:00:00Z'), c)
    expect(s.some((x) => x.objectType === 'ORB_ENTRY')).toBe(false)
    expect(s[0]).toMatchObject({ category: 'FUEL', objectType: null })
  })
  it('links a yard payment to the work package of that contractor', () => {
    expect(suggest(tx('To Astilleros de Mallorca, S.A.', -12505, '2026-09-05T09:00:00Z'), c)[0]).toMatchObject({ objectType: 'WORK_PACKAGE', objectId: 'wp-1', category: 'REFIT' })
  })
  it('links a payment of exactly a change order amount', () => {
    expect(suggest(tx('Bank transfer', -4200), c)[0]).toMatchObject({ objectType: 'CHANGE_ORDER', objectId: 'co-1' })
  })
  it('links a marina charge to the day in port', () => {
    expect(suggest(tx('Marina Port Adriano', -310, '2026-09-06T11:00:00Z'), c)[0]).toMatchObject({ category: 'BERTHING', objectType: 'LOG_DAY', objectId: 'd-6' })
  })
  it('money in is a transfer or charter income', () => {
    expect(suggest(tx('Owner', 30000), c)[0]).toMatchObject({ category: 'TRANSFER' })
    expect(suggest(tx('Charter fee July', 48000), c)[0]).toMatchObject({ category: 'CHARTER_INCOME' })
  })
  it('suggests nothing it cannot explain', () => {
    expect(suggest(tx('Zzz Ltd', -12, '2026-01-01T00:00:00Z'), c)).toEqual([])
  })
})

describe('sameParty', () => {
  it('ignores generic words', () => {
    expect(sameParty('Palma Marine Services', 'West Marine Services')).toBe(false)
    expect(sameParty('Astilleros de Mallorca', 'ASTILLEROS DE MALLORCA SA')).toBe(true)
  })
})
