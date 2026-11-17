import { supabase, supabaseConfig } from '@/lib/supabase'

// How the console talks to the agent Edge Function.
//
// Not supabase.functions.invoke(). invoke() awaits a token from
// auth.getSession() before it sends anything, and when supabase-js's auth lock
// is wedged that await never settles: no request, no error, a console stuck on
// "Reading the world model…" forever. Here the token wait is bounded, the
// request is a plain fetch we can abort, and the reply is read as a stream so
// progress shows up while a long job list is being recorded.

/** Long enough for a ten-item job list; short enough that a hang ends. */
const REQUEST_TIMEOUT_MS = 6 * 60_000
const TOKEN_TIMEOUT_MS = 10_000

export interface AgentStep {
  tool: string
  input: { object_type?: string } & Record<string, unknown>
  ok: boolean
}

/** The final body, identical whether it arrived streamed or as plain JSON. */
export interface AgentResult {
  reply?: string
  error?: string
  trace?: AgentStep[]
  index?: Record<string, { type: string; id: string; label: string }>
  changed?: Array<{
    type: string
    id: string
    label: string
    number: string
    via: string
    cascaded: boolean
  }>
}

export class AgentRequestError extends Error {}

/** The caller's access token, or a clear error instead of an endless wait. */
export async function accessToken(): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AgentRequestError(
            'Your sign-in session is not responding. Reload the page and try again.',
          ),
        ),
      TOKEN_TIMEOUT_MS,
    )
  })
  try {
    const { data, error } = await Promise.race([supabase.auth.getSession(), timeout])
    if (error) throw new AgentRequestError(error.message)
    const token = data.session?.access_token
    if (!token) throw new AgentRequestError('You are signed out. Sign in again.')
    return token
  } finally {
    clearTimeout(timer)
  }
}

/** Reads newline-delimited JSON, handing each progress event to `onStep`. */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onStep: (step: AgentStep) => void,
): Promise<AgentResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: AgentResult | null = null

  const handle = (line: string) => {
    if (!line.trim()) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch {
      return // A partial or garbled line is not worth failing the reply over.
    }
    if (event.type === 'tool') onStep(event as unknown as AgentStep)
    if (event.type === 'result') result = event as AgentResult
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
    }
  }
  handle(buffer + decoder.decode())

  if (!result) {
    // Actions commit one by one, so a cut connection can leave some recorded.
    throw new AgentRequestError(
      'The connection closed before the agent finished. Some changes may already be ' +
        'recorded — check the list before asking again.',
    )
  }
  return result
}

/** The server refuses prompts over 2000 characters; the note gives way first. */
const MAX_PROMPT = 2000

/**
 * Prefixes the page the user is on. "This" on an NCR's page then means that
 * NCR: the note names its type and id, and the agent reads it with get_object
 * (RLS still applies, so the note grants nothing).
 */
export function withContext(prompt: string, context?: string): string {
  const where = context?.replace(/[<>[\]]/g, '').replace(/\s+/g, ' ').trim()
  if (!where) return prompt
  const note =
    `[Sent by the app, not typed: the user is looking at ${where}. ` +
    `"This", "it" and "here" mean that; if a record's type and id are given, read it with get_object before answering ` +
    `and do not ask which one. Do not mention this note.]\n\n`
  return note.length + prompt.length <= MAX_PROMPT ? note + prompt : prompt
}

export async function callAgent(params: {
  prompt: string
  history: Array<{ role: 'user' | 'agent'; text: string }>
  projectId: string
  /**
   * Where the user is asking from (page, record). Sent as a bracketed note
   * ahead of the question, written for the model, so the Edge Function needs
   * no change; the stored thread keeps only what the user typed.
   */
  context?: string
  signal: AbortSignal
  onStep: (step: AgentStep) => void
}): Promise<AgentResult> {
  const token = await accessToken()

  // One controller for both the user's Cancel and the overall timeout.
  const controller = new AbortController()
  const abort = () => controller.abort()
  params.signal.addEventListener('abort', abort)
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${supabaseConfig.url}/functions/v1/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt: withContext(params.prompt, params.context),
        history: params.history,
        projectId: params.projectId,
        stream: true,
      }),
      signal: controller.signal,
    })

    const type = response.headers.get('content-type') ?? ''
    if (response.ok && type.includes('ndjson') && response.body) {
      return await readStream(response.body, params.onStep)
    }

    // Errors raised before the loop starts (signed out, wrong project) and an
    // older deployment of the function both answer with plain JSON.
    const data = (await response.json().catch(() => null)) as AgentResult | null
    if (data && (data.reply !== undefined || data.error)) return data
    throw new AgentRequestError(`The agent responded ${response.status}.`)
  } catch (err) {
    if (controller.signal.aborted) {
      throw new AgentRequestError(
        params.signal.aborted
          ? 'Stopped. Anything already recorded stays recorded.'
          : 'The agent took too long to answer. Some changes may already be recorded — check before asking again.',
      )
    }
    if (err instanceof AgentRequestError) throw err
    throw new AgentRequestError(
      `Could not reach the agent: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
    params.signal.removeEventListener('abort', abort)
  }
}
