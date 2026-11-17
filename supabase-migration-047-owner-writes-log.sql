-- Migration 047: the owner's side may write the log too.
--
-- Since migration 032 only the captain and crew could record a log day or add
-- a log entry. On a small yacht, or one between captains, the person keeping
-- the log is often the owner or the owner's representative, and they found
-- every field disabled with the reason in one line at the foot of the card.
--
-- Decided with the owner (17 Nov 2026): OWNER and OWNERS_REP may now record
-- log days and add log entries on any logbook. Every entry is still signed
-- with the writer's name and kept in world_model_events. Unchanged, and
-- deliberately so: hours of rest (each crew member's own, action_record_rest),
-- the Oil Record Book (action_add_orb_entry, and signing it: the master only),
-- and striking out an entry (its author or the captain).
--
-- Applied to project xgpdfefxarllgykjbppn as owner_writes_log.

insert into public.action_permissions (action_key, role)
select a.action_key, r.role::user_role
  from (values ('action_record_log_day'), ('action_add_log_entry')) as a(action_key)
 cross join (values ('OWNER'), ('OWNERS_REP')) as r(role)
 where not exists (
   select 1 from public.action_permissions p
    where p.action_key = a.action_key and p.role = r.role::user_role
 );
