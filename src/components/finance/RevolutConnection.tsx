import { useState } from 'react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Download, ExternalLink, Link2, RefreshCw, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useProjectId } from '@/contexts/ProjectContext'
import { consentUrl, PENDING_KEY, REVOLUT_REDIRECT_PATH, revolut, syncSummary, type SyncResult } from '@/lib/revolut-client'
import type { FinanceConnection } from '@/lib/types'

// Connecting the owner's Revolut Business account (migration 041), read only.
//
// Revolut's Business API has no "sign in with Revolut" button: the account
// holder uploads a certificate in their Revolut settings, gets a client ID
// back, and approves access once. This walks them through it in three steps,
// and afterwards shows when it last synced and what came in.

const muted = { color: 'hsl(var(--muted-foreground))' }

const STATUS: Record<string, string> = {
  AWAITING_CLIENT_ID: 'Waiting for the client ID',
  AWAITING_CONSENT: 'Waiting for approval in Revolut',
  CONNECTED: 'Connected',
  NEEDS_RECONSENT: 'Needs approving again',
  DISCONNECTED: 'Disconnected',
}

function rememberPending(id: string) {
  try {
    localStorage.setItem(PENDING_KEY, id)
  } catch {
    // Private mode: the return page falls back to the one connection awaiting approval.
  }
}

export function RevolutConnection({ connections, canManage }: { connections: FinanceConnection[]; canManage: boolean }) {
  const projectId = useProjectId()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['finance', projectId] })
  const live = connections.filter((c) => c.status !== 'DISCONNECTED')
  const [starting, setStarting] = useState(false)
  const [environment, setEnvironment] = useState<'PRODUCTION' | 'SANDBOX'>('PRODUCTION')
  const [cert, setCert] = useState<Record<string, string>>({})
  const [clientId, setClientId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const run = async <T,>(label: string, fn: () => Promise<T>, done?: (r: T) => void) => {
    setBusy(label)
    try {
      const r = await fn()
      done?.(r)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const download = (pem: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([pem], { type: 'application/x-x509-ca-cert' }))
    a.download = 'yam-revolut.cer'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (live.length === 0 && !canManage) return null

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Link2 size={16} /> Revolut Business connection
          </h2>
          {canManage && live.length === 0 && !starting && (
            <Button size="sm" variant="outline" onClick={() => setStarting(true)}>Connect</Button>
          )}
        </div>
        {live.length === 0 && !starting && (
          <p className="text-xs" style={muted}>
            Instead of exporting statements, connect the account once: transactions then arrive by themselves. Read only: the
            connection can see the account, it cannot make a payment.
          </p>
        )}

        {starting && live.length === 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="rev-env">Account</Label>
              <select id="rev-env" className="h-9 rounded-md border bg-background px-2" value={environment} onChange={(e) => setEnvironment(e.target.value as 'PRODUCTION' | 'SANDBOX')}>
                <option value="PRODUCTION">Live Revolut Business account</option>
                <option value="SANDBOX">Revolut sandbox (testing)</option>
              </select>
            </div>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run('create', () => revolut.create(projectId, environment), (r) => {
                  setCert((m) => ({ ...m, [r.connection.id]: r.certificate_pem }))
                  setStarting(false)
                })
              }
            >
              {busy === 'create' ? 'Making the certificate…' : 'Start'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStarting(false)}>Cancel</Button>
          </div>
        )}

        {live.map((c) => {
          const result = c.last_sync_result as unknown as SyncResult | null
          const pem = cert[c.id] ?? c.certificate_pem
          return (
            <div key={c.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={c.status === 'CONNECTED' ? 'default' : 'outline'}>{STATUS[c.status] ?? c.status}</Badge>
                {c.environment === 'SANDBOX' && <Badge variant="outline">sandbox</Badge>}
                <span className="text-xs" style={muted}>started by {c.created_by_name}</span>
              </div>

              {c.status === 'AWAITING_CLIENT_ID' && canManage && (
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-xs">
                  <li>
                    <Button size="sm" variant="outline" onClick={() => download(pem)}>
                      <Download size={12} className="mr-1" /> Download the certificate
                    </Button>
                  </li>
                  <li>
                    In Revolut Business{c.environment === 'SANDBOX' ? ' (sandbox)' : ''}: Settings, then APIs, then Business API, then
                    add an API certificate. Upload the file, and give this as the OAuth redirect URI:
                    <code className="mt-1 block select-all rounded bg-[hsl(var(--muted))] px-2 py-1">{c.redirect_uri}</code>
                  </li>
                  <li>
                    Revolut shows a client ID. Paste it here:
                    <div className="mt-1 flex gap-2">
                      <Input aria-label="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-8" />
                      <Button
                        size="sm"
                        disabled={busy !== null || clientId.trim().length < 8}
                        onClick={() =>
                          run('client', () => revolut.setClientId(c.id, clientId.trim()), (r) => {
                            rememberPending(c.id)
                            setClientId('')
                            window.location.assign(r.consent_url)
                          })
                        }
                      >
                        Save and approve in Revolut
                      </Button>
                    </div>
                  </li>
                </ol>
              )}

              {(c.status === 'AWAITING_CONSENT' || c.status === 'NEEDS_RECONSENT') && canManage && c.client_id && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {c.status === 'NEEDS_RECONSENT' ? 'Revolut no longer accepts the approval given (it expires).' : 'Approve read access in Revolut to finish.'}
                  <Button
                    size="sm"
                    onClick={() => {
                      rememberPending(c.id)
                      window.location.assign(consentUrl(c.environment, c.client_id!, c.redirect_uri))
                    }}
                  >
                    <ExternalLink size={12} className="mr-1" /> Approve in Revolut
                  </Button>
                </div>
              )}

              {c.status === 'CONNECTED' && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span>
                    {c.last_synced_at ? `Last synced ${formatDistanceToNow(parseISO(c.last_synced_at), { addSuffix: true })}` : 'Not synced yet'}
                    {result ? `: ${syncSummary(result)}` : ''}
                  </span>
                  <span style={muted}>{c.webhook_id ? '· live updates on' : '· no live updates: sync by hand'}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => run('sync', () => revolut.sync(c.id), (r) => toast.success(syncSummary(r.sync)))}
                  >
                    <RefreshCw size={12} className={`mr-1 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Sync now
                  </Button>
                </div>
              )}

              {c.last_error && <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{c.last_error}</p>}

              {canManage && (
                <button
                  type="button"
                  className="flex items-center gap-1 self-start text-xs opacity-70 hover:opacity-100"
                  disabled={busy !== null}
                  onClick={() => {
                    const reason = window.prompt('Why disconnect? The transactions already brought in stay; the credentials are destroyed.')
                    if (reason?.trim()) run('disconnect', () => revolut.disconnect(c.id, reason.trim()), () => toast.success('Disconnected'))
                  }}
                >
                  <Unplug size={12} /> Disconnect
                </button>
              )}
            </div>
          )
        })}
        <p className="text-[11px]" style={muted}>
          Returns to {REVOLUT_REDIRECT_PATH} after approval. The private key and tokens are kept encrypted on the server; this page never sees them.
        </p>
      </CardContent>
    </Card>
  )
}
