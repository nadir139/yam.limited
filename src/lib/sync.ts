// Sending logbook writes now, or keeping them for later (offline mode).
//
// sendOrQueue() is what a logbook page calls to write: with signal it sends
// at once, exactly as before; without (or when the request dies on the way)
// it keeps the write in the outbox and says so. flushOutbox() sends what is
// kept, oldest first, when the signal is back.

import * as db from './db'
import { enqueue, isRetryable, listOutbox, removeFromOutbox, updateOutbox, type OutboxItem, type OutboxKind, type Queued } from './outbox'

type Sender = (projectId: string, payload: Record<string, unknown>) => Promise<unknown>

// Every write the outbox can hold, by kind. The payload is the page's own
// input, client id included, so a resend is the same write.
const SENDERS: Record<OutboxKind, Sender> = {
  log_entry: (p, x) => db.addLogEntry(p, x as unknown as Parameters<typeof db.addLogEntry>[1]),
  log_day: (p, x) => db.recordLogDay(p, x as unknown as db.LogDayInput),
  reading: (p, x) => db.recordReading(p, x as unknown as db.ReadingInput),
  service: (p, x) => db.recordService(p, x as unknown as db.ServiceInput),
  rest: (p, x) => db.recordRest(p, x as unknown as Parameters<typeof db.recordRest>[1]),
  orb: (p, x) => db.addOrbEntry(p, x as unknown as db.OrbInput),
}

/** The query keys a sent write changes, so the pages refresh. */
export const KEYS_FOR: Record<OutboxKind, string[]> = {
  log_entry: ['log-entries', 'events'],
  log_day: ['log-days', 'sea-time', 'events'],
  reading: ['maintenance', 'log-entries', 'events'],
  service: ['maintenance', 'log-entries', 'events'],
  rest: ['rest', 'events'],
  orb: ['orb', 'log-entries', 'events'],
}

export async function sendOrQueue<T>(args: {
  kind: OutboxKind
  projectId: string
  userEmail: string
  clientId: string
  payload: Record<string, unknown>
  summary: string
  replaceKey?: string
}): Promise<T | Queued> {
  const keep = async (): Promise<Queued> => {
    const earlier = args.replaceKey
      ? (await listOutbox()).find(
          (i) => i.replaceKey === args.replaceKey && i.userEmail === args.userEmail.toLowerCase() && i.status === 'pending',
        )
      : undefined
    await enqueue({
      id: earlier?.id ?? args.clientId,
      replaceKey: args.replaceKey,
      createdAt: earlier?.createdAt,
      kind: args.kind,
      projectId: args.projectId,
      userEmail: args.userEmail.toLowerCase(),
      payload: args.payload,
      summary: args.summary,
    })
    return { queued: true, clientId: args.clientId }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return keep()
  try {
    return (await SENDERS[args.kind](args.projectId, args.payload)) as T
  } catch (e) {
    // No answer: keep it. An answer refusing it: the page shows why.
    if (isRetryable(e)) return keep()
    throw e
  }
}

let flushing: Promise<FlushResult> | null = null

export interface FlushResult {
  sent: OutboxItem[]
  refused: OutboxItem[]
  /** Still waiting: no signal yet. */
  waiting: number
}

/**
 * Sends the signed-in person's kept writes, oldest first. Stops at the
 * first that gets no answer (the signal is gone again); one the server
 * refuses is marked with the reason and the rest go on.
 */
export function flushOutbox(userEmail: string): Promise<FlushResult> {
  if (flushing) return flushing
  flushing = (async () => {
    const result: FlushResult = { sent: [], refused: [], waiting: 0 }
    const mine = (await listOutbox()).filter((i) => i.userEmail === userEmail.toLowerCase() && i.status === 'pending')
    for (let k = 0; k < mine.length; k++) {
      const item = mine[k]
      try {
        await SENDERS[item.kind](item.projectId, item.payload)
        await removeFromOutbox(item.id)
        result.sent.push(item)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (isRetryable(e)) {
          await updateOutbox(item.id, { attempts: item.attempts + 1, lastError: message })
          result.waiting = mine.length - k
          break
        }
        await updateOutbox(item.id, { attempts: item.attempts + 1, status: 'failed', lastError: message })
        result.refused.push({ ...item, lastError: message })
      }
    }
    return result
  })().finally(() => {
    flushing = null
  })
  return flushing
}

/** Puts a refused write back in line, with its payload corrected if given. */
export async function retryOutboxItem(id: string, payload?: Record<string, unknown>) {
  await updateOutbox(id, { status: 'pending', lastError: undefined, ...(payload ? { payload } : {}) })
}
