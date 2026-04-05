import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as db from './db'
import type { DefectRecord, OwnerApproval } from './types'

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
    },
  })
}
