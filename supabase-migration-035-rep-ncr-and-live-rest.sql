-- Migration 035: the owner's rep raises NCRs from the log; hours of rest live.
--
-- 1. The owner's rep follows the boat's defects for the owner, so they may
--    turn a defect entry into an NCR as the captain and crew can (decided by
--    the owner, 11 Oct 2026).
-- 2. rest_records joins the realtime publication. Realtime applies the
--    table's RLS to each subscriber, so a change reaches only the crew member
--    and the captain (can_read_rest); everyone else refreshes the counts from
--    the REST_RECORDED event, which carries the month only.
--
-- Applied to project xgpdfefxarllgykjbppn as rep_ncr_and_live_rest.

insert into action_permissions (action_key, role)
values ('action_raise_ncr_from_entry', 'OWNERS_REP')
on conflict do nothing;

do $$ begin
  alter publication supabase_realtime add table public.rest_records;
exception when duplicate_object then null;
end $$;
