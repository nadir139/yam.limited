import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { callAgent, type AgentStep } from '@/lib/agent-client'
import {
  HISTORY_TURNS,
  INVALIDATE_ON_CHANGE,
  MAX_PROMPT_CHARS,
  loadTurns,
  storageKey,
  type Turn,
} from './thread'

// The dock's conversation. It reads and writes the same sessionStorage thread
// as the full console (/app/agent), so there is one agent per project, not
// two: a question asked in the dock is there when you open the console.
//

export function useAgentThread(projectId: string) {
  const [turns, setTurns] = useState<Turn[]>(() => loadTurns(projectId))
  const [turnsFor, setTurnsFor] = useState(projectId)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<AgentStep[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const qc = useQueryClient()

  // Another project: its own thread.
  if (turnsFor !== projectId) {
    setTurnsFor(projectId)
    setTurns(loadTurns(projectId))
  }

  /** Re-read the stored thread (the console may have added to it). */
  const reload = useCallback(() => setTurns(loadTurns(projectId)), [projectId])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!turnsFor) return
    try {
      sessionStorage.setItem(storageKey(turnsFor), JSON.stringify(turns))
    } catch {
      // A full storage quota must not take down the conversation.
    }
  }, [turns, turnsFor])

  const stop = () => abortRef.current?.abort()

  const clear = () => {
    setTurns([])
    try {
      sessionStorage.removeItem(storageKey(projectId))
    } catch {
      // Storage unavailable; the in-memory thread is already cleared.
    }
  }

  const ask = async (question: string, context?: string) => {
    const text = question.trim()
    if (!text || busy || !projectId || text.length > MAX_PROMPT_CHARS) return

    const history = turns
      .filter((t) => !t.isError)
      .slice(-HISTORY_TURNS)
      .map((t) => ({ role: t.role, text: t.text }))

    setTurns((t) => [...t, { role: 'user', text }])
    setBusy(true)
    setProgress([])
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const data = await callAgent({
        prompt: text,
        history,
        projectId,
        context,
        signal: controller.signal,
        onStep: (step) => setProgress((p) => [...p, step]),
      })
      if (controller.signal.aborted) return
      setTurns((t) => [
        ...t,
        {
          role: 'agent',
          text: data.error ?? data.reply ?? '(no reply)',
          trace: data.trace,
          index: data.index,
          changed: data.changed,
          isError: Boolean(data.error),
        },
      ])
      const wrote = data.trace?.some((s) => s.tool.startsWith('action_') && s.ok)
      if (data.changed?.length || wrote) {
        for (const key of INVALIDATE_ON_CHANGE) qc.invalidateQueries({ queryKey: [key] })
      }
    } catch (err) {
      // Something may have been written before the failure; refetch so lists
      // show it rather than inviting a duplicate.
      for (const key of INVALIDATE_ON_CHANGE) qc.invalidateQueries({ queryKey: [key] })
      setTurns((t) => [
        ...t,
        { role: 'agent', text: err instanceof Error ? err.message : 'Could not reach the agent.', isError: true },
      ])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
      setProgress([])
    }
  }

  return { turns, busy, progress, ask, stop, clear, reload }
}
