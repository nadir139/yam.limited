-- =============================================================================
-- YAM Migration 021 — LIVE UPDATES ACTUALLY LIVE, AND ADVISOR CLEAN-UP
--
-- Applied to the live project as `realtime_and_hardening`.
--
-- 1. The `supabase_realtime` publication was empty. useRealtimeSync subscribed
--    to eleven tables, the subscription succeeded, and no change was ever
--    delivered -- so "everyone sees updates live" only ever meant "after a
--    reload". postgres_changes respects RLS, so publishing these tables shows
--    each subscriber only the rows they can already read.
--
-- 2. Three pure helper functions had a mutable search_path (advisor 0011).
--
-- 3. Six SECURITY DEFINER functions were executable by `anon` (advisor 0028).
--    The Actions check permission inside and refuse a caller with no project
--    role, so those were not an open door -- but there is no reason for a
--    signed-out visitor to reach them, and "it refuses inside" is one bug away
--    from not refusing.
--
--    mention_context is different: it has no check at all. Given any object's
--    id it returns that object's number, title and planned date, whichever
--    project it belongs to, to anyone. It is an internal helper of
--    action_post_message (which runs as the owner and keeps its access), and
--    nothing calls it over the API, so it is closed to everyone.
--
-- 4. Covering indexes for the foreign keys the advisor lists (0001). The
--    tables are small today; these are the joins every detail page makes.
-- =============================================================================

-- 1. Realtime ---------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'defect_records', 'owner_approvals', 'change_orders', 'world_model_events',
    'projects', 'work_packages', 'inspection_events', 'documents', 'messages',
    'action_items', 'project_members'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 2. search_path ------------------------------------------------------------
alter function public.approval_tier_for_cost(numeric) set search_path = public;
alter function public.approval_days_for_tier(public.approval_tier) set search_path = public;
alter function public.discipline_abbrev(public.discipline) set search_path = public;

-- 3. No anonymous execution of SECURITY DEFINER functions --------------------
revoke execute on function public.action_acknowledge_item(uuid, uuid, text) from anon, public;
revoke execute on function public.action_complete_item(uuid, uuid, text) from anon, public;
revoke execute on function public.action_decline_item(uuid, uuid, text) from anon, public;
revoke execute on function public.action_post_message(text, text, text, uuid, text, text, uuid, uuid[]) from anon, public;
revoke execute on function public.current_actor_name() from anon, public;
revoke execute on function public.mention_context(public.object_type, uuid) from anon, authenticated, public;

grant execute on function public.action_acknowledge_item(uuid, uuid, text) to authenticated;
grant execute on function public.action_complete_item(uuid, uuid, text) to authenticated;
grant execute on function public.action_decline_item(uuid, uuid, text) to authenticated;
grant execute on function public.action_post_message(text, text, text, uuid, text, text, uuid, uuid[]) to authenticated;
grant execute on function public.current_actor_name() to authenticated;

-- 4. Foreign-key indexes -----------------------------------------------------
create index if not exists action_items_response_message_id_idx on public.action_items (response_message_id);
create index if not exists change_orders_approval_id_idx on public.change_orders (approval_id);
create index if not exists change_orders_defect_record_id_idx on public.change_orders (defect_record_id);
create index if not exists defect_records_change_order_id_idx on public.defect_records (change_order_id);
create index if not exists defect_records_inspection_event_id_idx on public.defect_records (inspection_event_id);
create index if not exists defect_records_work_package_id_idx on public.defect_records (work_package_id);
create index if not exists inspection_events_work_package_id_idx on public.inspection_events (work_package_id);
create index if not exists owner_approvals_change_order_id_idx on public.owner_approvals (change_order_id);
create index if not exists projects_vessel_id_idx on public.projects (vessel_id);
create index if not exists world_model_events_cascade_from_event_id_idx on public.world_model_events (cascade_from_event_id);
