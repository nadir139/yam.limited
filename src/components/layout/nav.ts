import {
  LayoutDashboard,
  Anchor,
  Wrench,
  CalendarRange,
  Boxes,
  Box,
  ClipboardCheck,
  AlertTriangle,
  GitBranch,
  CheckCircle2,
  FileText,
  Users,
  Sparkles,
  MessagesSquare,
  ListChecks,
  BookOpen,
  UsersRound,
  BedDouble,
  Gauge,
  Droplets,
  Wallet,
  HandCoins,
  type LucideIcon,
} from 'lucide-react'
import type { Project, UserRole } from '@/lib/types'

// Labels are translation keys rather than English strings, so the navigation
// follows the language menu instead of staying English around translated pages.
export interface NavItem {
  icon: LucideIcon
  labelKey: string
  path: string
  badge?: 'defects' | 'approvals' | 'actionItems'
  /** Shown only to these roles (the money is the owner side's and the captain's). */
  roles?: UserRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { icon: Sparkles, labelKey: 'nav.agent', path: '/app/agent' },
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/app/dashboard' },
  { icon: Anchor, labelKey: 'nav.project', path: '/app/project' },
  { icon: Box, labelKey: 'nav.model', path: '/app/model' },
  { icon: Boxes, labelKey: 'nav.parts', path: '/app/parts' },
  { icon: Wrench, labelKey: 'nav.workPackages', path: '/app/work-packages' },
  { icon: CalendarRange, labelKey: 'nav.schedule', path: '/app/schedule' },
  { icon: ClipboardCheck, labelKey: 'nav.inspections', path: '/app/inspections' },
  { icon: AlertTriangle, labelKey: 'nav.defects', path: '/app/defects', badge: 'defects' },
  { icon: GitBranch, labelKey: 'nav.changeOrders', path: '/app/change-orders' },
  { icon: CheckCircle2, labelKey: 'nav.approvals', path: '/app/approvals', badge: 'approvals' },
  { icon: Wallet, labelKey: 'nav.finance', path: '/app/finance', roles: ['OWNER', 'OWNERS_REP', 'CAPTAIN'] },
  { icon: HandCoins, labelKey: 'nav.payments', path: '/app/payments', roles: ['OWNER', 'OWNERS_REP', 'CAPTAIN', 'YARD_PM'] },
  { icon: FileText, labelKey: 'nav.documents', path: '/app/documents' },
  { icon: ListChecks, labelKey: 'nav.actionItems', path: '/app/action-items', badge: 'actionItems' },
  { icon: MessagesSquare, labelKey: 'nav.messages', path: '/app/messages' },
  { icon: Users, labelKey: 'nav.team', path: '/app/team' },
]

// A boat's logbook (an OPERATIONS project, migration 032) is the boat in
// service, not a piece of work: it has no work packages, schedule, change
// orders or owner approvals, and its home is the log rather than the
// dashboard.
const LOGBOOK_ITEMS: NavItem[] = [
  { icon: BookOpen, labelKey: 'nav.logbook', path: '/app/logbook' },
  { icon: UsersRound, labelKey: 'nav.crew', path: '/app/crew' },
  { icon: BedDouble, labelKey: 'nav.rest', path: '/app/rest' },
  { icon: Gauge, labelKey: 'nav.maintenance', path: '/app/maintenance' },
  { icon: Droplets, labelKey: 'nav.oilRecord', path: '/app/oil-record' },
]
const LOGBOOK_KEEPS = new Set([
  '/app/agent', '/app/project', '/app/model', '/app/parts', '/app/defects', '/app/finance', '/app/documents', '/app/action-items', '/app/messages', '/app/team',
])

type ProjectType = Project['project_type'] | undefined

/**
 * The sections a project of this type has, in sidebar order. Given a role,
 * sections kept for other roles are left out (the page itself refuses too).
 */
export function navItemsFor(type: ProjectType, role?: UserRole | null) {
  const forRole = (items: NavItem[]) => (role === undefined ? items : items.filter((i) => !i.roles || (role !== null && i.roles.includes(role))))
  if (type !== 'OPERATIONS') return forRole(NAV_ITEMS)
  const agent = NAV_ITEMS.filter((i) => i.path === '/app/agent')
  return forRole([...agent, ...LOGBOOK_ITEMS, ...NAV_ITEMS.filter((i) => LOGBOOK_KEEPS.has(i.path) && i.path !== '/app/agent')])
}

/** Where a project of this type opens. */
export const homeFor = (type: ProjectType) => (type === 'OPERATIONS' ? '/app/logbook' : '/app/dashboard')

/** Whether a page belongs to a project of this type; switching to one that lacks it goes home. */
export function pathFits(type: ProjectType, pathname: string) {
  return navItemsFor(type).some((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
}
