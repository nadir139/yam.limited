import React, { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UserRole } from '@/lib/types'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'OWNERS_REP', label: "Owner's Representative" },
  { value: 'OWNER', label: 'Owner' },
  { value: 'CAPTAIN', label: 'Captain' },
  { value: 'YARD_PM', label: 'Yard Project Manager' },
  { value: 'CLASS_SURVEYOR', label: 'Class Surveyor' },
]

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('nadir@yam.limited')
  const [role, setRole] = useState<UserRole>('OWNERS_REP')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    const result = await login(email, role)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSent(true)
      // Start 30-second resend countdown
      setResendCountdown(30)
      const interval = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  const handleResend = async () => {
    setIsSubmitting(true)
    setError(null)
    const result = await login(email, role)
    setIsSubmitting(false)
    if (result.error) {
      setError(result.error)
    } else {
      setResendCountdown(30)
      const interval = setInterval(() => {
        setResendCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, hsl(215 50% 15%) 0%, hsl(215 50% 28%) 100%)',
      }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius)] shadow-2xl p-8"
        style={{ backgroundColor: 'hsl(var(--card))' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="text-4xl font-black tracking-tight mb-1"
            style={{ color: 'hsl(var(--primary))' }}
          >
            YAM
          </div>
          <div className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Yacht Architectural Management
          </div>
        </div>

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
              onClick={handleResend}
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
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1"
                style={{
                  borderColor: 'hsl(var(--border))',
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                }}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                {error}
              </p>
            )}

            <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Magic Link'}
            </Button>
          </form>
        )}

        <p className="text-center text-xs mt-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Maritime intelligence platform for Project ZERO
        </p>
      </div>
    </div>
  )
}
