import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import Logo from '@/assets/logo.svg'

// yam.limited/demo: a visitor's own demo boat, no email needed.
//
// The demo-session Edge Function creates a throwaway account and seeds a
// fictional refit for it (migration 049), then returns a one-time token hash.
// Exchanging it here signs the visitor in; the app opens on their boat.
// Everything they do is private to them and gone after 24 hours.
//
// It waits for a click: crawlers that run JavaScript would otherwise create a
// sandbox on every visit (robots.txt also disallows /demo).

type State =
  | { kind: 'ready' }
  | { kind: 'starting' }
  | { kind: 'signed-in-elsewhere'; email: string }
  | { kind: 'error'; message: string }

/** The function's own error message, when it sent one. */
async function messageOf(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body && typeof body.error === 'string') return body.error
    } catch {
      // Not JSON: fall through.
    }
  }
  return error instanceof Error ? error.message : 'The demo could not start.'
}

export default function Demo() {
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'ready' })

  const start = useCallback(async () => {
    setState({ kind: 'starting' })
    try {
      const { data, error } = await supabase.functions.invoke('demo-session', { body: {} })
      if (error) throw error
      const tokenHash = (data as { token_hash?: unknown } | null)?.token_hash
      if (typeof tokenHash !== 'string') throw new Error('The demo could not start.')

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      if (verifyError) throw verifyError
      navigate('/app/dashboard', { replace: true })
    } catch (err) {
      console.error('Demo failed to start', err)
      setState({ kind: 'error', message: await messageOf(err) })
    }
  }, [navigate])

  useEffect(() => {
    if (isLoading) return
    if (user?.isDemo) {
      // Already in a demo: go back to it rather than making another.
      navigate('/app/dashboard', { replace: true })
      return
    }
    if (user) setState({ kind: 'signed-in-elsewhere', email: user.email })
  }, [isLoading, user, navigate])

  const intro = (
    <p className="soft text-sm leading-relaxed">
      S/Y Tessera, a fictional 32 m sloop, five weeks into a winter refit. You are the owner's
      representative. Raise a finding and watch the change order and approval follow, decide the
      keel bolt approval, ask the agent what is holding up delivery. Nobody else sees what you do,
      and it is cleared after 24 hours.
    </p>
  )

  return (
    <div className="landing drafting flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md border rule bg-paper p-8 shadow-[0_20px_40px_-24px_hsl(var(--ink)/0.3)]">
        <a href="/" className="mb-8 flex items-center gap-3">
          <img src={Logo} alt="" className="h-10 w-auto dark:invert" />
          <span>
            <span className="serif block text-2xl font-semibold leading-none">YAM</span>
            <span className="label mt-1 block text-[10px]">Yacht Architectural Management</span>
          </span>
        </a>

        {!isSupabaseConfigured ? (
          <p className="text-sm">The demo is not available on this build.</p>
        ) : state.kind === 'ready' ? (
          <>
            <p className="serif mb-3 text-xl font-semibold">Your own demo boat</p>
            {intro}
            <Button className="mt-6 w-full" onClick={() => void start()} disabled={isLoading}>
              Open the demo
            </Button>
            <p className="label mt-3 text-[10px]">No email, no sign-up.</p>
          </>
        ) : state.kind === 'starting' ? (
          <>
            <p className="serif mb-3 text-xl font-semibold">Preparing your demo boat…</p>
            {intro}
          </>
        ) : state.kind === 'signed-in-elsewhere' ? (
          <>
            <p className="serif mb-3 text-xl font-semibold">You are signed in</p>
            <p className="soft mb-6 text-sm">
              As {state.email}. The demo runs as a separate visitor, so you would be signed out first.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={async () => {
                  await logout()
                  void start()
                }}
              >
                Sign out and open the demo
              </Button>
              <Button variant="outline" onClick={() => navigate('/app/dashboard')}>
                Back to my projects
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="serif mb-3 text-xl font-semibold">The demo could not start</p>
            <p className="soft mb-6 text-sm">{state.message}</p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void start()}>Try again</Button>
              <Button variant="outline" onClick={() => navigate('/#contact')}>
                Talk to us instead
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
