import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { ObjectRef } from './thread'

// What the agent wrote on its own (migration 046, agent-watch): a NOTICE when
// something happened that someone should look at, and the morning BRIEF.
// Read under RLS, so a MONEY note only reaches those who may see payments.

export interface AgentNote {
  id: string
  project_id: string
  kind: 'NOTICE' | 'BRIEF'
  audience: 'ALL' | 'MONEY'
  title: string
  body: string
  object_type: string | null
  object_id: string | null
  object_number: string | null
  suggestion: string | null
  refs: Record<string, ObjectRef>
  created_at: string
}

export async function fetchAgentNotes(projectId: string): Promise<AgentNote[]> {
  const { data, error } = await supabase
    .from('agent_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data ?? []) as AgentNote[]
}

export const useAgentNotes = (projectId: string) =>
  useQuery({
    queryKey: ['agent-notes', projectId],
    queryFn: () => fetchAgentNotes(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  })

/** Today's brief for this project (the money one when the reader may see it). */
export function todaysBrief(notes: AgentNote[] | undefined): AgentNote | null {
  const today = new Date().toLocaleDateString('en-CA')
  const briefs = (notes ?? []).filter(
    (n) => n.kind === 'BRIEF' && new Date(n.created_at).toLocaleDateString('en-CA') === today,
  )
  return briefs.find((b) => b.audience === 'MONEY') ?? briefs[0] ?? null
}

/** Notices only, newest first. */
export const noticesOf = (notes: AgentNote[] | undefined) => (notes ?? []).filter((n) => n.kind === 'NOTICE')

// ─── Seen / unseen ───────────────────────────────────────────────────────────

const seenKey = (projectId: string) => `yam.agent.notes.seen.${projectId}`
export const lastSeen = (projectId: string) => {
  try {
    return localStorage.getItem(seenKey(projectId)) ?? ''
  } catch {
    return ''
  }
}
export const markSeen = (projectId: string) => {
  try {
    localStorage.setItem(seenKey(projectId), new Date().toISOString())
  } catch {
    // Storage unavailable: the dot just stays.
  }
}

/**
 * Live: a note written while you are in the app arrives as it is written.
 * `onNotice` is called for each new NOTICE on the project you are looking at.
 */
export function useAgentNotesLive(projectId: string, onNotice: (n: AgentNote) => void) {
  const qc = useQueryClient()
  const { user } = useAuth()
  useEffect(() => {
    if (!projectId || !user) return
    const channel = supabase
      .channel(`agent-notes-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_notes', filter: `project_id=eq.${projectId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['agent-notes', projectId] })
          const note = payload.new as AgentNote
          if (note?.kind === 'NOTICE') onNotice(note)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // onNotice is a fresh closure each render; the subscription need not be.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, user, qc])
}

// ─── The morning email ───────────────────────────────────────────────────────

export async function fetchBriefEmail(projectId: string, email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('project_members')
    .select('agent_brief_email')
    .eq('project_id', projectId)
    .ilike('email', email)
    .neq('status', 'LEFT')
    .maybeSingle()
  if (error) throw error
  return Boolean((data as { agent_brief_email?: boolean } | null)?.agent_brief_email)
}

export async function setBriefEmail(projectId: string, on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_agent_brief_email', { p_project_id: projectId, p_on: on })
  if (error) throw error
  return Boolean(data)
}
