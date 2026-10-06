import { createContext, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { AuthUser } from '@/lib/types'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

// The role is NOT stored here, and no longer resolved here either.
//
// It used to be chosen at sign-in and kept in localStorage under
// `yam_role_<email>` — a display preference anyone could edit from the browser
// console, read by nothing server-side. Migration 012 made it real, resolved
// from project_members by the verified JWT email.
//
// Since the app went multi-project it cannot live on the user at all: the same
// person can be OWNERS_REP on one project and a member of nothing on another,
// so "their role" is not a property of them. `useMyRole()` asks about the
// active project. What is resolved here is only a display name.
const resolveDisplayName = async (email: string): Promise<string> => {
  const { data } = await supabase
    .from('project_members')
    .select('name')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  return data?.name ?? email.split('@')[0] ?? 'User'
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({}),
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    // The listener must stay synchronous.
    //
    // supabase-js runs this callback while it holds its auth lock, and awaits
    // it. The callback used to `await resolveDisplayName()` — a query, which
    // asks for the session, which waits for the lock this callback is holding.
    // When that happened on a token refresh the lock was never released, and
    // from then on every call that needs a token queued behind it forever. The
    // visible symptom was the agent stuck on "Reading the world model…" with no
    // request ever reaching the network: functions.invoke() waits for a token
    // before it sends anything.
    //
    // So: set the user from the session at once, and resolve the display name
    // outside the lock (setTimeout 0, as the supabase-js docs prescribe).
    // INITIAL_SESSION replaces the separate getSession() call that used to
    // race this listener and run the same name lookup a second time.
    let cancelled = false
    let resolvedFor: string | null = null

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user
      if (!authUser) {
        resolvedFor = null
        setUser(null)
        setIsLoading(false)
        return
      }

      const email = authUser.email ?? ''
      setUser((prev) =>
        prev?.id === authUser.id
          ? prev
          : { id: authUser.id, email, name: email.split('@')[0] || 'User' },
      )
      setIsLoading(false)

      // A token refresh is the same person: no need to look their name up again.
      if (resolvedFor === authUser.id) return
      resolvedFor = authUser.id
      setTimeout(() => {
        resolveDisplayName(email)
          .then((name) => {
            if (cancelled) return
            setUser((prev) => (prev?.id === authUser.id ? { ...prev, name } : prev))
          })
          .catch((err) => console.error('Failed to resolve display name', err))
      }, 0)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const login = async (email: string): Promise<{ error?: string }> => {
    if (!isSupabaseConfigured) {
      return { error: 'Sign-in is unavailable: this build has no Supabase credentials.' }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) return { error: error.message }
    return {}
  }

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } finally {
      setUser(null)
      // Everything cached was read as the person leaving. In a shared browser
      // the next person to sign in would otherwise see it until it refetched.
      queryClient.clear()
      try {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('yam.agent.')) sessionStorage.removeItem(key)
        }
      } catch {
        // Storage unavailable: nothing was persisted there either.
      }
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
