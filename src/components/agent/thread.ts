import type { AgentStep } from '@/lib/agent-client'

// The agent's conversation, shared by the full console (/app/agent), the dock
// beside every page and the daily brief: one thread per project, one way of
// storing it and one way of naming what the agent did.

/** Cache prefixes an Action could have invalidated, whichever Action it was. */
export const INVALIDATE_ON_CHANGE = [
  'defects', 'defect', 'change-orders', 'change-order', 'approvals',
  'inspections', 'documents', 'work-packages', 'work-package',
  'project', 'events', 'messages',
  // Posting a message with a mention creates action items; inviting someone
  // changes the team and, for them, the project list.
  'action-items', 'team', 'my-role', 'my-projects', 'dependencies',
  'parts', 'part-links', 'part-history',
]

type ToolCall = AgentStep

/** An object the agent read, keyed in the response by its human number. */
export interface ObjectRef {
  type: string
  id: string
  label: string
}

export interface ChangedRef extends ObjectRef {
  number: string
  via: string
  /** False for the Action's own target, true for what the cascade produced. */
  cascaded: boolean
}

export interface Turn {
  role: 'user' | 'agent'
  text: string
  trace?: ToolCall[]
  index?: Record<string, ObjectRef>
  changed?: ChangedRef[]
  isError?: boolean
}

/** How many prior turns to replay. The function bounds this again server-side. */
export const HISTORY_TURNS = 12

/** The Edge Function refuses longer prompts; say so before sending, not after. */
export const MAX_PROMPT_CHARS = 2000

/**
 * The conversation survives leaving the page.
 *
 * sessionStorage rather than component state: opening a record used to discard
 * the whole thread, and you came back to a blank console with no way to pick up
 * where you were. Per-tab and cleared when the tab closes, which is the right
 * lifetime for a working conversation.
 */
//
// Keyed by project. One key for every project meant switching from the ketch to
// the property kept the ketch's thread on screen — and replayed it to the agent
// as history for the property, where its NCR numbers mean nothing.
export const storageKey = (projectId: string) => `yam.agent.turns.${projectId}`

export function loadTurns(projectId: string): Turn[] {
  if (!projectId) return []
  try {
    const raw = sessionStorage.getItem(storageKey(projectId))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Actions mutate the world model; reads don't. Only the former need a label. */
export const isAction = (tool: string) => tool.startsWith('action_')

export const prettyTool = (call: ToolCall) => {
  const base = call.tool.replace(/^action_/, '').replace(/_/g, ' ')
  // "list objects" five times in a row says nothing; "list objects · defect
  // record" says what the agent actually looked at.
  const subject = call.input?.object_type
  return subject ? `${base} · ${String(subject).replace(/_/g, ' ').toLowerCase()}` : base
}

