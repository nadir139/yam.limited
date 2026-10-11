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
  type LucideIcon,
} from 'lucide-react'
import type { Project } from '@/lib/types'

// Labels are translation keys rather than English strings, so the navigation
// follows the language menu instead of staying English around translated pages.
export interface NavItem {
  icon: LucideIcon
  labelKey: string
  path: string
  badge?: 'defects' | 'approvals' | 'actionItems'
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
]
const LOGBOOK_KEEPS = new Set([
  '/app/agent', '/app/project', '/app/model', '/app/parts', '/app/defects', '/app/documents', '/app/action-items', '/app/messages', '/app/team',
])

type ProjectType = Project['project_type'] | undefined

/** The sections a project of this type has, in sidebar order. */
export function navItemsFor(type: ProjectType) {
  if (type !== 'OPERATIONS') return NAV_ITEMS
  const agent = NAV_ITEMS.filter((i) => i.path === '/app/agent')
  return [...agent, ...LOGBOOK_ITEMS, ...NAV_ITEMS.filter((i) => LOGBOOK_KEEPS.has(i.path) && i.path !== '/app/agent')]
}

/** Where a project of this type opens. */
export const homeFor = (type: ProjectType) => (type === 'OPERATIONS' ? '/app/logbook' : '/app/dashboard')

/** Whether a page belongs to a project of this type; switching to one that lacks it goes home. */
export function pathFits(type: ProjectType, pathname: string) {
  return navItemsFor(type).some((i) => pathname === i.path || pathname.startsWith(i.path + '/'))
}
