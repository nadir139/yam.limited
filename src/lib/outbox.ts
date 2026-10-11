// The outbox: what was written on this device and has not reached the
// server yet (migration 038, offline mode).
//
// At sea a phone loses signal for hours. A log entry, a day, a reading, a
// service or a month of rest written then is kept here, in IndexedDB, which
// survives closing the app and restarting the phone, and is sent when the
// signal comes back. Each item carries the client id it was first sent with,
// so an item that did reach the server before the connection dropped is
// recorded once when sent again.
//
// Nothing leaves the outbox except by reaching the server or by the person
// discarding it themselves. An item the server refuses (a rule broken, a
// permission gone) stays, marked with the server's reason, until they fix
// and resend it or discard it.

export type OutboxKind = 'log_entry' | 'log_day' | 'reading' | 'service' | 'rest' | 'orb'

export interface OutboxItem {
  /** The client id the write is sent with; also the item's key. */
  id: string
  kind: OutboxKind
  projectId: string
  /** Whose write it is: only sent while the same person is signed in. */
  userEmail: string
  /** The input as the page gave it, sent as is. */
  payload: Record<string, unknown>
  /** One line for the list: "Engine · Port genset high temp alarm". */
  summary: string
  /**
   * Writes of one whole record (a day, a month of rest) saved again before
   * the first was sent replace it: the later save is what the person meant,
   * and sending both would make the second a change needing a reason.
   */
  replaceKey?: string
  createdAt: string
  attempts: number
  /** 'failed': the server refused it; it waits for the person. */
  status: 'pending' | 'failed'
  lastError?: string
}

const DB = 'yam-outbox'
const STORE = 'items'
const FALLBACK_KEY = 'yam.outbox'

type Listener = () => void
const listeners = new Set<Listener>()
const notify = () => listeners.forEach((l) => l())

/** Called whenever the outbox changes, on this tab. */
export function subscribeOutbox(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

// ─── Storage: IndexedDB, or localStorage where IndexedDB is unavailable ──────

let dbPromise: Promise<IDBDatabase | null> | null = null
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function readFallback(): OutboxItem[] {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '[]') as OutboxItem[]
  } catch {
    return []
  }
}
function writeFallback(items: OutboxItem[]) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(items))
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    t.oncomplete = () => resolve(req ? (req.result as T) : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function listOutbox(): Promise<OutboxItem[]> {
  const db = await openDb()
  const items = db ? ((await tx<OutboxItem[]>(db, 'readonly', (s) => s.getAll())) ?? []) : readFallback()
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

async function put(item: OutboxItem) {
  const db = await openDb()
  if (db) await tx(db, 'readwrite', (s) => s.put(item))
  else writeFallback([...readFallback().filter((i) => i.id !== item.id), item])
  notify()
}

/**
 * Keeps a write for later. Throws if the device cannot store it, so the
 * caller can tell the person instead of pretending it was saved.
 */
export async function enqueue(item: Omit<OutboxItem, 'attempts' | 'status' | 'createdAt'> & { createdAt?: string }) {
  await put({ ...item, createdAt: item.createdAt ?? new Date().toISOString(), attempts: 0, status: 'pending' })
  // Ask the browser not to clear this site's storage under pressure.
  navigator.storage?.persist?.().catch(() => undefined)
}

export async function updateOutbox(id: string, patch: Partial<OutboxItem>) {
  const current = (await listOutbox()).find((i) => i.id === id)
  if (current) await put({ ...current, ...patch })
}

export async function removeFromOutbox(id: string) {
  const db = await openDb()
  if (db) await tx(db, 'readwrite', (s) => s.delete(id))
  else writeFallback(readFallback().filter((i) => i.id !== id))
  notify()
}

// ─── Whether a failure means "try again later" ────────────────────────────────

/**
 * True when the write never got an answer (no signal, the server unreachable,
 * a session that needs refreshing once back online): keep it and retry.
 * False when the server answered and refused it: show the reason.
 */
export function isRetryable(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|jwt expired|invalid jwt|503|502|504/i.test(msg)
}

/** What a write returns when it was kept for later instead of sent. */
export interface Queued {
  queued: true
  clientId: string
}
export const isQueued = (v: unknown): v is Queued => typeof v === 'object' && v !== null && (v as Queued).queued === true

/** What the person is told when a write was kept for later. */
export const KEPT_MESSAGE = 'No signal: kept on this device and sent when you are back online'
