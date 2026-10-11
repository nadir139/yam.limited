import { describe, expect, it } from 'vitest'
import { parseRevolutCsv, splitCsv, toIso } from './revolut-csv'

const BUSINESS = `Date started (UTC),Date completed (UTC),ID,Type,State,Description,Reference,Payer,Card number,Orig currency,Orig amount,Payment currency,Amount,Total amount,Exchange rate,Fee,Balance,Account
2026-09-02 09:58:11,2026-09-02 10:00:00,6503f1c2-0000-a1b2-0000-000000000001,CARD_PAYMENT,COMPLETED,Repsol Marine Palma,,Kim Lund,4242********4242,EUR,-1850.40,EUR,-1850.40,-1850.40,,0.00,40230.15,Main EUR
2026-09-05 08:59:00,2026-09-05 09:00:00,6503f1c2-0000-a1b2-0000-000000000002,TRANSFER,COMPLETED,"To Astilleros de Mallorca, S.A.",Refit deposit 50%,,,,,EUR,-12500.00,-12505.00,,-5.00,27725.15,Main EUR
2026-09-06 11:00:00,,6503f1c2-0000-a1b2-0000-000000000003,CARD_PAYMENT,PENDING,Marina Port Adriano,,Kim Lund,4242********4242,EUR,-310.00,EUR,-310.00,-310.00,,0.00,,Main EUR
2026-09-07 12:00:00,2026-09-07 12:00:00,6503f1c2-0000-a1b2-0000-000000000004,CARD_PAYMENT,COMPLETED,West Marine,,Kim Lund,4242********4242,USD,-212.00,EUR,-195.30,-195.30,0.9212,0.00,27219.85,Main EUR
`

const PERSONAL = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-02 09:58:11,2026-09-02 10:00:00,Repsol Marine Palma,-1850.40,0.00,EUR,COMPLETED,40230.15
TOPUP,Current,2026-09-03 08:00:00,2026-09-03 08:00:01,Top-up by *1234,30000.00,0.00,EUR,COMPLETED,70230.15
EXCHANGE,Current,2026-09-04 08:00:00,2026-09-04 08:00:01,Exchanged to USD,-1000.00,5.00,EUR,COMPLETED,69225.15
`

describe('splitCsv', () => {
  it('handles quotes, commas and doubled quotes', () => {
    expect(splitCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ])
  })
})

describe('toIso', () => {
  it('reads Revolut dates as UTC', () => {
    expect(toIso('2026-09-02 10:00:00')).toBe('2026-09-02T10:00:00.000Z')
    expect(toIso('02/09/2026 10:00')).toBe('2026-09-02T10:00:00.000Z')
    expect(toIso('yesterday')).toBeNull()
  })
})

describe('parseRevolutCsv', () => {
  it('reads a business export: id, total with fee, state, original currency', async () => {
    const r = await parseRevolutCsv(BUSINESS)
    expect(r.format).toBe('REVOLUT_BUSINESS')
    expect(r.rows).toHaveLength(4)
    expect(r.rows[0]).toMatchObject({ external_id: '6503f1c2-0000-a1b2-0000-000000000001', amount: -1850.4, currency: 'EUR', state: 'COMPLETED' })
    // The payer is the cardholder, not the merchant.
    expect(r.rows[0].counterparty).toBe('Repsol Marine Palma')
    expect(r.rows[0].raw['Payer']).toBe('Kim Lund')
    expect(r.rows[1]).toMatchObject({ amount: -12505, fee: -5, reference: 'Refit deposit 50%', counterparty: 'To Astilleros de Mallorca, S.A.' })
    // Pending: no completion date yet, so the start date stands in.
    expect(r.rows[2]).toMatchObject({ state: 'PENDING', booked_at: '2026-09-06T11:00:00.000Z' })
    expect(r.rows[3]).toMatchObject({ amount: -195.3, original_amount: -212, original_currency: 'USD' })
    expect(r.rows[0].raw['Description']).toBe('Repsol Marine Palma')
  })

  it('reads a personal export, with a stable fingerprint for an id', async () => {
    const a = await parseRevolutCsv(PERSONAL)
    const b = await parseRevolutCsv(PERSONAL)
    expect(a.format).toBe('REVOLUT_PERSONAL')
    expect(a.rows.map((x) => x.amount)).toEqual([-1850.4, 30000, -1005])
    expect(a.rows[0].external_id).toMatch(/^row-[0-9a-f]{32}$/)
    expect(a.rows.map((x) => x.external_id)).toEqual(b.rows.map((x) => x.external_id))
    expect(new Set(a.rows.map((x) => x.external_id)).size).toBe(3)
  })

  it('says which rows it could not read and why', async () => {
    const r = await parseRevolutCsv('ID,Date completed (UTC),Amount,Payment currency,State\nx1,,-5,EUR,COMPLETED\nx2,2026-09-01,-5,EUR,WEIRD\nx3,2026-09-01,-5,EUR,COMPLETED\n')
    expect(r.rows.map((x) => x.external_id)).toEqual(['x3'])
    expect(r.skipped).toEqual([
      { line: 2, reason: 'no date it was completed or started' },
      { line: 3, reason: 'unknown state "weird"' },
    ])
  })
})
