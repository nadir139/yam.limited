import { beforeEach, describe, expect, it, vi } from 'vitest'

// The outbox falls back to localStorage where IndexedDB is missing, as in
// this test environment; give it one.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const sent: Array<[string, unknown]> = []
let behaviour: 'ok' | 'offline' | 'refuse' = 'ok'
const fake = (kind: string) => async (_p: string, input: unknown) => {
  if (behaviour === 'offline') throw new Error('TypeError: Failed to fetch')
  if (behaviour === 'refuse') throw new Error('Say why 2026-10-01 is being changed: the day has passed')
  sent.push([kind, input])
  return { id: 'row', input }
}
vi.mock('./db', () => ({
  addLogEntry: fake('log_entry'),
  recordLogDay: fake('log_day'),
  recordReading: fake('reading'),
  recordService: fake('service'),
  recordRest: fake('rest'),
}))

const { sendOrQueue, flushOutbox } = await import('./sync')
const { listOutbox, isQueued, isRetryable } = await import('./outbox')

const entry = (clientId: string, body = 'Anchored') => ({
  kind: 'log_entry' as const,
  projectId: 'p1',
  userEmail: 'Kim@Example.com',
  clientId,
  payload: { body, kind: 'NAVIGATION', clientId },
  summary: body,
})

beforeEach(() => {
  store.clear()
  sent.length = 0
  behaviour = 'ok'
})

describe('sendOrQueue', () => {
  it('sends at once with signal', async () => {
    const r = await sendOrQueue(entry('a'))
    expect(isQueued(r)).toBe(false)
    expect(sent).toHaveLength(1)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('keeps the write, with its client id, when the request gets no answer', async () => {
    behaviour = 'offline'
    const r = await sendOrQueue(entry('a'))
    expect(isQueued(r)).toBe(true)
    const kept = await listOutbox()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ id: 'a', userEmail: 'kim@example.com', status: 'pending' })
  })

  it('does not keep a write the server refused: the page shows why', async () => {
    behaviour = 'refuse'
    await expect(sendOrQueue(entry('a'))).rejects.toThrow(/day has passed/)
    expect(await listOutbox()).toHaveLength(0)
  })

  it('a whole record saved twice offline replaces the unsent one', async () => {
    behaviour = 'offline'
    const day = (status: string, id: string) => ({
      kind: 'log_day' as const,
      projectId: 'p1',
      userEmail: 'kim@example.com',
      clientId: id,
      payload: { date: '2026-10-11', status },
      summary: status,
      replaceKey: 'log_day:p1:2026-10-11',
    })
    await sendOrQueue(day('STANDBY', 'x'))
    await sendOrQueue(day('SEA_SERVICE', 'y'))
    const kept = await listOutbox()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ id: 'x', payload: { status: 'SEA_SERVICE' } })
  })
})

describe('flushOutbox', () => {
  it('sends kept writes oldest first and empties the outbox', async () => {
    behaviour = 'offline'
    await sendOrQueue(entry('a', 'first'))
    await new Promise((r) => setTimeout(r, 5))
    await sendOrQueue(entry('b', 'second'))
    behaviour = 'ok'
    const r = await flushOutbox('kim@example.com')
    expect(r.sent.map((i) => i.id)).toEqual(['a', 'b'])
    expect(sent.map(([, input]) => (input as { body: string }).body)).toEqual(['first', 'second'])
    expect(await listOutbox()).toHaveLength(0)
  })

  it('stops when the signal goes again, and keeps the rest', async () => {
    behaviour = 'offline'
    await sendOrQueue(entry('a'))
    await sendOrQueue(entry('b'))
    const r = await flushOutbox('kim@example.com')
    expect(r.sent).toHaveLength(0)
    expect(r.waiting).toBe(2)
    expect((await listOutbox()).map((i) => i.status)).toEqual(['pending', 'pending'])
  })

  it('keeps a refused write with the reason until the person deals with it', async () => {
    behaviour = 'offline'
    await sendOrQueue(entry('a'))
    behaviour = 'refuse'
    const r = await flushOutbox('kim@example.com')
    expect(r.refused).toHaveLength(1)
    const [kept] = await listOutbox()
    expect(kept).toMatchObject({ status: 'failed', attempts: 1 })
    expect(kept.lastError).toMatch(/day has passed/)
  })

  it("never sends another person's kept writes", async () => {
    behaviour = 'offline'
    await sendOrQueue(entry('a'))
    behaviour = 'ok'
    const r = await flushOutbox('someone.else@example.com')
    expect(r.sent).toHaveLength(0)
    expect(await listOutbox()).toHaveLength(1)
  })
})

describe('isRetryable', () => {
  it('tells "no answer" from "refused"', () => {
    expect(isRetryable(new Error('TypeError: Failed to fetch'))).toBe(true)
    expect(isRetryable(new Error('JWT expired'))).toBe(true)
    expect(isRetryable(new Error('An entry needs some words'))).toBe(false)
  })
})
