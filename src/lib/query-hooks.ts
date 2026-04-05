import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as db from './db'
import { evaluateDefectCascade, evaluateChangeOrderApprovalTier } from './intelligence'
import { useAuth } from '@/contexts/AuthContext'
import type { DefectRecord, OwnerApproval, ProjectPhase } from './types'

export const QUERY_KEYS = {
  vessel: ['vessel'],
  project: ['project'],
  workPackages: ['work-packages'],
  workPackage: (id: string) => ['work-packages', id],
  inspections: ['inspections'],
  defects: ['defects'],
  defect: (id: string) => ['defects', id],
  changeOrders: ['change-orders'],
  approvals: ['approvals'],
  documents: ['documents'],
  team: ['team'],
  events: ['events'],
}

export const useVessel = () =>
  useQuery({ queryKey: QUERY_KEYS.vessel, queryFn: db.fetchVessel })

export const useProject = () =>
  useQuery({ queryKey: QUERY_KEYS.project, queryFn: db.fetchProject })

export const useWorkPackages = () =>
  useQuery({ queryKey: QUERY_KEYS.workPackages, queryFn: db.fetchWorkPackages })

export const useWorkPackage = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.workPackage(id),
    queryFn: () => db.fetchWorkPackage(id),
    enabled: !!id,
  })

export const useInspections = () =>
  useQuery({ queryKey: QUERY_KEYS.inspections, queryFn: db.fetchInspections })

export const useDefects = () =>
  useQuery({ queryKey: QUERY_KEYS.defects, queryFn: db.fetchDefects })

export const useDefect = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.defect(id),
    queryFn: () => db.fetchDefect(id),
    enabled: !!id,
  })

export const useChangeOrders = () =>
  useQuery({ queryKey: QUERY_KEYS.changeOrders, queryFn: db.fetchChangeOrders })

export const useApprovals = () =>
  useQuery({ queryKey: QUERY_KEYS.approvals, queryFn: db.fetchApprovals })

export const useDocuments = () =>
  useQuery({ queryKey: QUERY_KEYS.documents, queryFn: db.fetchDocuments })

export const useTeam = () =>
  useQuery({ queryKey: QUERY_KEYS.team, queryFn: db.fetchTeam })

export const useEvents = () =>
  useQuery({ queryKey: QUERY_KEYS.events, queryFn: db.fetchEvents })

// Mutations
export function useUpdateApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<OwnerApproval> }) =>
      db.updateApproval(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals }),
  })
}

export function useUpdateDefect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<DefectRecord> }) =>
      db.updateDefect(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.defects })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.events })
    },
  })
}

// ─── Defect input type (what the form collects) ───────────────────────────────

export interface DefectFormInput {
  title: string
  description: string
  location_on_vessel: string
  severity: DefectRecord['severity']
  root_cause: DefectRecord['root_cause']
  disposition: DefectRecord['disposition']
  is_class_defect: boolean
  class_item_ref: string | null
  cost_impact: number | null
  schedule_impact_days: number | null
  work_package_id: string | null
  inspection_event_id: string | null
}

export interface CascadeResult {
  defect: DefectRecord
  changeOrder: import('./types').ChangeOrder | null
  approval: OwnerApproval | null
}

/**
 * Creates a DefectRecord and automatically runs the cascade:
 * HIGH/CRITICAL + cost_impact > 0 → auto-creates ChangeOrder + OwnerApproval
 */
export function useCreateDefectWithCascade() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation<CascadeResult, Error, DefectFormInput>({
    mutationFn: async (input) => {
      const today = new Date().toISOString().split('T')[0]
      const actorName = user?.name || user?.email || 'Unknown'
      const actorId = user?.id || 'anonymous'

      // 1. Get next NCR number
      const ncrNumber = await db.nextNumber('defect_records', 'NCR')

      // 2. Create defect
      const defect = await db.createDefect({
        ...input,
        ncr_number: ncrNumber,
        project_id: db.PROJECT_ID,
        discovered_by: actorName,
        discovered_date: today,
        status: 'OPEN',
        change_order_id: null,
        closed_date: null,
        class_item_ref: input.class_item_ref || null,
      })

      // 3. Log defect created event
      const defectEvent = await db.logEvent({
        project_id: db.PROJECT_ID,
        event_type: 'DEFECT_CREATED',
        object_type: 'DEFECT_RECORD',
        object_id: defect.id,
        before_state: null,
        after_state: { ncr_number: defect.ncr_number, severity: defect.severity, status: defect.status },
        triggered_by: actorId,
        cascade_from_event_id: null,
      })

      // 4. Evaluate cascade rules
      const cascadeActions = evaluateDefectCascade(defect)
      const shouldCascade = cascadeActions.some((a) => a.type === 'SUGGEST_CHANGE_ORDER')

      if (!shouldCascade) {
        return { defect, changeOrder: null, approval: null }
      }

      // 5. Auto-create Change Order
      const coNumber = await db.nextNumber('change_orders', 'CO')
      const co = await db.createChangeOrder({
        project_id: db.PROJECT_ID,
        co_number: coNumber,
        title: `${ncrNumber}: ${defect.title}`,
        description: `Change order automatically raised from ${ncrNumber}. ${defect.description}`,
        trigger_type: 'DEFECT_DISCOVERY',
        status: 'PENDING_APPROVAL',
        cost_delta: defect.cost_impact ?? 0,
        schedule_delta_days: defect.schedule_impact_days ?? 0,
        raised_by: actorName,
        raised_date: today,
        defect_record_id: defect.id,
        approval_id: null,
      })

      // 6. Link CO back to defect + set defect to PENDING_APPROVAL
      await db.updateDefect(defect.id, {
        change_order_id: co.id,
        status: 'PENDING_APPROVAL',
      })

      // 7. Determine approval tier and deadline
      const tier = evaluateChangeOrderApprovalTier(co)
      const daysToDecide = tier === 'TIER_3' ? 2 : tier === 'TIER_2' ? 5 : 14
      const deadline = new Date()
      deadline.setDate(deadline.getDate() + daysToDecide)
      const deadlineStr = deadline.toISOString().split('T')[0]

      const apprNumber = await db.nextNumber('owner_approvals', 'APPR')
      const approval = await db.createApproval({
        project_id: db.PROJECT_ID,
        approval_number: apprNumber,
        title: `Approval required: ${coNumber}`,
        description: co.description,
        tier,
        status: 'PENDING',
        requested_by: actorName,
        requested_date: today,
        approver_name: null,
        decision_date: null,
        decision_notes: null,
        change_order_id: co.id,
        cost_amount: co.cost_delta,
        deadline: deadlineStr,
      })

      // 8. Link approval back to CO
      await db.updateChangeOrder(co.id, { approval_id: approval.id })

      // 9. Log cascade events
      await db.logEvent({
        project_id: db.PROJECT_ID,
        event_type: 'CHANGE_ORDER_CREATED',
        object_type: 'CHANGE_ORDER',
        object_id: co.id,
        before_state: null,
        after_state: { co_number: co.co_number, cost_delta: co.cost_delta, status: co.status },
        triggered_by: actorId,
        cascade_from_event_id: defectEvent.id,
      })
      await db.logEvent({
        project_id: db.PROJECT_ID,
        event_type: 'APPROVAL_CREATED',
        object_type: 'OWNER_APPROVAL',
        object_id: approval.id,
        before_state: null,
        after_state: { approval_number: approval.approval_number, tier: approval.tier, status: approval.status },
        triggered_by: actorId,
        cascade_from_event_id: defectEvent.id,
      })

      return { defect, changeOrder: co, approval }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.defects })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.changeOrders })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.events })
    },
  })
}

// ─── Phase advance ────────────────────────────────────────────────────────────

const PHASE_ORDER: ProjectPhase[] = [
  'PRE_SURVEY',
  'HAUL_OUT',
  'STRUCTURAL',
  'SYSTEMS',
  'INTERIOR',
  'SEA_TRIALS',
  'DELIVERED',
]

export function useAdvancePhase() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ currentPhase }: { currentPhase: ProjectPhase }) => {
      const idx = PHASE_ORDER.indexOf(currentPhase)
      if (idx === -1 || idx >= PHASE_ORDER.length - 1) {
        throw new Error('Project is already at final phase.')
      }
      const nextPhase = PHASE_ORDER[idx + 1]
      const project = await db.updateProject(db.PROJECT_ID, { phase: nextPhase })
      await db.logEvent({
        project_id: db.PROJECT_ID,
        event_type: 'PHASE_ADVANCED',
        object_type: 'PROJECT',
        object_id: db.PROJECT_ID,
        before_state: { phase: currentPhase },
        after_state: { phase: nextPhase },
        triggered_by: user?.id || 'anonymous',
        cascade_from_event_id: null,
      })
      return project
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.project })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.events })
    },
  })
}
