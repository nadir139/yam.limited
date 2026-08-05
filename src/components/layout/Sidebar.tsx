import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Anchor,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  GitBranch,
  CheckCircle2,
  FileText,
  Users,
  Sparkles,
  MessagesSquare,
  ListChecks,
  LogOut,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import Logo from '@/assets/logo.svg'
import { useAuth } from '@/contexts/AuthContext'
import { useDefects, useApprovals, useMyRole, useMyOpenItemCount } from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'

interface SidebarProps {
  onClose?: () => void
}

// Labels are translation keys rather than English strings, so the navigation
// follows the language menu instead of staying English around translated pages.
const NAV_ITEMS = [
  { icon: Sparkles, labelKey: 'nav.agent', path: '/app/agent' },
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/app/dashboard' },
  { icon: Anchor, labelKey: 'nav.project', path: '/app/project' },
  { icon: Wrench, labelKey: 'nav.workPackages', path: '/app/work-packages' },
  { icon: ClipboardCheck, labelKey: 'nav.inspections', path: '/app/inspections' },
  { icon: AlertTriangle, labelKey: 'nav.defects', path: '/app/defects', badge: 'defects' },
  { icon: GitBranch, labelKey: 'nav.changeOrders', path: '/app/change-orders' },
  { icon: CheckCircle2, labelKey: 'nav.approvals', path: '/app/approvals', badge: 'approvals' },
  { icon: FileText, labelKey: 'nav.documents', path: '/app/documents' },
  { icon: ListChecks, labelKey: 'nav.actionItems', path: '/app/action-items', badge: 'actionItems' },
  { icon: MessagesSquare, labelKey: 'nav.messages', path: '/app/messages' },
  { icon: Users, labelKey: 'nav.team', path: '/app/team' },
]

export default function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { t } = useTranslation()
  // The role shown is the one held on the ACTIVE project. The same person can
  // be owner's rep on one and nothing on another, so a single stored role would
  // be wrong the moment there were two projects.
  const { data: role = null } = useMyRole()
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

  const { data: defects = [] } = useDefects()
  const { data: approvals = [] } = useApprovals()

  // Things asked of this person by name that they have not answered yet. The
  // badge is the only reminder there is -- nothing emails them.
  const myOpenItemCount = useMyOpenItemCount()

  const openDefectCount = defects.filter((d) => d.status !== 'CLOSED').length
  const pendingApprovalCount = approvals.filter((a) => a.status === 'PENDING').length

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div
      style={{
        width: '240px',
        height: '100vh',
        background: 'hsl(215 50% 23%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          {/* The mark is a black-stroked SVG built for the light marketing page.
              Loaded through an <img> it cannot inherit currentColor, so it is
              knocked to white — the sidebar is navy and the logo would
              otherwise be invisible on it. */}
          <img
            src={Logo}
            alt=""
            aria-hidden="true"
            style={{
              height: '34px',
              width: 'auto',
              flexShrink: 0,
              filter: 'brightness(0) invert(1)',
              opacity: 0.95,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>YAM</div>
            <div style={{ fontSize: '10px', opacity: 0.6, letterSpacing: '0.05em' }}>
              MARITIME INTELLIGENCE
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          const isHovered = hoveredPath === item.path
          const badgeCount =
            item.badge === 'defects'
              ? openDefectCount
              : item.badge === 'approvals'
              ? pendingApprovalCount
              : item.badge === 'actionItems'
              ? myOpenItemCount
              : 0

          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path)
                onClose?.()
              }}
              onMouseEnter={() => setHoveredPath(item.path)}
              onMouseLeave={() => setHoveredPath(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                cursor: 'pointer',
                background: isActive
                  ? 'rgba(255,255,255,0.08)'
                  : isHovered
                  ? 'rgba(255,255,255,0.05)'
                  : 'transparent',
                fontSize: '14px',
                color: 'white',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                borderLeft: isActive
                  ? '3px solid hsl(185 60% 40%)'
                  : '3px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              <item.icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }} />
              <span style={{ flex: 1, opacity: isActive ? 1 : 0.85 }}>{t(item.labelKey)}</span>
              {badgeCount > 0 && (
                <Badge
                  style={{
                    backgroundColor: 'hsl(185 60% 40%)',
                    color: 'white',
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    minWidth: '20px',
                    textAlign: 'center',
                  }}
                >
                  {badgeCount}
                </Badge>
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom user section */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          padding: '12px 16px',
        }}
      >
        {user && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>
              {role ? t(`role.${role}`) : t('nav.noRole')}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: 'rgba(255,255,255,0.6)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 0',
            width: '100%',
          }}
        >
          <LogOut size={14} />
          {t('nav.signOut')}
        </button>
      </div>
    </div>
  )
}
