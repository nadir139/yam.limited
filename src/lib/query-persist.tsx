import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { restoreQueries, saveQueries } from './query-cache-store'

// What was last read, kept on the device so the logbook can be read without
// signal (offline mode, migration 038).
//
// The query cache is saved to IndexedDB under the signed-in person's id a
// couple of seconds after it changes, and restored before the app's pages
// render, so a phone that opens the app at sea shows the boat's log, crew
// and maintenance as they were last seen instead of an empty screen. Fresh
// data from the server always wins (hydrate keeps whichever is newer).
// Signing out deletes it: the next person on the device starts clean.

/**
 * Restores the signed-in person's last-read data before rendering the app,
 * then keeps it saved as it changes.
 */
export function QueryPersistence({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [restoredFor, setRestoredFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    restoreQueries(client, userId)
      .catch(() => undefined)
      .finally(() => !cancelled && setRestoredFor(userId))
    return () => {
      cancelled = true
    }
  }, [client, userId])

  useEffect(() => {
    if (!userId || restoredFor !== userId) return
    let timer: number | undefined
    const unsubscribe = client.getQueryCache().subscribe(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => saveQueries(client, userId).catch(() => undefined), 2000)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [client, userId, restoredFor])

  // Wait for the restore only while someone is signed in and it has not run.
  if (userId && restoredFor !== userId) return null
  return <>{children}</>
}
