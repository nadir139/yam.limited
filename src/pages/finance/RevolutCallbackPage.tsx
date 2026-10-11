import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFinanceLedger, useMyRole } from '@/lib/query-hooks'
import { useProjectId } from '@/contexts/ProjectContext'
import { PENDING_KEY, revolut, syncSummary } from '@/lib/revolut-client'

// Where Revolut sends the owner back after they approve read access, with
// ?code=. The code is handed to the server at once (it is single use and
// short lived) and exchanged there for tokens the browser never sees.

export default function RevolutCallbackPage() {
  const [params] = useSearchParams()
  const projectId = useProjectId()
  const qc = useQueryClient()
  const { data: role = null } = useMyRole()
  const allowed = role === 'OWNER' || role === 'OWNERS_REP'
  const { data: ledger } = useFinanceLedger(allowed)
  const [state, setState] = useState<{ kind: 'working' | 'done' | 'error'; text: string }>({ kind: 'working', text: 'Finishing the connection…' })
  const sent = useRef(false)

  const code = params.get('code')
  const revolutError = params.get('error_description') ?? params.get('error')

  useEffect(() => {
    if (sent.current || !ledger) return
    if (revolutError) {
      setState({ kind: 'error', text: `Revolut did not approve: ${revolutError}` })
      return
    }
    if (!code) {
      setState({ kind: 'error', text: 'Revolut sent no code back.' })
      return
    }
    let pending: string | null = null
    try {
      pending = localStorage.getItem(PENDING_KEY)
    } catch {
      pending = null
    }
    const waiting = ledger.connections.filter((c) => c.status === 'AWAITING_CONSENT' || c.status === 'NEEDS_RECONSENT')
    const target = waiting.find((c) => c.id === pending) ?? (waiting.length === 1 ? waiting[0] : null)
    if (!target) {
      setState({ kind: 'error', text: 'No connection here is waiting for approval. Open Finance on the project the connection was started from.' })
      return
    }
    sent.current = true
    revolut
      .exchange(target.id, code)
      .then((r) => {
        try {
          localStorage.removeItem(PENDING_KEY)
        } catch {
          // nothing to clean
        }
        setState({ kind: 'done', text: `Connected. First sync: ${syncSummary(r.sync)}.` })
      })
      .catch((e) => setState({ kind: 'error', text: e instanceof Error ? e.message : String(e) }))
      .finally(() => qc.invalidateQueries({ queryKey: ['finance', projectId] }))
  }, [ledger, code, revolutError, qc, projectId])

  if (role !== null && !allowed) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">Only the owner or the owner's rep can connect the bank account.</CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="flex flex-col gap-3 p-6 text-sm">
        <h1 className="text-xl font-bold">Revolut Business</h1>
        <p style={state.kind === 'error' ? { color: 'hsl(var(--destructive))' } : undefined}>{state.text}</p>
        {state.kind !== 'working' && (
          <Button asChild size="sm" className="self-start">
            <Link to="/app/finance">Back to Finance</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
