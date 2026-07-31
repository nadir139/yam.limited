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
  Discipline,
  WorkPackageStatus,
  UserRole,
  Message,
  MessageKind,
  MessageSource,
  ObjectType,
} from './types'

/** A project row carrying just enough of its vessel to name it. */
export type ProjectWithVessel = Project & { vessel: { name: string } | null }

// ─── Reads ────────────────────────────────────────────────────────────────────
//
// Every read takes the project explicitly. It used to be a module constant
// (`PROJECT_ID`) referenced by eleven queries, which made a second project
// impossible to add without touching all of them and made "which project is
// this?" a question with no answer at the type level. Row-level security
// enforces membership regardless; passing the id is what decides *which* of the
// caller's projects they are looking at.

/**
 * Every project the caller belongs to. RLS does the filtering.
 *
 * The vessel's name comes along because it is usually the name people actually
 * use: this project is called "5-Year Survey 2026" and everyone on it calls it
 * "Project ZERO", which is the ketch. A switcher that showed only the project
 * name would be correct and unrecognisable.
 */
export async function fetchMyProjects(): Promise<ProjectWithVessel[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, vessel:vessels(name)')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as ProjectWithVessel[]
}

/** A project's vessel, or null — a property project has none. */
export async function fetchVessel(vesselId: string | null): Promise<Vessel | null> {
  if (!vesselId) return null
  const { data, error } = await supabase
    .from('vessels')
    .select('*')
    .eq('id', vesselId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchProject(
  projectId: string,
): Promise<Project & { vessel: Vessel | null }> {
  const { data, error } = await supabase
    .from('projects')
    .select('*, vessel:vessels(*)')
    .eq('id', projectId)
    .single()
  if (error) throw error
  return data
}

export async function fetchWorkPackages(projectId: string): Promise<WorkPackage[]> {
  const { data, error } = await supabase
    .from('work_packages')
    .select('*')
    .eq('project_id', projectId)
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

export async function fetchInspections(projectId: string): Promise<InspectionEvent[]> {
  const { data, error } = await supabase
    .from('inspection_events')
    .select('*')
    .eq('project_id', projectId)
    .order('scheduled_date')
  if (error) throw error
  return data ?? []
}

export async function fetchDefects(projectId: string): Promise<DefectRecord[]> {
  const { data, error } = await supabase
    .from('defect_records')
    .select('*')
    .eq('project_id', projectId)
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

export async function fetchChangeOrders(projectId: string): Promise<ChangeOrder[]> {
  const { data, error } = await supabase
    .from('change_orders')
    .select('*')
    .eq('project_id', projectId)
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

export async function fetchApprovals(projectId: string): Promise<OwnerApproval[]> {
  const { data, error } = await supabase
    .from('owner_approvals')
    .select('*')
    .eq('project_id', projectId)
    .order('requested_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchDocuments(projectId: string): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('uploaded_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * The whole team, including people who were invited and never turned up, and
 * people who have left.
 *
 * Leavers are deliberately returned rather than filtered out here: their rows
 * are what keep an author on everything they wrote, and hiding them from the
 * team page would make the record look like they were never there.
 */
export async function fetchTeam(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from('project_members')
    .select('*')
    .eq('project_id', projectId)
    .order('status')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function fetchEvents(projectId: string): Promise<WorldModelEvent[]> {
  const { data, error } = await supabase
    .from('world_model_events')
    .select('*')
    .eq('project_id', projectId)
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
export async function raiseDefect(
  projectId: string,
  input: DefectInput,
): Promise<CascadeResult> {
  const { data, error } = await supabase.rpc('action_raise_defect', {
    p_project_id: projectId,
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

/**
 * Moves an NCR through its lifecycle.
 *
 * `notes` is not optional in practice: the Action refuses CLOSED and DISPUTED
 * without one, because those are the two transitions that end an argument, and
 * the reason is the only part of them worth keeping. It is written to the
 * object's event and posted to its thread, so the agent reads it back with the
 * rest of the record rather than reporting a closure with no explanation.
 */
export async function updateDefectStatus(
  id: string,
  status: DefectRecord['status'],
  closedDate?: string | null,
  notes?: string | null,
): Promise<DefectRecord> {
  const { data, error } = await supabase.rpc('action_update_defect_status', {
    p_defect_id: id,
    p_status: status,
    p_closed_date: closedDate ?? null,
    p_notes: notes?.trim() || null,
  })
  return unwrap(data, error, 'Update defect status') as DefectRecord
}

export interface DefectAmendment {
  reason: string
  cost_impact?: number | null
  schedule_impact_days?: number | null
  root_cause?: DefectRecord['root_cause'] | null
  description?: string | null
}

/**
 * Corrects what an NCR actually cost or actually took, once that is known.
 *
 * The figures on a freshly raised NCR are a guess made in the first five
 * minutes. Without this there was no way to replace them — a job estimated at
 * €30 and a day stayed €30 and a day even after it turned out to be a €50
 * switch over three. The old values are kept in the event's `before_state` and
 * the reason is required, so this corrects the record without erasing what was
 * first believed. Allowed on closed NCRs: closing ends the status, not the
 * record.
 */
export async function amendDefectImpact(
  id: string,
  patch: DefectAmendment,
): Promise<DefectRecord> {
  const { data, error } = await supabase.rpc('action_amend_defect_impact', {
    p_defect_id: id,
    p_reason: patch.reason,
    p_cost_impact: patch.cost_impact ?? null,
    p_schedule_impact_days: patch.schedule_impact_days ?? null,
    p_root_cause: patch.root_cause ?? null,
    p_description: patch.description?.trim() || null,
  })
  const result = unwrap(data, error, 'Correct NCR impact') as { defect: DefectRecord }
  return result.defect
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
export async function advanceProjectPhase(projectId: string): Promise<Project> {
  const { data, error } = await supabase.rpc('action_advance_project_phase', {
    p_project_id: projectId,
  })
  return unwrap(data, error, 'Advance phase') as Project
}

/**
 * Uploads the file to Storage (which enforces its own RLS), then registers the
 * resulting Document through an Action so it lands in the event log.
 */
export async function uploadDocument(
  projectId: string,
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
  const path = `${projectId}/${meta.linkedObjectType ?? 'general'}/${Date.now()}_${safeName}`

  const { error: storageError } = await supabase.storage
    .from('project-documents')
    .upload(path, file, { upsert: false })
  if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`)

  const { data: signedData, error: signedError } = await supabase.storage
    .from('project-documents')
    .createSignedUrl(path, 60 * 60 * 24 * 365)
  if (signedError) throw new Error(`Could not get signed URL: ${signedError.message}`)

  const { data, error } = await supabase.rpc('action_register_document', {
    p_project_id: projectId,
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

// ─── Planning the work ────────────────────────────────────────────────────────
//
// Added in migration 011. Before it, the write path could only record what went
// wrong — the job list itself could be seeded but never grown, which made this a
// defect tracker attached to a fixed scope rather than a model of the project.

export interface WorkPackageInput {
  title: string
  discipline: Discipline
  description: string | null
  planned_hours: number | null
  planned_cost: number | null
  trade_contractor: string | null
  planned_start: string | null
  planned_end: string | null
  is_class_item: boolean
  class_item_ref: string | null
}

/** Adds scope. The WP number is assigned server-side from the discipline. */
export async function createWorkPackage(
  projectId: string,
  input: WorkPackageInput,
): Promise<WorkPackage> {
  const { data, error } = await supabase.rpc('action_create_work_package', {
    p_project_id: projectId,
    p_title: input.title,
    p_discipline: input.discipline,
    p_description: input.description,
    p_planned_hours: input.planned_hours,
    p_planned_cost: input.planned_cost,
    p_trade_contractor: input.trade_contractor,
    p_planned_start: input.planned_start,
    p_planned_end: input.planned_end,
    p_is_class_item: input.is_class_item,
    p_class_item_ref: input.class_item_ref,
  })
  const result = unwrap(data, error, 'Create work package') as { work_package: WorkPackage }
  return result.work_package
}

export interface WorkPackageUpdate {
  status?: WorkPackageStatus
  planned_hours?: number | null
  planned_cost?: number | null
  actual_hours?: number | null
  actual_cost?: number | null
  trade_contractor?: string | null
  planned_start?: string | null
  planned_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
}

/**
 * Progresses a work package. Omitted fields are left as they are — this cannot
 * clear a value, only overwrite one.
 *
 * Moving to COMPLETE is refused while open NCRs are linked to the package. That
 * rejection comes from the database, and its message names them.
 */
export async function updateWorkPackage(
  id: string,
  patch: WorkPackageUpdate,
): Promise<WorkPackage> {
  const { data, error } = await supabase.rpc('action_update_work_package', {
    p_work_package_id: id,
    p_status: patch.status ?? null,
    p_planned_hours: patch.planned_hours ?? null,
    p_planned_cost: patch.planned_cost ?? null,
    p_actual_hours: patch.actual_hours ?? null,
    p_actual_cost: patch.actual_cost ?? null,
    p_trade_contractor: patch.trade_contractor ?? null,
    p_planned_start: patch.planned_start ?? null,
    p_planned_end: patch.planned_end ?? null,
    p_actual_start: patch.actual_start ?? null,
    p_actual_end: patch.actual_end ?? null,
  })
  const result = unwrap(data, error, 'Update work package') as { work_package: WorkPackage }
  return result.work_package
}

export interface InspectionInput {
  title: string
  inspector_role: InspectionEvent['inspector_role']
  work_package_id: string | null
  inspector_name: string | null
  scheduled_date: string | null
  is_class_inspection: boolean
  class_item_ref: string | null
}

/** Books an attendance. Result stays PENDING until recordInspectionResult. */
export async function scheduleInspection(
  projectId: string,
  input: InspectionInput,
): Promise<InspectionEvent> {
  const { data, error } = await supabase.rpc('action_schedule_inspection', {
    p_project_id: projectId,
    p_title: input.title,
    p_inspector_role: input.inspector_role,
    p_work_package_id: input.work_package_id,
    p_inspector_name: input.inspector_name,
    p_scheduled_date: input.scheduled_date,
    p_is_class_inspection: input.is_class_inspection,
    p_class_item_ref: input.class_item_ref,
  })
  const result = unwrap(data, error, 'Schedule inspection') as { inspection: InspectionEvent }
  return result.inspection
}

/** Attaches an open NCR to a work package, or detaches it when given null. */
export async function linkDefectToWorkPackage(
  defectId: string,
  workPackageId: string | null,
): Promise<{ defect: DefectRecord; workPackage: WorkPackage | null }> {
  const { data, error } = await supabase.rpc('action_link_defect_to_work_package', {
    p_defect_id: defectId,
    p_work_package_id: workPackageId,
  })
  const result = unwrap(data, error, 'Attach NCR') as {
    defect: DefectRecord
    work_package: WorkPackage | null
  }
  return { defect: result.defect, workPackage: result.work_package }
}

/**
 * The full recorded history of one object, oldest first.
 *
 * `fetchEvents` returns the project's last 20 events for the dashboard; this is
 * scoped to a single object and unbounded, because an object's page should show
 * everything that ever happened to it. Nothing in this system is overwritten
 * silently — every Action writes an event in the same transaction as its
 * mutation, so this is the whole story, not a summary of it.
 */
export async function fetchObjectEvents(
  objectType: WorldModelEvent['object_type'],
  objectId: string,
): Promise<WorldModelEvent[]> {
  const { data, error } = await supabase
    .from('world_model_events')
    .select('*')
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .order('triggered_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ─── Who the caller is, and what they may do ─────────────────────────────────
//
// Role used to be chosen at sign-in and kept in localStorage, which made it a
// display preference rather than a permission — editable from the browser
// console, and read by nothing server-side. It is now resolved from
// project_members by the verified JWT email (migration 012).

export interface ProjectInput {
  name: string
  projectType: Project['project_type']
  yardName: string | null
  yardLocation: string | null
  plannedStart: string | null
  plannedDelivery: string | null
  budgetLocked: number | null
  classSociety: string | null
}

/**
 * Starts a project. The creator is enrolled as its owner's representative in
 * the same transaction — without a membership row the read policies would hide
 * the project from the person who just made it.
 */
export async function createProject(input: ProjectInput): Promise<Project> {
  const { data, error } = await supabase.rpc('action_create_project', {
    p_name: input.name,
    p_project_type: input.projectType,
    p_yard_name: input.yardName,
    p_yard_location: input.yardLocation,
    p_planned_start: input.plannedStart,
    p_planned_delivery: input.plannedDelivery,
    p_budget_locked: input.budgetLocked ?? 0,
    p_class_society: input.classSociety,
  })
  const result = unwrap(data, error, 'Create project') as { project: Project }
  return result.project
}

export interface ActionPermission {
  action_key: string
  role: UserRole
}

/** The caller's project role, or null when their email is not a member. */
export async function fetchMyRole(projectId: string): Promise<UserRole | null> {
  const { data, error } = await supabase.rpc('current_actor_role', {
    p_project_id: projectId,
  })
  if (error) throw error
  return (data as UserRole | null) ?? null
}

/**
 * The whole matrix, which is public-readable and small.
 *
 * Fetched once and evaluated client-side so the UI can hide what the user
 * cannot do. This is courtesy, not security — every Action re-checks, and a
 * client that skips the check is refused by Postgres.
 */
export async function fetchActionPermissions(): Promise<ActionPermission[]> {
  const { data, error } = await supabase.from('action_permissions').select('*')
  if (error) throw error
  return (data ?? []) as ActionPermission[]
}

// ─── Messages ─────────────────────────────────────────────────────────────────
//
// Communication is part of the world model rather than beside it: a message
// hangs off the object it is about, using the same polymorphic link documents
// use. That is what makes it answerable later — "what did the yard say about
// the chiller" works because the conversation is attached to the chiller's work
// package, not sitting in a room called #general.

/** The project-wide channel: messages attached to no particular object. */
export async function fetchProjectMessages(projectId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', projectId)
    .is('linked_object_type', null)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}

/** The thread on one object. */
export async function fetchObjectMessages(
  objectType: ObjectType,
  objectId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('linked_object_type', objectType)
    .eq('linked_object_id', objectId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}

/** Everything logged as work outside the agreed scope, newest first. */
export async function fetchUnplannedWork(projectId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('project_id', projectId)
    .eq('kind', 'UNPLANNED_WORK')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Message[]
}

export interface MessageInput {
  body: string
  kind?: MessageKind
  linkedObjectType?: ObjectType | null
  linkedObjectId?: string | null
  source?: MessageSource
  meetingRef?: string | null
}

export async function postMessage(
  projectId: string,
  input: MessageInput,
): Promise<Message> {
  const { data, error } = await supabase.rpc('action_post_message', {
    p_project_id: projectId,
    p_body: input.body,
    p_kind: input.kind ?? 'NOTE',
    p_linked_object_type: input.linkedObjectType ?? null,
    p_linked_object_id: input.linkedObjectId ?? null,
    p_source: input.source ?? 'APP',
    p_meeting_ref: input.meetingRef ?? null,
  })
  const result = unwrap(data, error, 'Post message') as { message: Message }
  return result.message
}


// ─── The team ─────────────────────────────────────────────────────────────────
//
// Until migration 017 there was no way to add anyone to a project: the only
// Action that wrote to project_members was action_create_project, and it only
// enrolled the creator. Every project made through the app was a room of one,
// which put the roles, the permissions and the conversation out of reach.

export interface InviteInput {
  email: string
  role: UserRole
  name?: string | null
  company?: string | null
}

/**
 * Adds someone by email. They appear on the team immediately as INVITED.
 *
 * No account is created and no mail is sent from here — membership is keyed on
 * the address, so the moment that person signs in with a magic link they are
 * in. Recording the invitation before they arrive is the point: the gap between
 * `invited_at` and `first_seen_at` is what lets you say "I sent you the link a
 * week ago and you have not opened it."
 */
export async function inviteMember(
  projectId: string,
  input: InviteInput,
): Promise<ProjectMember> {
  const { data, error } = await supabase.rpc('action_invite_member', {
    p_project_id: projectId,
    p_email: input.email.trim(),
    p_role: input.role,
    p_name: input.name?.trim() || null,
    p_company: input.company?.trim() || null,
  })
  const result = unwrap(data, error, 'Invite') as { member: ProjectMember }
  return result.member
}

export async function changeMemberRole(
  projectId: string,
  memberId: string,
  role: UserRole,
  reason?: string | null,
): Promise<ProjectMember> {
  const { data, error } = await supabase.rpc('action_change_member_role', {
    p_project_id: projectId,
    p_member_id: memberId,
    p_role: role,
    p_reason: reason?.trim() || null,
  })
  const result = unwrap(data, error, 'Change role') as { member: ProjectMember }
  return result.member
}

/** Ends access. The row is kept as LEFT so their past work keeps its author. */
export async function removeMember(
  projectId: string,
  memberId: string,
  reason: string,
): Promise<ProjectMember> {
  const { data, error } = await supabase.rpc('action_remove_member', {
    p_project_id: projectId,
    p_member_id: memberId,
    p_reason: reason,
  })
  const result = unwrap(data, error, 'Remove from project') as { member: ProjectMember }
  return result.member
}

/**
 * Heartbeat: "I am looking at this project."
 *
 * Stamps `first_seen_at` once — which is what turns an invitation into an
 * arrival — and refreshes `last_seen_at`. The Action throttles itself to one
 * write per 30 seconds and records an event only on the first visit, so a
 * heartbeat never buries the history it exists to preserve.
 *
 * This is how "here now" is derived, rather than a websocket presence channel:
 * it is protected by the same row-level security as everything else, it
 * survives a reload, and it leaves a durable last-seen trace. What it cannot do
 * is tell you someone closed their laptop three seconds ago, which is not a
 * question this product needs answered.
 */
export async function recordProjectAccess(projectId: string): Promise<void> {
  const { error } = await supabase.rpc('action_record_project_access', {
    p_project_id: projectId,
  })
  // A failure here must never block the page: it is telemetry, not the point.
  if (error) console.warn('Could not record project access:', error.message)
}

// ─── Vocabulary ───────────────────────────────────────────────────────────────
//
// Which words a project type may use. Every enum in this system was named by
// someone looking at a boat; a building does not haul out, and a ketch has no
// visura catastale. The enums are now the union of every vertical and this
// table decides what each project type is actually offered — so adding a
// vertical is rows in the registry rather than a schema change.

export type VocabularyKind = 'PHASE' | 'DISCIPLINE' | 'DOC_TYPE' | 'ROOT_CAUSE'

export interface VocabularyEntry {
  kind: VocabularyKind
  value: string
  /** Null means every project type — the shared spine. */
  applies_to: Project['project_type'] | null
  display_order: number
}

export async function fetchVocabulary(): Promise<VocabularyEntry[]> {
  const { data, error } = await supabase
    .from('ontology_vocabulary')
    .select('kind, value, applies_to, display_order')
    .order('display_order')
  if (error) throw error
  return (data ?? []) as VocabularyEntry[]
}
