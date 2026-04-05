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
  LogOut,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useDefects, useApprovals } from '@/lib/query-hooks'

interface SidebarProps {
  onClose?: () => void
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app/dashboard' },
  { icon: Anchor, label: 'Project Overview', path: '/app/project' },
  { icon: Wrench, label: 'Work Packages', path: '/app/work-packages' },
  { icon: ClipboardCheck, label: 'Inspections', path: '/app/inspections' },
  { icon: AlertTriangle, label: 'Defect Records', path: '/app/defects', badge: 'defects' },
  { icon: GitBranch, label: 'Change Orders', path: '/app/change-orders' },
  { icon: CheckCircle2, label: 'Approvals', path: '/app/approvals', badge: 'approvals' },
  { icon: FileText, label: 'Documents', path: '/app/documents' },
  { icon: Users, label: 'Team', path: '/app/team' },
]

const ROLE_LABELS: Record<string, string> = {
  OWNERS_REP: "Owner's Rep",
  OWNER: 'Owner',
  CAPTAIN: 'Captain',
  YARD_PM: 'Yard PM',
  CLASS_SURVEYOR: 'Class Surveyor',
}

export default function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)

  const { data: defects = [] } = useDefects()
  const { data: approvals = [] } = useApprovals()

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
        <div>
          <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>YAM</div>
          <div style={{ fontSize: '10px', opacity: 0.6, letterSpacing: '0.05em' }}>
            MARITIME INTELLIGENCE
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
                borderLeft: isActive
                  ? '3px solid hsl(185 60% 40%)'
                  : '3px solid transparent',
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
              <span style={{ flex: 1, opacity: isActive ? 1 : 0.85 }}>{item.label}</span>
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
              {ROLE_LABELS[user.role] ?? user.role}
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
          Sign out
        </button>
      </div>
    </div>
  )
}
