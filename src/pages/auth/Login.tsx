import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [email, setEmail] = useState('nadir@yam.limited')
  const [role, setRole] = useState<UserRole>('OWNERS_REP')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login(email, role)
    navigate('/app/dashboard')
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

          <Button type="submit" className="w-full mt-2">
            Sign In
          </Button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Maritime intelligence platform for Project ZERO
        </p>
      </div>
    </div>
  )
}
