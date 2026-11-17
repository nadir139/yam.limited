import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Logo from '@/assets/logo.svg'
import '@/components/landing/landing.css'

const RESEND_SECONDS = 30

export default function Login() {
  const { login, user, isLoading } = useAuth()
  // Empty, not pre-filled. This is the public sign-in page: a default address
  // showed one person's email to every visitor, and sent them that person's
  // magic link if they pressed the button.
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)

  // One timer, owned by an effect, so leaving the page cannot leave an
  // interval ticking on an unmounted component.
  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  const send = async () => {
    setIsSubmitting(true)
    setError(null)
    const result = await login(email.trim())
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setSent(true)
    setResendCountdown(RESEND_SECONDS)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send()
  }

  // Already signed in: the form has nothing to offer.
  if (!isLoading && user) return <Navigate to="/app/dashboard" replace />

  return (
    // The door between the public site and the app, so it wears the site's
    // look: drafting paper, a sheet with a title block, serif and mono.
    <div className="landing drafting flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm border rule bg-paper p-8 shadow-[0_20px_40px_-24px_hsl(var(--ink)/0.3)]">
        {/* Logo */}
        <a href="/" className="mb-8 flex items-center gap-3">
          <img src={Logo} alt="" className="h-10 w-auto dark:invert" />
          <span>
            <span className="serif block text-2xl font-semibold leading-none">YAM</span>
            <span className="label mt-1 block text-[10px]">Yacht Architectural Management</span>
          </span>
        </a>
        <p className="serif mb-6 text-xl font-semibold">Sign in to the record</p>

        {sent ? (
          <div className="flex flex-col gap-4 text-center">
            <div
              className="rounded-[var(--radius)] p-4"
              style={{ backgroundColor: 'hsl(var(--muted))' }}
            >
              <div className="text-sm font-semibold mb-1">Check your email</div>
              <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                We sent a magic link to <strong>{email}</strong>. Click it to sign in.
              </div>
            </div>
            {error && (
              <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                {error}
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void send()}
              disabled={resendCountdown > 0 || isSubmitting}
              className="w-full"
            >
              {resendCountdown > 0
                ? `Resend in ${resendCountdown}s`
                : isSubmitting
                ? 'Sending...'
                : 'Resend magic link'}
            </Button>
            <button
              className="text-xs underline"
              style={{ color: 'hsl(var(--muted-foreground))' }}
              onClick={() => { setSent(false); setError(null) }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Your role on the project decides what you can do, and it comes from
              the project team — not from this screen.
            </p>

            {error && (
              <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                {error}
              </p>
            )}

            <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        )}

        <p className="label mt-8 border-t rule pt-4 text-[10px]">
          Invite only · access comes from the project team
        </p>
      </div>
    </div>
  )
}
