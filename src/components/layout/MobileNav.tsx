import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Box, LayoutDashboard, Menu, Sparkles } from 'lucide-react'
import { useDefects } from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'

// The four places someone on a boat reaches for most, under the thumb, plus
// the full menu. Phones only: on md and up the sidebar is always there.

const ITEMS = [
  { icon: Sparkles, labelKey: 'nav.agent', path: '/app/agent' },
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/app/dashboard' },
  { icon: Box, labelKey: 'nav.model', path: '/app/model' },
  { icon: AlertTriangle, labelKey: 'navShort.defects', path: '/app/defects', badge: true },
] as const

export const MOBILE_NAV_HEIGHT = 58

export default function MobileNav({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data: defects = [] } = useDefects()
  const open = defects.filter((d) => d.status !== 'CLOSED').length

  const item = (active: boolean) =>
    `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-tight ${
      active ? 'text-[hsl(var(--accent))]' : 'text-muted-foreground'
    }`

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 backdrop-blur md:hidden"
      style={{ height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main"
    >
      {ITEMS.map(({ icon: Icon, labelKey, path, ...rest }) => {
        const active = pathname === path || pathname.startsWith(path + '/')
        return (
          <button key={path} type="button" className={item(active)} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined}>
            <Icon size={20} />
            <span className="max-w-full truncate">{t(labelKey)}</span>
            {'badge' in rest && open > 0 && (
              <span className="absolute right-[calc(50%-18px)] top-1.5 min-w-[16px] rounded-full bg-destructive px-1 text-center text-[9px] leading-4 text-destructive-foreground">
                {open}
              </span>
            )}
          </button>
        )
      })}
      <button type="button" className={item(false)} onClick={onMenu}>
        <Menu size={20} />
        <span>{t('navShort.more')}</span>
      </button>
    </nav>
  )
}
