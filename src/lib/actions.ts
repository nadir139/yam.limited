import type {
  DefectRecord,
  ChangeOrder,
  OwnerApproval,
  WorkPackage,
  WorldModelEvent,
  ObjectType,
} from './types'
import { evaluateChangeOrderApprovalTier } from './intelligence'

// ─── Event log store (in-memory, will be Supabase later) ─────────────────────

let _eventLog: WorldModelEvent[] = []

export function getEventLog(): WorldModelEvent[] {
  return _eventLog
}

export function clearEventLog(): void {
  _eventLog = []
}

function logEvent(
  projectId: string,
  eventType: string,
  objectType: ObjectType,
  objectId: string,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown>,
  triggeredBy: string,
  cascadeFromEventId: string | null = null,
): WorldModelEvent {
  const event: WorldModelEvent = {
    id: crypto.randomUUID(),
    project_id: projectId,
    event_type: eventType,
    object_type: objectType,
    object_id: objectId,
    before_state: beforeState,
    after_state: afterState,
    triggered_by: triggeredBy,
    triggered_at: new Date().toISOString(),
    cascade_from_event_id: cascadeFromEventId,
  }
  _eventLog = [event, ..._eventLog]
  return event
}

// ─── Defect actions ───────────────────────────────────────────────────────────

export function createDefect(
  defect: DefectRecord,
  triggeredBy: string,
): WorldModelEvent {
  return logEvent(
    defect.project_id,
    'DEFECT_CREATED',
    'DEFECT_RECORD',
    defect.id,
    null,
    defect as unknown as Record<string, unknown>,
    triggeredBy,
  )
}

export function updateDefectStatus(
  defect: DefectRecord,
  newStatus: DefectRecord['status'],
  triggeredBy: string,
): { defect: DefectRecord; event: WorldModelEvent } {
  const before = { ...defect } as unknown as Record<string, unknown>
  const updated = { ...defect, status: newStatus }
  const event = logEvent(
    defect.project_id,
    'DEFECT_STATUS_CHANGED',
    'DEFECT_RECORD',
    defect.id,
    before,
    updated as unknown as Record<string, unknown>,
    triggeredBy,
  )
  return { defect: updated, event }
}

// ─── Change Order actions ─────────────────────────────────────────────────────

export function createChangeOrder(
  co: ChangeOrder,
  triggeredBy: string,
  cascadeFromEventId: string | null = null,
): { co: ChangeOrder; event: WorldModelEvent; approvalSuggestion: { tier: ReturnType<typeof evaluateChangeOrderApprovalTier> } } {
  const event = logEvent(
    co.project_id,
    'CHANGE_ORDER_CREATED',
    'CHANGE_ORDER',
    co.id,
    null,
    co as unknown as Record<string, unknown>,
    triggeredBy,
    cascadeFromEventId,
  )
  const tier = evaluateChangeOrderApprovalTier(co)
  return { co, event, approvalSuggestion: { tier } }
}

// ─── Approval actions ─────────────────────────────────────────────────────────

export function createApproval(
  approval: OwnerApproval,
  triggeredBy: string,
  cascadeFromEventId: string | null = null,
): WorldModelEvent {
  return logEvent(
    approval.project_id,
    'APPROVAL_CREATED',
    'OWNER_APPROVAL',
    approval.id,
    null,
    approval as unknown as Record<string, unknown>,
    triggeredBy,
    cascadeFromEventId,
  )
}

export function decideApproval(
  approval: OwnerApproval,
  decision: 'APPROVED' | 'REJECTED',
  notes: string,
  approverName: string,
  triggeredBy: string,
): { approval: OwnerApproval; event: WorldModelEvent } {
  const before = { ...approval } as unknown as Record<string, unknown>
  const updated: OwnerApproval = {
    ...approval,
    status: decision,
    approver_name: approverName,
    decision_date: new Date().toISOString(),
    decision_notes: notes,
  }
  const event = logEvent(
    approval.project_id,
    `APPROVAL_${decision}`,
    'OWNER_APPROVAL',
    approval.id,
    before,
    updated as unknown as Record<string, unknown>,
    triggeredBy,
  )
  return { approval: updated, event }
}

// ─── Work Package actions ─────────────────────────────────────────────────────

export function updateWorkPackageStatus(
  wp: WorkPackage,
  newStatus: WorkPackage['status'],
  triggeredBy: string,
): { wp: WorkPackage; event: WorldModelEvent } {
  const before = { ...wp } as unknown as Record<string, unknown>
  const updated = { ...wp, status: newStatus }
  const event = logEvent(
    wp.project_id,
    'WORK_PACKAGE_STATUS_CHANGED',
    'WORK_PACKAGE',
    wp.id,
    before,
    updated as unknown as Record<string, unknown>,
    triggeredBy,
  )
  return { wp: updated, event }
}
