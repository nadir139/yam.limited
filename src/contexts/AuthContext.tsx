import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { UserRole, AuthUser } from '@/lib/types'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

// The role is NOT stored here.
//
// It used to be: chosen at sign-in and kept in localStorage under
// `yam_role_<email>`, which made it a display preference anyone could edit from
// the browser console — and nothing server-side read it anyway. Since migration
// 012 it is resolved from project_members by the verified JWT email, and every
// Action enforces it. What is fetched below is therefore the real role, and a
// user whose email is not a member of the project gets null.
const resolveMember = async (email: string): Promise<{ name: string; role: UserRole | null }> => {
  const { data } = await supabase
    .from('project_members')
    .select('name, role')
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  return {
    name: data?.name ?? email.split('@')[0] ?? 'User',
    role: (data?.role as UserRole | undefined) ?? null,
  }
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
          const member = await resolveMember(email)
          setUser({
            id: session.user.id,
            email,
            name: member.name,
            role: member.role,
          })
        }
      })
      .catch((err) => console.error('Failed to restore session', err))
      .finally(() => setIsLoading(false))

    // Listen for auth changes (magic link callback lands here)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const email = session.user.email ?? ''
        const member = await resolveMember(email)
        setUser({
          id: session.user.id,
          email,
          name: member.name,
          role: member.role,
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
