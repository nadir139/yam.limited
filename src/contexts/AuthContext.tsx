import { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false)
      return
    }

    // Get initial session. On failure we must still clear isLoading, otherwise
    // ProtectedRoute renders null forever and the app looks broken.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          const email = session.user.email ?? ''
          setUser({
            id: session.user.id,
            email,
            name: await resolveDisplayName(email),
          })
        }
      })
      .catch((err) => console.error('Failed to restore session', err))
      .finally(() => setIsLoading(false))

    // Listen for auth changes (magic link callback lands here)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const email = session.user.email ?? ''
        setUser({
          id: session.user.id,
          email,
          name: await resolveDisplayName(email),
        })
      } else {
        setUser(null)
      }
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
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
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
