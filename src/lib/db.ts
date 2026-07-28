import { supabase } from './supabase'
import type {
  Vessel,
  Project,
  WorkPackage,
  InspectionEvent,
  DefectRecord,
  ChangeOrder,
  OwnerApproval,
  Document,
  ProjectMember,
  WorldModelEvent,
} from './types'

// Fixed project ID for Project ZERO — matches seed data
export const PROJECT_ID = 'a1b2c3d4-0002-0000-0000-000000000001'
export const VESSEL_ID = 'a1b2c3d4-0001-0000-0000-000000000001'

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function fetchVessel(): Promise<Vessel> {
  const { data, error } = await supabase
    .from('vessels')
    .select('*')
    .eq('id', VESSEL_ID)
    .single()
  if (error) throw error
  return data
}

export async function fetchProject(): Promise<Project & { vessel: Vessel }> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, vessel:vessels(*)')
    .eq('id', PROJECT_ID)
    .single()
  if (error) throw error
  return data
}

export async function fetchWorkPackages(): Promise<WorkPackage[]> {
  const { data, error } = await supabase
    .from('work_packages')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('wp_number')
  if (error) throw error
  return data ?? []
}

export async function fetchWorkPackage(id: string): Promise<WorkPackage> {
  const { data, error } = await supabase
    .from('work_packages')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function fetchInspections(): Promise<InspectionEvent[]> {
  const { data, error } = await supabase
    .from('inspection_events')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('scheduled_date')
  if (error) throw error
  return data ?? []
}

export async function fetchDefects(): Promise<DefectRecord[]> {
  const { data, error } = await supabase
    .from('defect_records')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('discovered_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchDefect(id: string): Promise<DefectRecord> {
  const { data, error } = await supabase
    .from('defect_records')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function fetchChangeOrders(): Promise<ChangeOrder[]> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('raised_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchChangeOrder(id: string): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function fetchApprovals(): Promise<OwnerApproval[]> {
  const { data, error } = await supabase
    .from('owner_approvals')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('requested_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchDocuments(): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('uploaded_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchTeam(): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', PROJECT_ID)
  if (error) throw error
  return data ?? []
}

export async function fetchEvents(): Promise<WorldModelEvent[]> {
  const { data, error } = await supabase
    .from('world_model_events')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .order('triggered_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

export async function fetchInspection(id: string): Promise<InspectionEvent> {
  const { data, error } = await supabase
    .from('inspection_events')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// ─── Actions ──────────────────────────────────────────────────────────────────
//
// Every mutation goes through a SECURITY DEFINER Postgres function. The client
// holds no INSERT/UPDATE/DELETE grant on any table, so these are not merely the
// preferred write path — they are the only one.
//
// What that buys, versus the previous approach of orchestrating writes from the
// browser: each Action is one transaction (no half-applied cascades), the actor
// is stamped from the verified JWT rather than supplied by the caller, and the
// world_model_events entry is written alongside the mutation rather than as a
// separate call the client could skip.

/** Surfaces the Postgres exception message rather than a generic RPC failure. */
function unwrap<T>(data: T | null, error: { message: string } | null, action: string): T {
  if (error) throw new Error(error.message || `${action} failed`)
  if (data === null) throw new Error(`${action} returned no data`)
  return data
}

export interface DefectInput {
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
  changeOrder: ChangeOrder | null
  approval: OwnerApproval | null
}

/**
 * Raises an NCR. HIGH/CRITICAL severity with a cost impact automatically raises
 * the Change Order and Owner Approval it implies — server-side, in one
 * transaction, so the chain can never be left half-built.
 */
export async function raiseDefect(input: DefectInput): Promise<CascadeResult> {
  const { data, error } = await supabase.rpc('action_raise_defect', {
    p_title: input.title,
    p_description: input.description,
    p_location_on_vessel: input.location_on_vessel,
    p_severity: input.severity,
    p_root_cause: input.root_cause,
    p_disposition: input.disposition,
    p_is_class_defect: input.is_class_defect,
    p_class_item_ref: input.class_item_ref,
    p_cost_impact: input.cost_impact,
    p_schedule_impact_days: input.schedule_impact_days,
    p_work_package_id: input.work_package_id,
    p_inspection_event_id: input.inspection_event_id,
  })
  const result = unwrap(data, error, 'Raise defect') as {
    defect: DefectRecord
    change_order: ChangeOrder | null
    approval: OwnerApproval | null
  }
  return {
    defect: result.defect,
    changeOrder: result.change_order,
    approval: result.approval,
  }
}

export async function updateDefectStatus(
  id: string,
  status: DefectRecord['status'],
  closedDate?: string | null,
): Promise<DefectRecord> {
  const { data, error } = await supabase.rpc('action_update_defect_status', {
    p_defect_id: id,
    p_status: status,
    p_closed_date: closedDate ?? null,
  })
  return unwrap(data, error, 'Update defect status') as DefectRecord
}

export async function recordInspectionResult(
  id: string,
  result: InspectionEvent['result'],
  notes: string | null,
  actualDate: string | null,
): Promise<InspectionEvent> {
  const { data, error } = await supabase.rpc('action_record_inspection_result', {
    p_inspection_id: id,
    p_result: result,
    p_notes: notes,
    p_actual_date: actualDate,
  })
  return unwrap(data, error, 'Record inspection result') as InspectionEvent
}

/** Approving or rejecting also propagates the decision to the linked Change Order. */
export async function decideApproval(
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  notes: string | null,
): Promise<{ approval: OwnerApproval; changeOrder: ChangeOrder | null }> {
  const { data, error } = await supabase.rpc('action_decide_approval', {
    p_approval_id: id,
    p_decision: decision,
    p_notes: notes,
  })
  const result = unwrap(data, error, 'Decide approval') as {
    approval: OwnerApproval
    change_order: ChangeOrder | null
  }
  return { approval: result.approval, changeOrder: result.change_order }
}

/** The next phase is derived server-side, so it can't be driven off stale client state. */
export async function advanceProjectPhase(): Promise<Project> {
  const { data, error } = await supabase.rpc('action_advance_project_phase', {})
  return unwrap(data, error, 'Advance phase') as Project
}

/**
 * Uploads the file to Storage (which enforces its own RLS), then registers the
 * resulting Document through an Action so it lands in the event log.
 */
export async function uploadDocument(
  file: File,
  meta: {
    title: string
    docType: Document['doc_type']
    linkedObjectType: Document['linked_object_type']
    linkedObjectId: string | null
    isClassDocument: boolean
  },
): Promise<Document> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${PROJECT_ID}/${meta.linkedObjectType ?? 'general'}/${Date.now()}_${safeName}`

  const { error: storageError } = await supabase.storage
    .from('project-documents')
    .upload(path, file, { upsert: false })
  if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

  const { data: signedData, error: signedError } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (signedError) throw new Error(`Could not get signed URL: ${signedError.message}`)

  const { data, error } = await supabase.rpc('action_register_document', {
    p_title: meta.title,
    p_doc_type: meta.docType,
    p_file_url: signedData.signedUrl,
    p_file_size: file.size,
    p_mime_type: file.type,
    p_linked_object_type: meta.linkedObjectType,
    p_linked_object_id: meta.linkedObjectId,
    p_is_class_document: meta.isClassDocument,
  })
  return unwrap(data, error, 'Register document') as Document
}
