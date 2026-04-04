import type {
  DefectRecord,
  ChangeOrder,
  WorkPackage,
  ApprovalTier,
} from './types'

// ─── Cascade Types ────────────────────────────────────────────────────────────

export type CascadeActionType =
  | 'SUGGEST_CHANGE_ORDER'
  | 'AUTO_CREATE_APPROVAL'
  | 'ESCALATE_APPROVAL'

export interface CascadeAction {
  type: CascadeActionType
  reason: string
  data: Record<string, unknown>
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

export interface BlockingAlert {
  id: string
  type: 'WORK_PACKAGE_ON_HOLD' | 'OPEN_CRITICAL_DEFECT' | 'OVERDUE_APPROVAL'
  title: string
  description: string
  object_type: 'WORK_PACKAGE' | 'DEFECT_RECORD' | 'OWNER_APPROVAL'
  object_id: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  created_at: string
}

// ─── Rule 1: Defect cascade ───────────────────────────────────────────────────

/**
 * When a DefectRecord is created with severity HIGH or CRITICAL:
 * - If cost_impact > 0: suggest creating a ChangeOrder
 */
export function evaluateDefectCascade(defect: DefectRecord): CascadeAction[] {
  const actions: CascadeAction[] = []

  if (defect.severity === 'HIGH' || defect.severity === 'CRITICAL') {
    if (defect.cost_impact && defect.cost_impact > 0) {
      const tier = evaluateChangeOrderApprovalTier({
        id: '',
        project_id: defect.project_id,
        co_number: '',
        title: '',
        description: '',
        trigger_type: 'DEFECT_DISCOVERY',
        status: 'DRAFT',
        cost_delta: defect.cost_impact,
        schedule_delta_days: defect.schedule_impact_days ?? 0,
        raised_by: defect.discovered_by,
        raised_date: defect.created_at,
        defect_record_id: defect.id,
        approval_id: null,
        created_at: defect.created_at,
      })

      actions.push({
        type: 'SUGGEST_CHANGE_ORDER',
        reason: `${defect.severity} severity defect with cost impact of €${defect.cost_impact.toLocaleString()} requires a Change Order`,
        priority: defect.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        data: {
          defect_id: defect.id,
          ncr_number: defect.ncr_number,
          suggested_cost_delta: defect.cost_impact,
          suggested_schedule_delta: defect.schedule_impact_days ?? 0,
          trigger_type: 'DEFECT_DISCOVERY',
          suggested_tier: tier,
        },
      })
    }
  }

  return actions
}

// ─── Rule 2: Change Order approval tier ──────────────────────────────────────

/**
 * Determines the approval tier based on cost delta:
 * - Tier 1: < €10k
 * - Tier 2: €10k–€50k
 * - Tier 3: > €50k
 */
export function evaluateChangeOrderApprovalTier(co: ChangeOrder): ApprovalTier {
  const abs = Math.abs(co.cost_delta)
  if (abs < 10_000) return 'TIER_1'
  if (abs <= 50_000) return 'TIER_2'
  return 'TIER_3'
}

// ─── Rule 3: Blocking items ───────────────────────────────────────────────────

/**
 * Returns alerts for:
 * - Work packages with status ON_HOLD
 * - Open CRITICAL defects
 */
export function getBlockingItems(
  workPackages: WorkPackage[],
  defects: DefectRecord[],
): BlockingAlert[] {
  const alerts: BlockingAlert[] = []

  // Work packages on hold
  for (const wp of workPackages) {
    if (wp.status === 'ON_HOLD') {
      alerts.push({
        id: `block-wp-${wp.id}`,
        type: 'WORK_PACKAGE_ON_HOLD',
        title: `${wp.wp_number} — On Hold`,
        description: `Work package "${wp.title}" is currently on hold and may be blocking downstream work.`,
        object_type: 'WORK_PACKAGE',
        object_id: wp.id,
        severity: 'HIGH',
        created_at: new Date().toISOString(),
      })
    }
  }

  // Critical open defects
  for (const defect of defects) {
    if (defect.severity === 'CRITICAL' && defect.status !== 'CLOSED') {
      alerts.push({
        id: `block-defect-${defect.id}`,
        type: 'OPEN_CRITICAL_DEFECT',
        title: `${defect.ncr_number} — Critical Defect Open`,
        description: `"${defect.title}" is a critical defect that remains unresolved.`,
        object_type: 'DEFECT_RECORD',
        object_id: defect.id,
        severity: 'CRITICAL',
        created_at: defect.created_at,
      })
    }
  }

  return alerts
}
