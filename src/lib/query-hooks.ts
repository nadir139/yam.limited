import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as db from './db'
import type { DefectRecord, InspectionEvent, ObjectType } from './types'

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

// ─── Actions ──────────────────────────────────────────────────────────────────
//
// Each hook wraps a single Action (a SECURITY DEFINER Postgres function). The
// multi-step cascade orchestration that used to live here — eight sequential
// writes fired from the browser, with no transaction around them — now happens
// inside the database. If a later step fails, nothing is left half-applied.

/** Invalidates everything an Action's cascade could plausibly have touched. */
function useCascadeInvalidation() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.defects })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.changeOrders })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.inspections })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.documents })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.project })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.events })
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
  return useMutation<CascadeResult, Error, DefectFormInput>({
    mutationFn: (input) => db.raiseDefect(input),
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

/** Takes no argument — the server reads the current phase and derives the next. */
export function useAdvancePhase() {
  const invalidate = useCascadeInvalidation()
  return useMutation({
    mutationFn: () => db.advanceProjectPhase(),
    onSuccess: invalidate,
  })
}

export function useUploadDocument() {
  const invalidate = useCascadeInvalidation()
  return useMutation({
    mutationFn: (params: {
      file: File
      title: string
      docType: import('./types').Document['doc_type']
      linkedObjectType: import('./types').Document['linked_object_type']
      linkedObjectId: string | null
      isClassDocument: boolean
    }) =>
      db.uploadDocument(params.file, {
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
  return useMutation({
    mutationFn: (input: WorkPackageInput) => db.createWorkPackage(input),
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
  return useMutation({
    mutationFn: (input: InspectionInput) => db.scheduleInspection(input),
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

export const useMyRole = () =>
  useQuery({ queryKey: ['my-role'], queryFn: db.fetchMyRole, staleTime: 5 * 60_000 })

/**
 * `can('action_create_work_package')` — for hiding controls the role cannot use.
 *
 * Defaults to false while loading, so a control never flashes in and then
 * fails. The Action enforces regardless; this only spares the user a refusal
 * they could not have predicted.
 */
export function usePermissions() {
  const { data: role = null, isLoading: roleLoading } = useMyRole()
  const { data: matrix = [], isLoading: matrixLoading } = useQuery({
    queryKey: ['action-permissions'],
    queryFn: db.fetchActionPermissions,
    staleTime: 5 * 60_000,
  })

  const isLoading = roleLoading || matrixLoading
  const can = (actionKey: string) =>
    !isLoading && role !== null && matrix.some((p) => p.action_key === actionKey && p.role === role)

  return { role, can, isLoading }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageInput = db.MessageInput

export const MESSAGE_KEYS = {
  project: ['messages', 'project'],
  object: (t: string, id: string) => ['messages', t, id],
  unplanned: ['messages', 'unplanned'],
}

export const useProjectMessages = () =>
  useQuery({ queryKey: MESSAGE_KEYS.project, queryFn: db.fetchProjectMessages })

export const useObjectMessages = (objectType: ObjectType, objectId: string | undefined) =>
  useQuery({
    queryKey: MESSAGE_KEYS.object(objectType, objectId ?? ''),
    queryFn: () => db.fetchObjectMessages(objectType, objectId!),
    enabled: !!objectId,
  })

/** Work recorded as outside the agreed scope, across the whole project. */
export const useUnplannedWork = () =>
  useQuery({ queryKey: MESSAGE_KEYS.unplanned, queryFn: db.fetchUnplannedWork })

export function usePostMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MessageInput) => db.postMessage(input),
    onSuccess: () => {
      // Every message view is a filter over the same table, so refresh all of
      // them rather than guessing which one the caller is looking at.
      qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}
