import { useState, useEffect, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import ErrorBoundary from '@/components/ErrorBoundary'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav, { MOBILE_NAV_HEIGHT } from './MobileNav'
import { NoProjects } from './ProjectSwitcher'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { useProjectPresence } from '@/lib/query-hooks'
import { useActiveProject } from '@/contexts/ProjectContext'

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Read on first render, not after it: starting at false painted the desktop
  // sidebar across a phone screen for a frame before the effect corrected it.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  )
  // Signed in but a member of nothing is a real state, not an error: reads are
  // scoped to membership, so every page would render an empty shell of itself.
  // Better to say so once and offer the way out.
  const { hasNoProjects, activeProjectId } = useActiveProject()
  const { pathname } = useLocation()
  // The agent is a conversation: it scrolls inside itself with the input fixed
  // under it, so the page around it must not scroll as well.
  const fullHeight = pathname === '/app/agent'
  useRealtimeSync()
  // Stamps first_seen_at on the first visit and keeps last_seen_at fresh, which
  // is what "here now" on the team page is derived from.
  useProjectPresence()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    // 100dvh, not 100vh: on a phone 100vh includes the strip under the browser's
    // toolbar, which hid the bottom of every page.
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
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
        <main
          className={fullHeight ? undefined : 'p-4 md:p-6'}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: fullHeight ? 'hidden' : 'auto',
            overscrollBehavior: 'contain',
            display: fullHeight ? 'flex' : undefined,
            flexDirection: fullHeight ? 'column' : undefined,
            // Room for the bottom bar, so the last thing on a page is reachable
            // (and the agent's input sits right on top of it).
            paddingBottom: isMobile
              ? `calc(${MOBILE_NAV_HEIGHT + (fullHeight ? 0 : 16)}px + env(safe-area-inset-bottom))`
              : undefined,
          }}
        >
          {/* Scoped to the page: a failure here keeps the sidebar and switcher,
              and clears itself on navigating away or switching project. The
              Suspense keeps a lazily loaded page from blanking the shell. */}
          <ErrorBoundary resetKeys={[pathname, activeProjectId]}>
            <Suspense fallback={null}>
              {hasNoProjects ? <NoProjects /> : children}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {isMobile && <MobileNav />}
    </div>
  )
}
