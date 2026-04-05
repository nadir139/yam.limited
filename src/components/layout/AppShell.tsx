import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  useRealtimeSync()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop sidebar — always visible on md+ */}
      {!isMobile && <Sidebar />}

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex' }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setSidebarOpen(false)}
          />
          <div style={{ position: 'relative', zIndex: 50 }}>
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
