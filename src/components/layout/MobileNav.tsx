import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box, CalendarRange, LayoutDashboard, LogOut, Menu, Sparkles } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/contexts/AuthContext'
import { useApprovals, useDefects, useMyOpenItemCount, useMyRole } from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'
import { NAV_ITEMS } from './Sidebar'

// Phones only: on md and up the sidebar is always there.
//
// The four places reached for most on the boat sit under the thumb, with the
// agent in the middle as the one button that can do anything. Everything else
// is one tap away in More, a sheet from the bottom rather than the desktop
// sidebar squeezed onto a phone, and More carries the count of what is waiting
// (open NCRs, owner decisions, things asked of you) so none of it hides there.

const BAR = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/app/dashboard' },
  { icon: CalendarRange, labelKey: 'nav.schedule', path: '/app/schedule' },
  { icon: Sparkles, labelKey: 'nav.agent', path: '/app/agent', primary: true },
  { icon: Box, labelKey: 'nav.model', path: '/app/model' },
] as const

export const MOBILE_NAV_HEIGHT = 62

const isActive = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + '/')

export default function MobileNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const { data: role = null } = useMyRole()
  const [moreOpen, setMoreOpen] = useState(false)

  const { data: defects = [] } = useDefects()
  const { data: approvals = [] } = useApprovals()
  const myItems = useMyOpenItemCount()
  const badges: Record<string, number> = {
    defects: defects.filter((d) => d.status !== 'CLOSED').length,
    approvals: approvals.filter((a) => a.status === 'PENDING').length,
    actionItems: myItems,
  }
  const waiting = badges.defects + badges.approvals + badges.actionItems
  const inBar = new Set<string>(BAR.map((b) => b.path))
  const moreActive = !BAR.some((b) => isActive(pathname, b.path))

  const go = (path: string) => {
    setMoreOpen(false)
    navigate(path)
  }

  const count = (n: number) =>
    n > 0 ? (
      <span className="absolute -right-2 -top-1 min-w-[17px] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-[17px] text-destructive-foreground">
        {n > 99 ? '99+' : n}
      </span>
    ) : null

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-background/95 backdrop-blur md:hidden"
        style={{ height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Main"
      >
        {BAR.map(({ icon: Icon, labelKey, path, ...rest }) => {
          const active = isActive(pathname, path)
          const primary = 'primary' in rest
          return (
            <button
              key={path}
              type="button"
              onClick={() => go(path)}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
            >
              {primary ? (
                // The agent: a raised round button, the one action that can
                // answer or record anything.
                <span
                  className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-4 ring-background"
                  style={{ background: 'hsl(var(--accent))', color: 'hsl(var(--accent-foreground))' }}
                >
                  <Icon size={22} />
                </span>
              ) : (
                <span
                  className="flex h-7 w-12 items-center justify-center rounded-full transition-colors"
                  style={{ background: active ? 'hsl(var(--accent) / 0.16)' : undefined, color: active ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))' }}
                >
                  <Icon size={19} />
                </span>
              )}
              <span
                className="max-w-full truncate text-[10px] font-medium tracking-[-0.02em]"
                style={{ color: active ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))' }}
              >
                {t(labelKey)}
              </span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
          aria-label={waiting ? `More, ${waiting} waiting` : 'More'}
        >
          <span
            className="relative flex h-7 w-12 items-center justify-center rounded-full"
            style={{ background: moreActive ? 'hsl(var(--accent) / 0.16)' : undefined, color: moreActive ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))' }}
          >
            <Menu size={19} />
            {count(waiting)}
          </span>
          <span className="text-[10px] font-medium tracking-[-0.02em]" style={{ color: moreActive ? 'hsl(var(--accent))' : 'hsl(var(--muted-foreground))' }}>
            {t('navShort.more')}
          </span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5">
          <SheetTitle className="sr-only">All sections</SheetTitle>
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted" aria-hidden />
          <div className="grid grid-cols-3 gap-2">
            {NAV_ITEMS.filter((item) => !inBar.has(item.path)).map((item) => {
              const active = isActive(pathname, item.path)
              const n = 'badge' in item && item.badge ? badges[item.badge] ?? 0 : 0
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => go(item.path)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center text-xs font-medium"
                  style={{
                    borderColor: active ? 'hsl(var(--accent))' : 'hsl(var(--border))',
                    background: active ? 'hsl(var(--accent) / 0.1)' : undefined,
                  }}
                >
                  <span className="relative" style={{ color: active ? 'hsl(var(--accent))' : undefined }}>
                    <item.icon size={20} />
                    {count(n)}
                  </span>
                  <span className="line-clamp-2 leading-tight">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex items-center gap-3 border-t pt-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.email}</div>
              <div className="text-xs text-muted-foreground">{role ? t(`role.${role}`) : t('nav.noRole')}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                setMoreOpen(false)
                await logout()
                navigate('/login')
              }}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs"
            >
              <LogOut size={13} /> {t('nav.signOut')}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
