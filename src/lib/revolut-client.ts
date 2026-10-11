import { supabaseConfig } from '@/lib/supabase'
import { accessToken } from '@/lib/agent-client'
import type { FinanceConnection } from '@/lib/types'

// The Revolut Business connection (migration 041), through the `revolut` Edge
// Function. The browser only ever sees the certificate to upload and the
// connection's state: the private key, the tokens and the webhook secret stay
// in the vault on the server.

/** Where Revolut sends the owner back after they approve; registered in Revolut with the certificate. */
export const REVOLUT_REDIRECT_PATH = '/app/finance/revolut'
/** The connection waiting for Revolut's answer, remembered across the redirect. */
export const PENDING_KEY = 'yam.revolut.pending'

export interface SyncResult {
  accounts: number
  transactions_read: number
  new: number
  changed: number
  unchanged: number
  skipped: Array<{ id: string; reason: string }>
  from: string
}

export function syncSummary(s: SyncResult | null | undefined): string {
  if (!s) return ''
  return `${s.new} new, ${s.changed} changed by the bank, ${s.unchanged} already there${s.skipped?.length ? `, ${s.skipped.length} not read` : ''}`
}

/** Revolut's approval page, asking for read access only (same as the server's consentUrl). */
export function consentUrl(environment: string, clientId: string, redirectUri: string): string {
  const base = environment === 'PRODUCTION' ? 'https://business.revolut.com/app-confirm' : 'https://sandbox-business.revolut.com/app-confirm'
  return `${base}?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'READ' })}`
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const token = await accessToken()
  const response = await fetch(`${supabaseConfig.url}/functions/v1/revolut`, {
    method: 'POST',
    headers: { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new Error(String(out.error ?? `The Revolut service returned ${response.status}`))
  return out as T
}

export const revolut = {
  create: (projectId: string, environment: 'SANDBOX' | 'PRODUCTION') =>
    call<{ connection: FinanceConnection; certificate_pem: string }>({
      op: 'create',
      project_id: projectId,
      environment,
      redirect_uri: `${window.location.origin}${REVOLUT_REDIRECT_PATH}`,
    }),
  setClientId: (connectionId: string, clientId: string) =>
    call<{ connection: FinanceConnection; consent_url: string }>({ op: 'client_id', connection_id: connectionId, client_id: clientId }),
  exchange: (connectionId: string, code: string) =>
    call<{ connection: FinanceConnection; sync: SyncResult }>({ op: 'exchange', connection_id: connectionId, code }),
  sync: (connectionId: string) => call<{ connection: FinanceConnection; sync: SyncResult }>({ op: 'sync', connection_id: connectionId }),
  disconnect: (connectionId: string, reason: string) =>
    call<{ connection: FinanceConnection }>({ op: 'disconnect', connection_id: connectionId, reason }),
}
