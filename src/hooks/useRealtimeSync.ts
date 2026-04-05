import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { QUERY_KEYS } from '@/lib/query-hooks'

/**
 * Subscribes to Supabase Realtime changes for the core tables.
 * Any remote change invalidates the relevant React Query cache,
 * so all connected users see live updates without polling.
 */
export function useRealtimeSync() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('world-model-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'defect_records' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.defects })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'owner_approvals' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.approvals })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'change_orders' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.changeOrders })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_model_events' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.events })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.project })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_packages' },
        () => {
          qc.invalidateQueries({ queryKey: QUERY_KEYS.workPackages })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
