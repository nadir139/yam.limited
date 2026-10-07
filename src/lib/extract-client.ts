import { supabaseConfig } from '@/lib/supabase'
import { accessToken } from '@/lib/agent-client'
import type { ChunkResult, DocumentMap } from '@/lib/proposal'

// Calls the extract-parts function. Each call is one pass (the map, or a few
// pages); the import page runs them, a few at a time, and merges the results.

/** A dense sheet can take a few minutes to read; past this, the pass is retried smaller. */
const PASS_TIMEOUT_MS = 7 * 60_000

export class ExtractError extends Error {}

async function call<T>(body: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const token = await accessToken()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort)
  const timer = setTimeout(abort, PASS_TIMEOUT_MS)
  try {
    const response = await fetch(`${supabaseConfig.url}/functions/v1/extract-parts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson, application/json',
        apikey: supabaseConfig.anonKey,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      let message = `The document reader returned ${response.status}.`
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? message
      } catch {
        // not JSON
      }
      throw new ExtractError(message)
    }
    // NDJSON: keepalive pings while the model reads, then one result line.
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let result: (T & { ok: boolean; error?: string }) | null = null
    const handle = (line: string) => {
      if (!line.trim()) return
      try {
        const event = JSON.parse(line)
        if (event.type === 'result') result = event
      } catch {
        // partial line
      }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handle(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
      }
    }
    handle(buffer + decoder.decode())
    const final = result as (T & { ok: boolean; error?: string }) | null
    if (!final) throw new ExtractError('The connection closed before the pages were read.')
    if (!final.ok) throw new ExtractError(final.error ?? 'The pages could not be read.')
    return final
  } catch (e) {
    if (e instanceof ExtractError) throw e
    if (controller.signal.aborted && !signal.aborted) throw new ExtractError('This pass took too long.')
    if (signal.aborted) throw new ExtractError('Stopped.')
    throw new ExtractError(e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function mapDocuments(projectId: string, documentIds: string[], signal: AbortSignal) {
  return call<{ map: DocumentMap }>({ projectId, stage: 'map', documentIds }, signal).then((r) => r.map)
}

export function readPages(
  projectId: string,
  documentIds: string[],
  documentIndex: number,
  pages: number[],
  map: DocumentMap,
  signal: AbortSignal,
) {
  return call<{ result: ChunkResult }>(
    { projectId, stage: 'parts', documentIds, documentIndex, pages, map },
    signal,
  ).then((r) => r.result)
}
