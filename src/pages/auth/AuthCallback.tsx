import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Parse error from URL hash (e.g. #error=access_denied&error_code=otp_expired)
    const hash = window.location.hash
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const errorCode = params.get('error_code') || params.get('error')
      if (errorCode === 'otp_expired') {
        setError('This magic link has expired. Please request a new one.')
      } else {
        setError('Sign-in failed. Please try again.')
      }
      return
    }

    // onAuthStateChange processes the hash fragment automatically (detectSessionInUrl: true)
    // This fires with SIGNED_IN as soon as Supabase validates the access_token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/app/dashboard', { replace: true })
      }
    })

    // Also check for an existing session (e.g. already logged in)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        navigate('/app/dashboard', { replace: true })
      }
    })

    // Timeout fallback — if nothing fires in 5s, go to login
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      navigate('/login', { replace: true })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, hsl(215 50% 15%) 0%, hsl(215 50% 28%) 100%)',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'hsl(215 50% 23%)' }}>
            Link Expired
          </h2>
          <p style={{ color: 'hsl(215 15% 45%)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {error}
          </p>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'hsl(215 50% 23%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, hsl(215 50% 15%) 0%, hsl(215 50% 28%) 100%)',
      }}
    >
      <div style={{ textAlign: 'center', color: 'white' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255,255,255,0.3)',
            borderTopColor: 'white',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 1rem',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: '14px', opacity: 0.8 }}>Signing you in…</p>
      </div>
    </div>
  )
}
