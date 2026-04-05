import React from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  useProject,
  useDefects,
  useApprovals,
  useWorkPackages,
  useEvents,
} from '@/lib/query-hooks'
import type { ProjectPhase, WorldModelEvent } from '@/lib/types'

const PHASES: ProjectPhase[] = [
  'PRE_SURVEY',
  'HAUL_OUT',
  'STRUCTURAL',
  'SYSTEMS',
  'INTERIOR',
  'SEA_TRIALS',
  'DELIVERED',
]

const PHASE_LABELS: Record<ProjectPhase, string> = {
  PRE_SURVEY: 'Pre-Survey',
  HAUL_OUT: 'Haul Out',
  STRUCTURAL: 'Structural',
  SYSTEMS: 'Systems',
  INTERIOR: 'Interior',
  SEA_TRIALS: 'Sea Trials',
  DELIVERED: 'Delivered',
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'hsl(var(--destructive))',
  HIGH: 'hsl(38 92% 50%)',
  MEDIUM: 'hsl(45 93% 47%)',
  LOW: 'hsl(var(--accent))',
}

const EVENT_COLORS: Record<string, string> = {
  DEFECT_RECORD: 'hsl(var(--destructive))',
  CHANGE_ORDER: 'hsl(var(--warning))',
  DOCUMENT: 'hsl(var(--accent))',
  OWNER_APPROVAL: 'hsl(var(--success))',
  WORK_PACKAGE: 'hsl(var(--primary))',
}

function getEventDescription(event: WorldModelEvent): string {
  switch (event.event_type) {
    case 'DEFECT_CREATED':
      return `NCR raised: ${(event.after_state as { ncr_number?: string }).ncr_number || 'Unknown'}`
    case 'CHANGE_ORDER_CREATED':
      return `Change order created: ${(event.after_state as { co_number?: string }).co_number || 'Unknown'}`
    case 'APPROVAL_CREATED':
      return `Approval requested: ${(event.after_state as { approval_number?: string }).approval_number || 'Unknown'}`
    case 'DOCUMENT_UPLOADED':
      return `Document uploaded: ${(event.after_state as { title?: string }).title || 'Unknown'}`
    default:
      return event.event_type.replace(/_/g, ' ').toLowerCase()
  }
}

const eur = (amount: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)

export default function Dashboard() {
  const navigate = useNavigate()

  const projectQ = useProject()
  const defectsQ = useDefects()
  const approvalsQ = useApprovals()
  const workPackagesQ = useWorkPackages()
  const eventsQ = useEvents()

  const isLoading =
    projectQ.isLoading ||
    defectsQ.isLoading ||
    approvalsQ.isLoading ||
    workPackagesQ.isLoading ||
    eventsQ.isLoading

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>Loading...</div>
    )
  }

  const project = projectQ.data
  const defects = defectsQ.data ?? []
  const approvals = approvalsQ.data ?? []
  const workPackages = workPackagesQ.data ?? []
  const events = eventsQ.data ?? []

  if (!project) {
    return (
      <div style={{ padding: '2rem', color: 'hsl(var(--muted-foreground))' }}>
        Project not found.
      </div>
    )
  }

  const currentPhaseIndex = PHASES.indexOf(project.phase)
  const completedPhases = currentPhaseIndex
  const budgetPct = Math.round((project.budget_spent / project.budget_locked) * 100)
  const openDefects = defects.filter((d) => d.status !== 'CLOSED')
  const pendingApprovals = approvals.filter((a) => a.status === 'PENDING')
  const onHoldWPs = workPackages.filter((wp) => wp.status === 'ON_HOLD')
  const highestSeverity =
    openDefects.length > 0
      ? openDefects.sort((a, b) => {
          const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
          return order.indexOf(a.severity) - order.indexOf(b.severity)
        })[0].severity
      : null

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Project ZERO — World Model Overview
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Phase */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Current Phase
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold mb-2">{PHASE_LABELS[project.phase]}</div>
            <Progress value={(completedPhases / (PHASES.length - 1)) * 100} className="h-1.5" />
            <div className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Phase {currentPhaseIndex + 1} of {PHASES.length}
            </div>
          </CardContent>
        </Card>

        {/* Budget */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold mb-1">{budgetPct}% used</div>
            <div className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {eur(project.budget_spent)} / {eur(project.budget_locked)}
            </div>
            <Progress value={budgetPct} className="h-1.5" />
          </CardContent>
        </Card>

        {/* Open NCRs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Open NCRs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{openDefects.length}</div>
              {highestSeverity && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[highestSeverity] }}
                  />
                  <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {highestSeverity}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold mb-1">{pendingApprovals.length}</div>
            {pendingApprovals.some((a) => a.deadline && new Date(a.deadline) < new Date()) && (
              <span className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                Some past deadline
              </span>
            )}
            {!pendingApprovals.some((a) => a.deadline && new Date(a.deadline) < new Date()) && pendingApprovals.length > 0 && (
              <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                All within deadline
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Middle section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs Attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-4 pt-0">
            {openDefects.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/app/defects/${d.id}`)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-left w-full transition-colors hover:bg-[hsl(var(--muted))]"
              >
                <AlertTriangle
                  size={16}
                  style={{ color: SEVERITY_COLORS[d.severity], flexShrink: 0 }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{d.ncr_number}</div>
                  <div className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {d.title}
                  </div>
                </div>
                <Badge
                  className="text-xs shrink-0"
                  style={{
                    backgroundColor: SEVERITY_COLORS[d.severity] + '20',
                    color: SEVERITY_COLORS[d.severity],
                    border: 'none',
                  }}
                >
                  {d.severity}
                </Badge>
                <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            ))}

            {pendingApprovals.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate('/app/approvals')}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-left w-full transition-colors hover:bg-[hsl(var(--muted))]"
              >
                <CheckCircle2 size={16} style={{ color: 'hsl(var(--warning))', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.approval_number}</div>
                  <div className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {a.title}
                  </div>
                </div>
                <Badge className="text-xs shrink-0" style={{ backgroundColor: 'hsl(var(--warning)/0.15)', color: 'hsl(var(--warning))', border: 'none' }}>
                  Tier 1
                </Badge>
                <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            ))}

            {onHoldWPs.map((wp) => (
              <button
                key={wp.id}
                onClick={() => navigate(`/app/work-packages/${wp.id}`)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-left w-full transition-colors hover:bg-[hsl(var(--muted))]"
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: 'hsl(var(--muted-foreground))' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{wp.wp_number}</div>
                  <div className="text-xs truncate" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {wp.title}
                  </div>
                </div>
                <Badge className="text-xs shrink-0" style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', border: 'none' }}>
                  ON HOLD
                </Badge>
                <ChevronRight size={14} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </button>
            ))}

            {openDefects.length === 0 && pendingApprovals.length === 0 && onHoldWPs.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                All clear — nothing needs attention right now.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0 p-4 pt-0">
            {[...events]
              .sort((a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime())
              .map((event, idx) => (
                <div key={event.id} className="flex gap-3 relative">
                  {/* Timeline line */}
                  {idx < events.length - 1 && (
                    <div
                      className="absolute left-2 top-5 bottom-0 w-px"
                      style={{ backgroundColor: 'hsl(var(--border))' }}
                    />
                  )}
                  <div
                    className="w-4 h-4 rounded-full shrink-0 mt-1 relative z-10 border-2"
                    style={{
                      backgroundColor: EVENT_COLORS[event.object_type] || 'hsl(var(--muted))',
                      borderColor: 'hsl(var(--card))',
                    }}
                  />
                  <div className="flex-1 pb-4">
                    <div className="text-sm">{getEventDescription(event)}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {formatDistanceToNow(new Date(event.triggered_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Phase timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Phase Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex gap-1">
            {PHASES.map((phase, idx) => {
              const isComplete = idx < currentPhaseIndex
              const isActive = idx === currentPhaseIndex
              return (
                <div key={phase} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full h-3 rounded-sm transition-colors"
                    style={{
                      backgroundColor: isComplete
                        ? 'hsl(var(--primary))'
                        : isActive
                        ? 'hsl(var(--accent))'
                        : 'transparent',
                      border: !isComplete && !isActive ? '1.5px solid hsl(var(--border))' : 'none',
                    }}
                  />
                  <div
                    className="text-center leading-tight"
                    style={{
                      fontSize: '10px',
                      color: isActive
                        ? 'hsl(var(--accent))'
                        : isComplete
                        ? 'hsl(var(--foreground))'
                        : 'hsl(var(--muted-foreground))',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {PHASE_LABELS[phase]}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
