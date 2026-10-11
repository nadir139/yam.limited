import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Supabase Realtime changes for the core tables.
 * Any remote change invalidates the relevant React Query cache,
 * so all connected users see live updates without polling.
 *
 * Only tables in the `supabase_realtime` publication deliver anything. That
 * publication was empty until migration 021, so for months this subscribed
 * successfully and never heard a thing.
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
          qc.invalidateQueries({ queryKey: ['defect'] })
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
          qc.invalidateQueries({ queryKey: ['change-order'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'world_model_events' },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['events'] })
          // Hours of rest are private, so most people never receive the
          // rest_records row itself; the event (month only) tells them the
          // boat's counts have changed.
          if ((payload.new as { event_type?: string } | null)?.event_type === 'REST_RECORDED') {
            qc.invalidateQueries({ queryKey: ['rest'] })
          }
          // A refit hears of yard days through its own events (migration 037).
          if ((payload.new as { event_type?: string } | null)?.event_type?.startsWith('YARD_DAY_')) {
            qc.invalidateQueries({ queryKey: ['yard-days'] })
          }
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
          qc.invalidateQueries({ queryKey: ['work-package'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inspection_events' },
        () => {
          qc.invalidateQueries({ queryKey: ['inspections'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => {
          qc.invalidateQueries({ queryKey: ['documents'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_package_dependencies' },
        () => {
          qc.invalidateQueries({ queryKey: ['dependencies'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parts' },
        () => {
          qc.invalidateQueries({ queryKey: ['parts'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spaces' },
        () => {
          qc.invalidateQueries({ queryKey: ['spaces'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'part_connections' },
        () => {
          qc.invalidateQueries({ queryKey: ['part-connections'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'part_references' },
        () => {
          qc.invalidateQueries({ queryKey: ['part-references'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'part_links' },
        () => {
          qc.invalidateQueries({ queryKey: ['part-links'] })
          qc.invalidateQueries({ queryKey: ['part-history'] })
        },
      )
      // A colleague's reply, and the obligation a mention just created for
      // you, should not wait for a reload to appear.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => {
          qc.invalidateQueries({ queryKey: ['messages'] })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_items' },
        () => {
          qc.invalidateQueries({ queryKey: ['action-items'] })
        },
      )
      // Membership changes are the one thing everyone should see immediately:
      // someone accepting an invitation, arriving, or being removed changes who
      // is in the room while you are looking at the room.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_members' },
        () => {
          qc.invalidateQueries({ queryKey: ['team'] })
          qc.invalidateQueries({ queryKey: ['my-role'] })
          qc.invalidateQueries({ queryKey: ['my-projects'] })
        },
      )
      // The logbook: a day or an entry written on one phone aboard shows on the
      // others. Attendance rows change with their day, so one key covers both.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_days' }, () => {
        qc.invalidateQueries({ queryKey: ['log-days'] })
        qc.invalidateQueries({ queryKey: ['sea-time'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_day_crew' }, () => {
        qc.invalidateQueries({ queryKey: ['log-days'] })
        qc.invalidateQueries({ queryKey: ['sea-time'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'log_entries' }, () =>
        qc.invalidateQueries({ queryKey: ['log-entries'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew' }, () =>
        qc.invalidateQueries({ queryKey: ['crew'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crew_certificates' }, () =>
        qc.invalidateQueries({ queryKey: ['crew-certificates'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orb_entries' }, () =>
        qc.invalidateQueries({ queryKey: ['orb'] }),
      )
      // Finance: RLS delivers these only to the owner side and the captain.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_transactions' }, () =>
        qc.invalidateQueries({ queryKey: ['finance'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_allocations' }, () =>
        qc.invalidateQueries({ queryKey: ['finance'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_receipts' }, () =>
        qc.invalidateQueries({ queryKey: ['finance'] }),
      )
      // Hours of rest: RLS decides who receives these, so only the crew member
      // and the captain see the record change live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rest_records' }, () =>
        qc.invalidateQueries({ queryKey: ['rest'] }),
      )
      // Maintenance: a reading or a service on one phone moves what is due on every screen.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'part_readings' }, () =>
        qc.invalidateQueries({ queryKey: ['maintenance'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_intervals' }, () =>
        qc.invalidateQueries({ queryKey: ['maintenance'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_records' }, () =>
        qc.invalidateQueries({ queryKey: ['maintenance'] }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])
}
