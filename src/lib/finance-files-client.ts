import { supabaseConfig } from '@/lib/supabase'
import { accessToken } from '@/lib/agent-client'

// Receipts live in a private bucket only the finance-files Edge Function can
// reach (migration 040); it checks the caller's finance rights first. Called
// with fetch rather than functions.invoke(), as the other functions are, so
// a token refresh in progress can never leave the request unsent.

async function call(init: RequestInit & { query?: string }): Promise<Record<string, unknown>> {
  const token = await accessToken()
  const response = await fetch(`${supabaseConfig.url}/functions/v1/finance-files${init.query ?? ''}`, {
    ...init,
    headers: { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  })
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(String(body.error ?? `The receipts service returned ${response.status}`))
  return body
}

/** Stores a receipt against a transaction; the server keeps its SHA-256 fingerprint. */
export async function uploadReceipt(projectId: string, transactionId: string, file: File) {
  const form = new FormData()
  form.append('project_id', projectId)
  form.append('transaction_id', transactionId)
  form.append('file', file)
  return call({ method: 'POST', body: form })
}

/** A link to the receipt, valid for five minutes. */
export async function receiptUrl(receiptId: string): Promise<string> {
  const body = await call({ method: 'GET', query: `?receipt_id=${encodeURIComponent(receiptId)}` })
  return String(body.url)
}
