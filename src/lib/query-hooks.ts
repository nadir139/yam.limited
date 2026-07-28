import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as db from './db'
import type { DefectRecord, InspectionEvent } from './types'

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
    { id: string; status: DefectRecord['status']; closedDate?: string | null }
  >({
    mutationFn: ({ id, status, closedDate }) =>
      db.updateDefectStatus(id, status, closedDate),
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
