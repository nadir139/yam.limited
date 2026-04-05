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

/** Returns the next sequential number for a given table, formatted as PREFIX-YYYY-NNN */
export async function nextNumber(
  table: 'defect_records' | 'change_orders' | 'owner_approvals',
  prefix: 'NCR' | 'CO' | 'APPR',
): Promise<string> {
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
  const n = (count ?? 0) + 1
  return `${prefix}-2026-${String(n).padStart(3, '0')}`
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

// ─── Supabase Storage ─────────────────────────────────────────────────────────

export async function uploadFile(
  file: File,
  path: string,
): Promise<{ url: string; size: number; mimeType: string }> {
  const { error } = await supabase.storage
    .from('project-documents')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error

  const { data: urlData } = supabase.storage
    .from('project-documents')
    .getPublicUrl(path)

  return {
    url: urlData.publicUrl,
    size: file.size,
    mimeType: file.type,
  }
}

export async function deleteFile(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from('project-documents')
    .remove([path])
  if (error) throw error
}

export async function nextDocNumber(): Promise<string> {
  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', PROJECT_ID)
  const n = (count ?? 0) + 1
  return `DOC-2026-${String(n).padStart(3, '0')}`
}
