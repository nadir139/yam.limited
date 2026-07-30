import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Supabase Realtime changes for the core tables.
 * Any remote change invalidates the relevant React Query cache,
 * so all connected users see live updates without polling.
 *
 * Cache keys carry the project id since the app went multi-project, so these
 * invalidate by prefix — `['defects']` reaches `['defects', anyProject]`.
 * Realtime only delivers rows the subscriber may read, and a change on a
 * project the user is not looking at is worth clearing anyway: they may switch
 * to it a second later.
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
          qc.invalidateQueries({ queryKey: ['defects'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'owner_approvals' },
        () => {
          qc.invalidateQueries({ queryKey: ['approvals'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'change_orders' },
        () => {
          qc.invalidateQueries({ queryKey: ['change-orders'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_model_events' },
        () => {
          qc.invalidateQueries({ queryKey: ['events'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          qc.invalidateQueries({ queryKey: ['project'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_packages' },
        () => {
          qc.invalidateQueries({ queryKey: ['work-packages'] })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
