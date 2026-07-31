import { at, eur, percent, sinceNow } from '@/lib/format'
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, ChevronRight, ArrowRight, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  useProject,
  useDefects,
  useApprovals,
  useWorkPackages,
  useEvents,
  useAdvancePhase,
  useVocabulary,
} from '@/lib/query-hooks'
import { useTranslation } from '@/lib/i18n'
import type { WorldModelEvent } from '@/lib/types'

// The phase ladder is per project type and comes from ontology_vocabulary.
// It used to be this hardcoded marine sequence, which is why a farmhouse was
// offered "Advance to Haul Out".

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


export default function Dashboard() {
  const navigate = useNavigate()
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const projectQ = useProject()
  const defectsQ = useDefects()
  const approvalsQ = useApprovals()
  const workPackagesQ = useWorkPackages()
  const eventsQ = useEvents()
  const advancePhase = useAdvancePhase()
  const { t } = useTranslation()
  // This project type's own ladder, from ontology_vocabulary. A property goes
  // pre-survey → documents → survey → compliance → remediation → certification,
  // and is never offered a haul out.
  const PHASES = useVocabulary('PHASE')

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
  // Null rather than 0 when no budget is set — a project created today has
  // none, and a bar sitting at 0% implies a budget nobody has agreed. This
  // shipped once as "NaN% used"; `percent` is where that lives now.
  const budgetPct = percent(project.budget_spent, project.budget_locked)
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

  // Phase advance gates
  const criticalOpenNCRs = openDefects.filter((d) => d.severity === 'CRITICAL')
  const blockedApprovals = pendingApprovals.filter((a) => a.tier !== 'TIER_1')
  const phaseGates = [
    {
      label: 'No critical open NCRs',
      passed: criticalOpenNCRs.length === 0,
      detail: criticalOpenNCRs.length > 0 ? `${criticalOpenNCRs.length} open` : undefined,
    },
    {
      label: 'No pending Tier 2+ approvals',
      passed: blockedApprovals.length === 0,
      detail: blockedApprovals.length > 0 ? `${blockedApprovals.length} pending` : undefined,
    },
    {
      label: 'No work packages on hold',
      passed: onHoldWPs.length === 0,
      detail: onHoldWPs.length > 0 ? `${onHoldWPs.length} on hold` : undefined,
    },
  ]
  const canAdvancePhase = phaseGates.every((g) => g.passed) && currentPhaseIndex < PHASES.length - 1
  const isLastPhase = currentPhaseIndex >= PHASES.length - 1

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md shadow-lg text-sm font-medium text-white" style={{ backgroundColor: 'hsl(var(--success))' }}>
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'hsl(var(--foreground))' }}>
            Dashboard
          </h1>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
            {[project.vessel?.name, project.name].filter(Boolean).join(' — ')}
          </p>
        </div>
        {!isLastPhase && (
          <Button
            size="sm"
            onClick={() => setAdvanceDialogOpen(true)}
            disabled={!canAdvancePhase}
            style={canAdvancePhase
              ? { backgroundColor: 'hsl(var(--primary))', color: 'white' }
              : { opacity: 0.6 }
            }
          >
            {canAdvancePhase ? (
              <>
                <ArrowRight size={14} className="mr-1.5" />
                Advance to {t(`phase.${PHASES[currentPhaseIndex + 1]}`)}
              </>
            ) : (
              <>
                <Lock size={14} className="mr-1.5" />
                Phase Locked
              </>
            )}
          </Button>
        )}
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
            <div className="text-xl font-bold mb-2">{t(`phase.${project.phase}`)}</div>
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
            <div className="text-xl font-bold mb-1">
              {budgetPct === null ? 'Not set' : `${budgetPct}% used`}
            </div>
            <div className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
              {eur(project.budget_spent)} / {eur(project.budget_locked)}
            </div>
            <Progress value={budgetPct ?? 0} className="h-1.5" />
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
              .sort((a, b) => at(b.triggered_at) - at(a.triggered_at))
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
                      {sinceNow(event.triggered_at)}
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
                    {t(`phase.${phase}`)}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Advance phase dialog */}
      <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance to {t(`phase.${PHASES[currentPhaseIndex + 1] ?? project.phase}`)}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 my-2">
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
              Phase gate checks — all must pass before advancing.
            </p>
            {phaseGates.map((gate, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: gate.passed ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}
                >
                  {gate.passed ? '✓' : '✗'}
                </div>
                <div className="flex-1 text-sm">{gate.label}</div>
                {gate.detail && (
                  <span className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>{gate.detail}</span>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!canAdvancePhase || advancePhase.isPending}
              onClick={() =>
                // No argument: the server reads the current phase and derives
                // the next one, so a stale client can't skip or repeat a phase.
                advancePhase.mutate(undefined, {
                  onSuccess: (updated) => {
                    setAdvanceDialogOpen(false)
                    showToast(`Phase advanced to ${t(`phase.${updated.phase}`)}`)
                  },
                })
              }
              style={{ backgroundColor: 'hsl(var(--primary))', color: 'white' }}
            >
              {advancePhase.isPending ? 'Advancing…' : 'Confirm Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
