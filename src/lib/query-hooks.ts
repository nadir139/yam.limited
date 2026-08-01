import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as db from './db'
import { useActiveProject, useProjectId } from '@/contexts/ProjectContext'
import { useAuth } from '@/contexts/AuthContext'
import type { DefectRecord, InspectionEvent, ObjectType } from './types'

/** Re-exported so a page needs one import to reach the active project. */
export { useActiveProject, useProjectId }

// The active project is part of every cache key.
//
// That is what makes switching project safe: React Query treats
// `['defects', A]` and `['defects', B]` as different queries, so nothing from
// the ketch can be shown for a moment under the property's heading while a
// refetch is in flight. Getting this wrong is subtle and looks like a rendering
// glitch rather than the data-integrity bug it is.
export const QUERY_KEYS = {
  vessel: (p: string) => ['vessel', p],
  project: (p: string) => ['project', p],
  workPackages: (p: string) => ['work-packages', p],
  workPackage: (id: string) => ['work-package', id],
  inspections: (p: string) => ['inspections', p],
  defects: (p: string) => ['defects', p],
  defect: (id: string) => ['defect', id],
  changeOrders: (p: string) => ['change-orders', p],
  changeOrder: (id: string) => ['change-order', id],
  approvals: (p: string) => ['approvals', p],
  documents: (p: string) => ['documents', p],
  team: (p: string) => ['team', p],
  events: (p: string) => ['events', p],
}

export const useProject = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.project(projectId),
    queryFn: () => db.fetchProject(projectId),
    enabled: !!projectId,
  })
}

export const useVessel = () => {
  const projectId = useProjectId()
  const { data: project } = useProject()
  const vesselId = project?.vessel_id ?? null
  return useQuery({
    queryKey: QUERY_KEYS.vessel(projectId),
    queryFn: () => db.fetchVessel(vesselId),
    // A property project has no vessel; that is a null result, not a failure.
    enabled: !!projectId && project !== undefined,
  })
}

export const useWorkPackages = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.workPackages(projectId),
    queryFn: () => db.fetchWorkPackages(projectId),
    enabled: !!projectId,
  })
}

export const useWorkPackage = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.workPackage(id),
    queryFn: () => db.fetchWorkPackage(id),
    enabled: !!id,
  })

export const useInspections = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.inspections(projectId),
    queryFn: () => db.fetchInspections(projectId),
    enabled: !!projectId,
  })
}

export const useDefects = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.defects(projectId),
    queryFn: () => db.fetchDefects(projectId),
    enabled: !!projectId,
  })
}

export const useDefect = (id: string) =>
  useQuery({
    queryKey: QUERY_KEYS.defect(id),
    queryFn: () => db.fetchDefect(id),
    enabled: !!id,
  })

export const useChangeOrders = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.changeOrders(projectId),
    queryFn: () => db.fetchChangeOrders(projectId),
    enabled: !!projectId,
  })
}

export const useApprovals = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.approvals(projectId),
    queryFn: () => db.fetchApprovals(projectId),
    enabled: !!projectId,
  })
}

export const useDocuments = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.documents(projectId),
    queryFn: () => db.fetchDocuments(projectId),
    enabled: !!projectId,
  })
}

export const useTeam = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.team(projectId),
    queryFn: () => db.fetchTeam(projectId),
    enabled: !!projectId,
  })
}

export const useEvents = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: QUERY_KEYS.events(projectId),
    queryFn: () => db.fetchEvents(projectId),
    enabled: !!projectId,
  })
}

// ─── Actions ──────────────────────────────────────────────────────────────────
//
// Each hook wraps a single Action (a SECURITY DEFINER Postgres function). The
// multi-step cascade orchestration that used to live here — eight sequential
// writes fired from the browser, with no transaction around them — now happens
// inside the database. If a later step fails, nothing is left half-applied.

/**
 * Invalidates everything an Action's cascade could plausibly have touched.
 *
 * Keys are matched by prefix, so `['defects']` still reaches
 * `['defects', projectId]`. Invalidating across every project rather than only
 * the active one is deliberate: it is a handful of stale entries, and the
 * alternative — reasoning about which project each Action touched — is the kind
 * of cleverness that eventually shows one project's numbers under another's
 * name.
 */
function useCascadeInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['defects'] })
    qc.invalidateQueries({ queryKey: ['defect'] })
    qc.invalidateQueries({ queryKey: ['change-orders'] })
    qc.invalidateQueries({ queryKey: ['change-order'] })
    qc.invalidateQueries({ queryKey: ['approvals'] })
    qc.invalidateQueries({ queryKey: ['inspections'] })
    qc.invalidateQueries({ queryKey: ['documents'] })
    qc.invalidateQueries({ queryKey: ['work-packages'] })
    qc.invalidateQueries({ queryKey: ['work-package'] })
    qc.invalidateQueries({ queryKey: ['project'] })
    qc.invalidateQueries({ queryKey: ['events'] })
    // Some Actions post to an object's thread — closing an NCR files its reason
    // there, and correcting one files what changed. Without this the note the
    // user just wrote does not appear until a reload, which reads exactly like
    // it was thrown away.
    qc.invalidateQueries({ queryKey: ['messages'] })
  }
}

export type DefectFormInput = db.DefectInput
export type CascadeResult = db.CascadeResult

/**
 * Raises an NCR. HIGH/CRITICAL with a cost impact auto-creates the Change Order
 * and Owner Approval; the result reports whether the cascade fired so the UI
 * can show what else moved.
 */
export function useCreateDefectWithCascade() {
  const invalidate = useCascadeInvalidation()
  const projectId = useProjectId()
  return useMutation<CascadeResult, Error, DefectFormInput>({
    mutationFn: (input) => db.raiseDefect(projectId, input),
    onSuccess: invalidate,
  })
}

export function useUpdateDefectStatus() {
  const invalidate = useCascadeInvalidation()
  return useMutation<
    DefectRecord,
    Error,
    {
      id: string
      status: DefectRecord['status']
      closedDate?: string | null
      /** Required by the Action for CLOSED and DISPUTED. */
      notes?: string | null
    }
  >({
    mutationFn: ({ id, status, closedDate, notes }) =>
      db.updateDefectStatus(id, status, closedDate, notes),
    onSuccess: invalidate,
  })
}

/**
 * Corrects an NCR's recorded cost, duration, root cause or description once the
 * real figures are known — including on a closed NCR. The previous values stay
 * in the event log.
 */
export function useAmendDefectImpact() {
  const invalidate = useCascadeInvalidation()
  return useMutation<DefectRecord, Error, { id: string; patch: db.DefectAmendment }>({
    mutationFn: ({ id, patch }) => db.amendDefectImpact(id, patch),
    onSuccess: invalidate,
  })
}

export function useRecordInspectionResult() {
  const invalidate = useCascadeInvalidation()
  return useMutation<
    InspectionEvent,
    Error,
    {
      id: string
      result: InspectionEvent['result']
      notes?: string | null
      actualDate?: string | null
    }
  >({
    mutationFn: ({ id, result, notes, actualDate }) =>
      db.recordInspectionResult(id, result, notes ?? null, actualDate ?? null),
    onSuccess: invalidate,
  })
}

/** Approving or rejecting also propagates the decision to the linked Change Order. */
export function useDecideApproval() {
  const invalidate = useCascadeInvalidation()
  return useMutation<
    Awaited<ReturnType<typeof db.decideApproval>>,
    Error,
    { id: string; decision: 'APPROVED' | 'REJECTED'; notes?: string | null }
  >({
    mutationFn: ({ id, decision, notes }) =>
      db.decideApproval(id, decision, notes ?? null),
    onSuccess: invalidate,
  })
}

/** The next phase is derived server-side from the current one. */
export function useAdvancePhase() {
  const invalidate = useCascadeInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: () => db.advanceProjectPhase(projectId),
    onSuccess: invalidate,
  })
}

export function useUploadDocument() {
  const invalidate = useCascadeInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: (params: {
      file: File
      title: string
      docType: import('./types').Document['doc_type']
      linkedObjectType: import('./types').Document['linked_object_type']
      linkedObjectId: string | null
      isClassDocument: boolean
    }) =>
      db.uploadDocument(projectId, params.file, {
        title: params.title,
        docType: params.docType,
        linkedObjectType: params.linkedObjectType,
        linkedObjectId: params.linkedObjectId,
        isClassDocument: params.isClassDocument,
      }),
    onSuccess: invalidate,
  })
}

// ─── Planning the work ────────────────────────────────────────────────────────

export type WorkPackageInput = db.WorkPackageInput
export type WorkPackageUpdate = db.WorkPackageUpdate
export type InspectionInput = db.InspectionInput

export function useCreateWorkPackage() {
  const invalidate = useCascadeInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: (input: WorkPackageInput) => db.createWorkPackage(projectId, input),
    onSuccess: invalidate,
  })
}

/** Completing a package is refused server-side while open NCRs are linked to it. */
export function useUpdateWorkPackage() {
  const invalidate = useCascadeInvalidation()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkPackageUpdate }) =>
      db.updateWorkPackage(id, patch),
    onSuccess: invalidate,
  })
}

export function useScheduleInspection() {
  const invalidate = useCascadeInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: (input: InspectionInput) => db.scheduleInspection(projectId, input),
    onSuccess: invalidate,
  })
}

export function useLinkDefectToWorkPackage() {
  const invalidate = useCascadeInvalidation()
  return useMutation({
    mutationFn: ({ defectId, workPackageId }: { defectId: string; workPackageId: string | null }) =>
      db.linkDefectToWorkPackage(defectId, workPackageId),
    onSuccess: invalidate,
  })
}

/** Every recorded change to one object, oldest first. */
export const useObjectEvents = (
  objectType: Parameters<typeof db.fetchObjectEvents>[0],
  objectId: string | undefined,
) =>
  useQuery({
    queryKey: ['events', objectType, objectId],
    queryFn: () => db.fetchObjectEvents(objectType, objectId!),
    enabled: !!objectId,
  })

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * The caller's role **on the active project**.
 *
 * A person is not one role. The same email can be OWNERS_REP on the ketch and
 * nothing at all on somebody else's property, so asking for "my role" without
 * naming a project was always answering a different question than the one the
 * UI meant.
 */
export const useMyRole = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: ['my-role', projectId],
    queryFn: () => db.fetchMyRole(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  })
}

/**
 * `can('action_create_work_package')` — for hiding controls the role cannot use.
 *
 * Defaults to false while loading, so a control never flashes in and then
 * fails. The Action enforces regardless; this only spares the user a refusal
 * they could not have predicted.
 */
/**
 * The whole role/action matrix. Public-readable and small.
 *
 * Exported because the team page renders it directly: a hand-written table of
 * "what each role can do" is prose that drifts, and the previous one had — it
 * omitted two of the seven roles entirely.
 */
export const useActionPermissions = () =>
  useQuery({
    queryKey: ['action-permissions'],
    queryFn: db.fetchActionPermissions,
    staleTime: 5 * 60_000,
  })

export function usePermissions() {
  const { data: role = null, isLoading: roleLoading } = useMyRole()
  const { data: matrix = [], isLoading: matrixLoading } = useActionPermissions()

  const isLoading = roleLoading || matrixLoading
  const can = (actionKey: string) =>
    !isLoading && role !== null && matrix.some((p) => p.action_key === actionKey && p.role === role)

  return { role, can, isLoading }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageInput = db.MessageInput

export const MESSAGE_KEYS = {
  project: (p: string) => ['messages', 'project', p],
  object: (t: string, id: string) => ['messages', t, id],
  unplanned: (p: string) => ['messages', 'unplanned', p],
}

export const useProjectMessages = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: MESSAGE_KEYS.project(projectId),
    queryFn: () => db.fetchProjectMessages(projectId),
    enabled: !!projectId,
  })
}

export const useObjectMessages = (objectType: ObjectType, objectId: string | undefined) =>
  useQuery({
    queryKey: MESSAGE_KEYS.object(objectType, objectId ?? ''),
    queryFn: () => db.fetchObjectMessages(objectType, objectId!),
    enabled: !!objectId,
  })

/** Work recorded as outside the agreed scope, across the whole project. */
export const useUnplannedWork = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: MESSAGE_KEYS.unplanned(projectId),
    queryFn: () => db.fetchUnplannedWork(projectId),
    enabled: !!projectId,
  })
}

export function usePostMessage() {
  const qc = useQueryClient()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: (input: MessageInput) => db.postMessage(projectId, input),
    onSuccess: () => {
      // Every message view is a filter over the same table, so refresh all of
      // them rather than guessing which one the caller is looking at.
      qc.invalidateQueries({ queryKey: ['messages'] })
      // A message with mentions in it has just created obligations. They are
      // written in the same transaction, so there is nothing to wait for —
      // but nothing tells the job list that unless we do.
      qc.invalidateQueries({ queryKey: ['action-items'] })
    },
  })
}


// ─── Action items ─────────────────────────────────────────────────────────────
//
// The list nobody types into. See `db.ts` for why these have no "create" hook:
// an item exists because somebody was named in a sentence, and the only way to
// make one is to say the sentence.

export const ITEM_KEYS = {
  mine: (p: string, email: string) => ['action-items', 'mine', p, email],
  project: (p: string) => ['action-items', 'project', p],
  object: (t: string, id: string) => ['action-items', 'object', t, id],
}

/** What the signed-in person owes on this project. */
export const useMyActionItems = () => {
  const projectId = useProjectId()
  const { user } = useAuth()
  const email = user?.email ?? ''
  return useQuery({
    queryKey: ITEM_KEYS.mine(projectId, email),
    queryFn: () => db.fetchMyActionItems(projectId, email),
    enabled: !!projectId && !!email,
  })
}

/** What everyone owes — who is waiting on whom, in one place. */
export const useProjectActionItems = () => {
  const projectId = useProjectId()
  return useQuery({
    queryKey: ITEM_KEYS.project(projectId),
    queryFn: () => db.fetchProjectActionItems(projectId),
    enabled: !!projectId,
  })
}

/** The items raised in one object's thread, shown next to it. */
export const useObjectActionItems = (
  objectType: ObjectType | undefined,
  objectId: string | undefined,
) =>
  useQuery({
    queryKey: ITEM_KEYS.object(objectType ?? '', objectId ?? ''),
    queryFn: () => db.fetchObjectActionItems(objectType!, objectId!),
    enabled: !!objectType && !!objectId,
  })

/** How many things are still waiting on you. Drives the badge in the sidebar. */
export function useMyOpenItemCount(): number {
  const { data = [] } = useMyActionItems()
  return data.filter((i) => i.status === 'OPEN').length
}

/**
 * Answering, declining and completing all invalidate the same three things:
 * the item lists, the thread the reply was posted into, and the object history.
 */
function useItemInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['action-items'] })
    qc.invalidateQueries({ queryKey: ['messages'] })
    qc.invalidateQueries({ queryKey: ['events'] })
  }
}

export function useAcknowledgeItem() {
  const projectId = useProjectId()
  const invalidate = useItemInvalidation()
  return useMutation({
    mutationFn: ({ itemId, response }: { itemId: string; response: string }) =>
      db.acknowledgeItem(projectId, itemId, response),
    onSuccess: invalidate,
  })
}

export function useDeclineItem() {
  const projectId = useProjectId()
  const invalidate = useItemInvalidation()
  return useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      db.declineItem(projectId, itemId, reason),
    onSuccess: invalidate,
  })
}

export function useCompleteItem() {
  const projectId = useProjectId()
  const invalidate = useItemInvalidation()
  return useMutation({
    mutationFn: ({ itemId, note }: { itemId: string; note?: string | null }) =>
      db.completeItem(projectId, itemId, note),
    onSuccess: invalidate,
  })
}

// ─── Starting a project ───────────────────────────────────────────────────────

export type ProjectInput = db.ProjectInput

/**
 * Creates a project and switches to it.
 *
 * Landing on the new project rather than staying on the old one is the whole
 * point of having just made it, and the membership row the Action writes is
 * what makes it readable at all.
 */
export function useCreateProject() {
  const qc = useQueryClient()
  const { setActiveProjectId } = useActiveProject()
  return useMutation({
    mutationFn: (input: ProjectInput) => db.createProject(input),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['my-projects'] })
      setActiveProjectId(project.id)
    },
  })
}


// ─── The team ─────────────────────────────────────────────────────────────────

export type InviteInput = db.InviteInput

/** Invalidates the team list and the events that record what happened to it. */
function useTeamInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['team'] })
    qc.invalidateQueries({ queryKey: ['events'] })
    qc.invalidateQueries({ queryKey: ['my-role'] })
  }
}

export function useInviteMember() {
  const invalidate = useTeamInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: (input: InviteInput) => db.inviteMember(projectId, input),
    onSuccess: invalidate,
  })
}

export function useChangeMemberRole() {
  const invalidate = useTeamInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: ({ memberId, role, reason }: {
      memberId: string
      role: import('./types').UserRole
      reason?: string | null
    }) => db.changeMemberRole(projectId, memberId, role, reason),
    onSuccess: invalidate,
  })
}

export function useRemoveMember() {
  const invalidate = useTeamInvalidation()
  const projectId = useProjectId()
  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: string }) =>
      db.removeMember(projectId, memberId, reason),
    onSuccess: invalidate,
  })
}

/** How long "here now" lasts, and how often the heartbeat fires. */
export const PRESENCE_WINDOW_MS = 2 * 60_000
const HEARTBEAT_MS = 60_000

/**
 * Tells the project you are looking at it.
 *
 * Runs while any authenticated page is mounted. The first call is what turns an
 * invitation into an arrival — it stamps `first_seen_at`, which is the other
 * half of "you have not opened the link I sent a week ago".
 *
 * Deliberately not a websocket presence channel. Presence would give a live
 * roster, but Realtime channels are not covered by the row-level security that
 * protects everything else here, so a signed-in non-member who guessed a
 * project id could watch who is online. A heartbeat is one throttled write, is
 * protected by the same policies as the rest, and leaves a durable trace.
 */
export function useProjectPresence() {
  const projectId = useProjectId()
  const qc = useQueryClient()

  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    const beat = async () => {
      await db.recordProjectAccess(projectId)
      // The first beat can flip INVITED to ACTIVE, which the team page should
      // show without waiting for a manual refresh.
      if (!cancelled) qc.invalidateQueries({ queryKey: ['team', projectId] })
    }

    void beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [projectId, qc])
}

// ─── Vocabulary ───────────────────────────────────────────────────────────────

export type VocabularyKind = db.VocabularyKind

/**
 * The values this project type may use, in the order the registry gives them.
 *
 * PHASE is the one where order carries meaning — it is a ladder, and each type
 * has its own complete sequence rather than a shared spine plus extras.
 *
 * Falls back to nothing rather than to every value: a form that silently offers
 * "haul out" on a farmhouse is worse than one that briefly offers nothing while
 * the registry loads.
 */
export function useVocabulary(kind: VocabularyKind): string[] {
  const { activeProject } = useActiveProject()
  const { data: all = [] } = useQuery({
    queryKey: ['vocabulary'],
    queryFn: db.fetchVocabulary,
    staleTime: 30 * 60_000,
  })

  const type = activeProject?.project_type
  return useMemo(() => {
    if (!type) return []
    return all
      .filter((v) => v.kind === kind && (v.applies_to === null || v.applies_to === type))
      .sort((a, b) => a.display_order - b.display_order)
      .map((v) => v.value)
  }, [all, kind, type])
}
