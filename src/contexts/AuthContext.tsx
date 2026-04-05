import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { UserRole, AuthUser } from '@/lib/types'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, role: UserRole) => Promise<{ error?: string }>
  logout: () => Promise<void>
}

// Store role in localStorage keyed by email since Supabase session doesn't carry it
const getRoleForEmail = (email: string): UserRole =>
  (localStorage.getItem(`yam_role_${email}`) as UserRole) || 'OWNERS_REP'

const setRoleForEmail = (email: string, role: UserRole) =>
  localStorage.setItem(`yam_role_${email}`, role)

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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const role = getRoleForEmail(session.user.email ?? '')
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.email?.split('@')[0] ?? 'User',
          role,
        })
      }
      setIsLoading(false)
    })

    // Listen for auth changes (magic link callback lands here)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = getRoleForEmail(session.user.email ?? '')
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.email?.split('@')[0] ?? 'User',
          role,
        })
      } else {
        setUser(null)
      }
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = async (email: string, role: UserRole): Promise<{ error?: string }> => {
    setRoleForEmail(email, role)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/app/dashboard`,
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
