import React, { createContext, useContext, useState, useEffect } from 'react'
import type { AuthUser, UserRole } from '@/lib/types'
import { MOCK_AUTH_USER } from '@/lib/mock-data'

interface AuthContextType {
  user: AuthUser | null
  login: (email: string, role: UserRole) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'yam_auth_user'

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setUser(JSON.parse(stored) as AuthUser)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = (email: string, role: UserRole) => {
    const authUser: AuthUser = {
      id: MOCK_AUTH_USER.id,
      email,
      name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
      role,
    }
    // Use the mock user if email matches
    if (email === MOCK_AUTH_USER.email) {
      const fullUser: AuthUser = { ...MOCK_AUTH_USER, role }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fullUser))
      setUser(fullUser)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser))
      setUser(authUser)
    }
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
