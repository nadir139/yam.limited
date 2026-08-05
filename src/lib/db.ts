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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createDefect(
  defect: Omit<DefectRecord, 'id' | 'created_at'>,
): Promise<DefectRecord> {
  const { data, error } = await supabase
    .from('defect_records')
    .insert(defect)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDefect(
  id: string,
  updates: Partial<DefectRecord>,
): Promise<DefectRecord> {
  const { data, error } = await supabase
    .from('defect_records')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createChangeOrder(
  co: Omit<ChangeOrder, 'id' | 'created_at'>,
): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from('change_orders')
    .insert(co)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateApproval(
  id: string,
  updates: Partial<OwnerApproval>,
): Promise<OwnerApproval> {
  const { data, error } = await supabase
    .from('owner_approvals')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createDocument(
  doc: Omit<Document, 'id' | 'created_at'>,
): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .insert(doc)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function logEvent(
  event: Omit<WorldModelEvent, 'id' | 'triggered_at'>,
): Promise<WorldModelEvent> {
  const { data, error } = await supabase
    .from('world_model_events')
    .insert(event)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function createApproval(
  approval: Omit<OwnerApproval, 'id' | 'created_at'>,
): Promise<OwnerApproval> {
  const { data, error } = await supabase
    .from('owner_approvals')
    .insert(approval)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateChangeOrder(
  id: string,
  updates: Partial<ChangeOrder>,
): Promise<ChangeOrder> {
  const { data, error } = await supabase
    .from('change_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProject(
  id: string,
  updates: Partial<Project>,
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInspection(
  id: string,
  updates: Partial<InspectionEvent>,
): Promise<InspectionEvent> {
  const { data, error } = await supabase
    .from('inspection_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function uploadDocument(
  file: File,
  meta: {
    title: string
    docType: Document['doc_type']
    linkedObjectType: Document['linked_object_type'] | null
    linkedObjectId: string | null
    isClassDocument: boolean
  },
): Promise<Document> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${PROJECT_ID}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(path, file)
  if (uploadError) throw uploadError

  const { data: signed, error: signErr } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (signErr) throw signErr

  const docNumber = await nextNumber('documents', 'DOC')
  return createDocument({
    project_id: PROJECT_ID,
    doc_number: docNumber,
    title: meta.title,
    doc_type: meta.docType,
    revision: 'A',
    status: 'DRAFT',
    file_url: signed.signedUrl,
    file_size: file.size,
    mime_type: file.type,
    uploaded_by: 'User',
    uploaded_date: new Date().toISOString().split('T')[0],
    linked_object_type: meta.linkedObjectType,
    linked_object_id: meta.linkedObjectId,
    is_class_document: meta.isClassDocument,
  })
}

/** Returns the next sequential number for a given table, formatted as PREFIX-YYYY-NNN */
export async function nextNumber(
  table: 'defect_records' | 'change_orders' | 'owner_approvals' | 'documents',
  prefix: 'NCR' | 'CO' | 'APPR' | 'DOC',
): Promise<string> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
  const n = (count ?? 0) + 1
  return `${prefix}-2026-${String(n).padStart(3, '0')}`
}
