// Where the query cache is kept on the device (offline mode, migration 038).
// Plain storage functions, no React: the auth context deletes the saved
// cache on sign-out, and the QueryPersistence component restores and saves it.

import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

const DB = 'yam-cache'
const STORE = 'kv'
/** Older than this, a saved cache is not worth showing. */
const MAX_AGE_MS = 14 * 86_400_000
const key = (userId: string) => `queries:${userId}`

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function kv<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await openDb()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode)
      const req = run(t.objectStore(STORE))
      t.oncomplete = () => resolve(req ? (req.result as T) : undefined)
      t.onerror = () => resolve(undefined)
      t.onabort = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

interface Saved {
  savedAt: number
  state: ReturnType<typeof dehydrate>
}

export async function restoreQueries(client: QueryClient, userId: string) {
  const saved = await kv<Saved>('readonly', (s) => s.get(key(userId)))
  if (saved && Date.now() - saved.savedAt < MAX_AGE_MS) hydrate(client, saved.state)
}

export async function saveQueries(client: QueryClient, userId: string) {
  const state = dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === 'success' })
  await kv('readwrite', (s) => s.put({ savedAt: Date.now(), state } satisfies Saved, key(userId)))
}

/** Deletes what was kept for this person (on sign-out). */
export async function forgetPersistedQueries(userId: string) {
  await kv('readwrite', (s) => s.delete(key(userId)))
}

