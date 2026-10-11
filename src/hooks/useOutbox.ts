import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { listOutbox, subscribeOutbox, type OutboxItem } from '@/lib/outbox'
import { KEYS_FOR, flushOutbox } from '@/lib/sync'

/** Whether the browser has a connection, kept current. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** The signed-in person's kept writes, oldest first, kept current. */
export function useOutbox() {
  const { user } = useAuth()
  const [items, setItems] = useState<OutboxItem[]>([])
  const refresh = useCallback(() => {
    listOutbox().then(setItems).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    refresh()
    const unsubscribe = subscribeOutbox(refresh)
    // Another tab may have sent or kept something.
    const t = window.setInterval(refresh, 15_000)
    return () => {
      unsubscribe()
      window.clearInterval(t)
    }
  }, [refresh])
  const email = user?.email?.toLowerCase()
  return { items: email ? items.filter((i) => i.userEmail === email) : [], refresh }
}

/**
 * Sends kept writes whenever there is a chance: on start, when the browser
 * comes back online, when the app comes back to the foreground, and every
 * half minute. Mounted once, in the app shell.
 */
export function useOutboxSync() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const email = user?.email
  useEffect(() => {
    if (!email) return
    const run = async () => {
      if (navigator.onLine === false) return
      const r = await flushOutbox(email)
      if (r.sent.length) {
        for (const key of new Set(r.sent.flatMap((i) => KEYS_FOR[i.kind]))) qc.invalidateQueries({ queryKey: [key] })
        toast.success(`${r.sent.length} write${r.sent.length === 1 ? '' : 's'} kept offline ${r.sent.length === 1 ? 'was' : 'were'} sent`)
      }
      if (r.refused.length) {
        toast.error(`${r.refused.length} kept write${r.refused.length === 1 ? ' was' : 's were'} refused: open the outbox at the top to see why`)
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && run()
    run()
    window.addEventListener('online', run)
    document.addEventListener('visibilitychange', onVisible)
    const t = window.setInterval(run, 30_000)
    return () => {
      window.removeEventListener('online', run)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(t)
    }
  }, [email, qc])
}
