import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clientAssertion,
  consentUrl,
  createKeyMaterial,
  fromPem,
  issuerOf,
  toImportRows,
  verifyWebhook,
  webhookSignature,
  type RevolutTransaction,
} from '../../supabase/functions/revolut/revolut.ts'

const REDIRECT = 'https://yam.limited/app/finance/revolut'

describe('key material', () => {
  it('makes a certificate OpenSSL reads and verifies, for the key it came with', async () => {
    const km = await createKeyMaterial('yam.limited', new Date('2026-10-11T12:00:00Z'))
    const dir = mkdtempSync(join(tmpdir(), 'rev-'))
    writeFileSync(join(dir, 'cert.pem'), km.certificatePem)
    writeFileSync(join(dir, 'key.pem'), km.privateKeyPem)
    const text = execFileSync('openssl', ['x509', '-in', join(dir, 'cert.pem'), '-noout', '-subject', '-dates', '-text']).toString()
    expect(text).toMatch(/subject=CN ?= ?yam\.limited/)
    expect(text).toContain('Version: 3')
    expect(text).toContain('sha256WithRSAEncryption')
    expect(text).toContain('Public-Key: (2048 bit)')
    expect(text).toMatch(/notAfter=Oct 11 12:00:00 2031 GMT/)
    // Self-signed: it verifies against itself.
    expect(execFileSync('openssl', ['verify', '-CAfile', join(dir, 'cert.pem'), join(dir, 'cert.pem')]).toString()).toContain('OK')
    // And the certificate is for this private key.
    const pub = (args: string[]) => execFileSync('openssl', args).toString()
    expect(pub(['x509', '-in', join(dir, 'cert.pem'), '-noout', '-pubkey'])).toBe(pub(['pkey', '-in', join(dir, 'key.pem'), '-pubout']))
  })
})

describe('client assertion', () => {
  it('is an RS256 JWT with the claims Revolut asks for, signed by the key', async () => {
    const km = await createKeyMaterial('yam.limited')
    const jwt = await clientAssertion(km.privateKeyPem, 'client-123', REDIRECT, 1_800_000_000)
    const [h, p, s] = jwt.split('.')
    const dec = (x: string) => JSON.parse(Buffer.from(x, 'base64url').toString())
    expect(dec(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(dec(p)).toEqual({ iss: 'yam.limited', sub: 'client-123', aud: 'https://revolut.com', iat: 1_800_000_000, exp: 1_800_003_600 })
    const certDer = fromPem(km.certificatePem)
    const { X509Certificate, createVerify } = await import('node:crypto')
    const cert = new X509Certificate(Buffer.from(certDer))
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(cert.publicKey, Buffer.from(s, 'base64url'))
    expect(ok).toBe(true)
  })

  it('takes the issuer from the redirect host', () => {
    expect(issuerOf('https://www.yam.limited/app/finance/revolut')).toBe('www.yam.limited')
  })

  it('asks for READ only on consent', () => {
    const u = new URL(consentUrl('SANDBOX', 'cid', REDIRECT))
    expect(u.origin + u.pathname).toBe('https://sandbox-business.revolut.com/app-confirm')
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: 'cid', redirect_uri: REDIRECT, response_type: 'code', scope: 'READ' })
  })
})

describe('webhook signature', () => {
  const secret = 'wsk_test'
  const body = '{"event":"TransactionCreated","data":{"id":"t1"}}'
  const now = 1_800_000_000_000
  const ts = String(now - 1000)

  it('accepts a correct signature, also among several', async () => {
    const sig = await webhookSignature(secret, ts, body)
    expect(await verifyWebhook(secret, sig, ts, body, now)).toBe(true)
    expect(await verifyWebhook(secret, `v1=00ff, ${sig}`, ts, body, now)).toBe(true)
  })
  it('refuses a changed body, a wrong secret, an old timestamp, and nothing', async () => {
    const sig = await webhookSignature(secret, ts, body)
    expect(await verifyWebhook(secret, sig, ts, body.replace('t1', 't2'), now)).toBe(false)
    expect(await verifyWebhook('other', sig, ts, body, now)).toBe(false)
    expect(await verifyWebhook(secret, sig, ts, body, now + 10 * 60_000)).toBe(false)
    expect(await verifyWebhook(secret, null, ts, body, now)).toBe(false)
  })
})

describe('toImportRows', () => {
  const card: RevolutTransaction = {
    id: 'tx-card',
    type: 'card_payment',
    state: 'completed',
    created_at: '2026-09-02T09:58:11Z',
    completed_at: '2026-09-02T10:00:00Z',
    merchant: { name: 'Repsol Marine Palma', city: 'Palma' },
    legs: [{ leg_id: 'l1', account_id: 'acc-eur', amount: -1850.4, currency: 'EUR', description: 'Repsol Marine Palma' }],
  }
  const transfer: RevolutTransaction = {
    id: 'tx-yard',
    type: 'transfer',
    state: 'pending',
    created_at: '2026-09-05T09:00:00Z',
    reference: 'Refit deposit 50%',
    legs: [{ leg_id: 'l1', account_id: 'acc-eur', amount: -12500, fee: 5, currency: 'EUR', description: 'To Astilleros de Mallorca, S.A.' }],
  }
  const fx: RevolutTransaction = {
    id: 'tx-usd',
    type: 'card_payment',
    state: 'completed',
    created_at: '2026-09-07T12:00:00Z',
    completed_at: '2026-09-07T12:00:00Z',
    merchant: { name: 'West Marine' },
    legs: [{ leg_id: 'l1', account_id: 'acc-eur', amount: -195.3, currency: 'EUR', bill_amount: -212, bill_currency: 'USD', description: 'West Marine' }],
  }
  const exchange: RevolutTransaction = {
    id: 'tx-fx',
    type: 'exchange',
    state: 'completed',
    created_at: '2026-09-08T08:00:00Z',
    completed_at: '2026-09-08T08:00:01Z',
    legs: [
      { leg_id: 'a', account_id: 'acc-eur', amount: -1000, currency: 'EUR', description: 'Exchanged to GBP' },
      { leg_id: 'b', account_id: 'acc-gbp', amount: 860.2, currency: 'GBP', description: 'Exchanged from EUR' },
    ],
  }

  it('keeps the CSV id, the merchant, fee in the amount, original currency and the raw transaction', () => {
    const { byAccount, skipped } = toImportRows([card, transfer, fx, exchange])
    expect(skipped).toEqual([])
    const eur = byAccount.get('acc-eur')!
    expect(eur.map((r) => r.external_id)).toEqual(['tx-card', 'tx-yard', 'tx-usd', 'tx-fx'])
    expect(eur[0]).toMatchObject({ amount: -1850.4, counterparty: 'Repsol Marine Palma', state: 'COMPLETED', booked_at: '2026-09-02T10:00:00.000Z', bank_category: 'CARD_PAYMENT' })
    expect(eur[1]).toMatchObject({ amount: -12505, fee: -5, state: 'PENDING', reference: 'Refit deposit 50%', booked_at: '2026-09-05T09:00:00.000Z' })
    expect(eur[2]).toMatchObject({ original_amount: -212, original_currency: 'USD' })
    expect(eur[0].raw).toBe(card)
  })

  it('puts each leg of an exchange on its own account', () => {
    const { byAccount } = toImportRows([exchange])
    expect(byAccount.get('acc-gbp')).toEqual([expect.objectContaining({ external_id: 'tx-fx', amount: 860.2, currency: 'GBP' })])
  })

  it('gives a second leg on the same account its own id, and skips what it cannot read', () => {
    const twice: RevolutTransaction = { ...exchange, id: 'tx-2', legs: exchange.legs.map((l) => ({ ...l, account_id: 'acc-eur', currency: 'EUR' })) }
    const odd: RevolutTransaction = { ...card, id: 'tx-odd', state: 'weird' }
    const { byAccount, skipped } = toImportRows([twice, odd])
    expect(byAccount.get('acc-eur')!.map((r) => r.external_id)).toEqual(['tx-2', 'tx-2:b'])
    expect(skipped).toEqual([{ id: 'tx-odd', reason: 'unknown state "weird"' }])
  })
})
