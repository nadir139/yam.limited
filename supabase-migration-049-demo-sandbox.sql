-- Migration 049: the public demo. Every visitor gets their own boat.
--
-- yam.limited/demo signs a visitor in without an email. The demo-session Edge
-- Function creates a throwaway user (app_metadata.yam_demo = true, email
-- visitor-<id>@demo.yam.limited, which never receives mail), calls
-- demo_create_sandbox() to seed a fictional refit for them alone, and hands the
-- browser a one-time sign-in token. The visitor is the owner's representative
-- on their own copy, so they can raise an NCR and watch the cascade fire, ask
-- the agent, approve a change order. Nobody else sees what they do.
--
-- Sandboxes last 24 hours. demo-session purges expired ones (rows, Storage
-- files and the user) each time it creates a new one.
--
-- Guards for demo users:
--   * require_permission() refuses actions that reach outside the sandbox
--     (inviting people, new projects, finance, payments, 3D uploads).
--   * action_create_project / action_open_* (no require_permission) refuse too.
--   * demo_take_agent_turn(): 15 agent turns per visitor, 400 a day overall.
--   * demo_create_sandbox(): at most 60 new sandboxes an hour.
--   * Seeding does not wake agent-watch (yam.demo_seed), so a visit costs no
--     model calls until the visitor does something.
--
-- Every name, boat, company and figure in the seed is fictional.
--
-- Applied to project xgpdfefxarllgykjbppn as demo_sandbox.

-- ─── Who is a demo visitor ───────────────────────────────────────────────────

create or replace function public.is_demo_user()
returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  -- app_metadata is set by the service role only; a user cannot change it.
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'yam_demo')::boolean, false);
$$;

create or replace function public.assert_not_demo(p_what text default 'That')
returns void
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
begin
  if public.is_demo_user() then
    raise exception '% is not available in the demo. Book a call to try it on your own boat.', p_what
      using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Sessions ────────────────────────────────────────────────────────────────

create table if not exists public.demo_sessions (
  user_id uuid primary key,
  email text not null,
  project_id uuid not null,
  vessel_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  agent_turns integer not null default 0
);
create index if not exists demo_sessions_expires_at on public.demo_sessions (expires_at);
create index if not exists demo_sessions_created_at on public.demo_sessions (created_at);
alter table public.demo_sessions enable row level security;
-- No policies: read and written only by the definer functions below.

-- ─── Guards ──────────────────────────────────────────────────────────────────

create or replace function public.require_permission(p_action_key text, p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role user_role := current_actor_role(p_project_id);
begin
  if v_role is null then
    raise exception 'You are not a member of this project' using errcode = 'P0001';
  end if;
  -- Demo visitors own their sandbox, but nothing that reaches past it.
  if public.is_demo_user() and p_action_key in (
       'action_invite_member', 'action_change_member_role', 'action_remove_member',
       'action_create_project', 'action_open_logbook', 'action_set_project_vessel',
       'action_set_project_asset', 'action_set_vessel_model',
       'action_create_finance_account', 'action_import_transactions',
       'action_allocate_transaction', 'action_remove_allocation', 'action_attach_receipt',
       'action_request_release'
     ) then
    perform public.assert_not_demo('This action');
  end if;
  if not exists (
    select 1 from action_permissions ap
     where ap.action_key = p_action_key and ap.role = v_role
  ) then
    raise exception '% is not permitted for your role (%) on this project', p_action_key, v_role
      using errcode = 'P0001';
  end if;
end;
$function$;

-- Functions that create projects without going through require_permission:
-- add the guard as their first statement, leaving the body as it is.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('action_create_project', 'action_open_logbook', 'action_open_in_use', 'action_open_tech_log')
       and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def !~ 'assert_not_demo' then
      v_def := regexp_replace(v_def, E'\nbegin\n', E'\nbegin\n  perform public.assert_not_demo(''Starting a new project'');\n');
      execute v_def;
    end if;
  end loop;
end;
$$;

-- Seeding must not wake the agent: the seed's NCRs and approvals are history.
create or replace function public.agent_watch_on_event()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if coalesce(current_setting('yam.demo_seed', true), '') = 'on' then
    return new;
  end if;
  if new.cascade_from_event_id is null and (
       new.event_type in ('DEFECT_CREATED', 'DEFECT_RAISED', 'CHANGE_ORDER_CREATED', 'APPROVAL_REQUESTED', 'DEFECT_IMPACT_AMENDED')
    or (new.event_type = 'INSPECTION_COMPLETED' and coalesce(new.after_state ->> 'result', '?') <> 'PASS')
    or (new.event_type = 'WORK_PACKAGE_STATUS_CHANGED' and new.after_state ->> 'status' = 'ON_HOLD')
  ) then
    perform public.agent_watch_call(jsonb_build_object('mode', 'event', 'event_id', new.id));
  end if;
  return new;
exception when others then
  raise warning 'agent_watch_on_event: %', sqlerrm;
  return new;
end;
$function$;

-- ─── Agent budget ────────────────────────────────────────────────────────────

-- Called by the agent function, as the caller, before each turn. True for
-- everyone who is not a demo visitor.
create or replace function public.demo_take_agent_turn()
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_today integer;
  v_updated integer;
begin
  if not public.is_demo_user() then
    return true;
  end if;
  select coalesce(sum(agent_turns), 0) into v_today
    from demo_sessions where created_at > now() - interval '24 hours';
  if v_today >= 400 then
    return false;
  end if;
  update demo_sessions
     set agent_turns = agent_turns + 1
   where user_id = auth.uid() and agent_turns < 15 and expires_at > now();
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- ─── Purge ───────────────────────────────────────────────────────────────────

create or replace function public.demo_purge(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s demo_sessions;
begin
  select * into s from demo_sessions where user_id = p_user_id;
  if not found then
    return;
  end if;

  -- Ordered by the foreign keys that do not cascade: children first. The
  -- NCR / change order / approval links are ON DELETE SET NULL, so those
  -- three can go in any order.
  delete from log_day_crew where log_day_id in (select id from log_days where project_id = s.project_id or vessel_id = s.vessel_id);
  delete from rest_record_versions where rest_record_id in (select id from rest_records where project_id = s.project_id or vessel_id = s.vessel_id);
  delete from finance_allocations where transaction_id in (select id from finance_transactions where project_id = s.project_id or vessel_id = s.vessel_id);
  delete from finance_receipts where transaction_id in (select id from finance_transactions where project_id = s.project_id or vessel_id = s.vessel_id);
  delete from payment_milestones where agreement_id in (select id from payment_agreements where project_id = s.project_id or vessel_id = s.vessel_id);
  delete from finance_connection_secrets where connection_id in (select id from finance_connections where project_id = s.project_id or vessel_id = s.vessel_id);

  delete from action_items where project_id = s.project_id;
  delete from agent_notes where project_id = s.project_id;

  delete from part_readings where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from service_records where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from service_intervals where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from rest_records where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from crew_certificates where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from log_entries where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from log_days where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from orb_entries where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from aircraft_flights where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from crew where project_id = s.project_id or vessel_id = s.vessel_id;

  delete from payment_agreements where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from finance_events where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from finance_transactions where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from finance_imports where project_id = s.project_id;
  delete from finance_accounts where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from finance_connections where project_id = s.project_id or vessel_id = s.vessel_id;

  delete from part_references where project_id = s.project_id;
  delete from part_links where project_id = s.project_id;
  delete from part_connections where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from part_imports where project_id = s.project_id;
  delete from parts where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from spaces where project_id = s.project_id or vessel_id = s.vessel_id;
  delete from messages where project_id = s.project_id;
  delete from documents where project_id = s.project_id;
  delete from work_package_dependencies where project_id = s.project_id;
  delete from owner_approvals where project_id = s.project_id;
  delete from change_orders where project_id = s.project_id;
  delete from defect_records where project_id = s.project_id;
  delete from inspection_events where project_id = s.project_id;
  delete from work_packages where project_id = s.project_id;
  delete from world_model_events where project_id = s.project_id;
  delete from project_members where project_id = s.project_id;
  delete from projects where id = s.project_id;
  delete from vessels where id = s.vessel_id;
  delete from demo_sessions where user_id = p_user_id;
end;
$$;

-- ─── The seed: S/Y Tessera, a fictional 32 m sloop in refit ──────────────────

create or replace function public.demo_create_sandbox(p_user_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  d date := current_date;
  t timestamptz := now();
  v_vessel uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_me uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_yard uuid := gen_random_uuid();
  v_class uuid := gen_random_uuid();
  v_captain uuid := gen_random_uuid();
  v_rigger uuid := gen_random_uuid();
  -- work packages
  wp_haul uuid := gen_random_uuid();
  wp_af uuid := gen_random_uuid();
  wp_keel uuid := gen_random_uuid();
  wp_engine uuid := gen_random_uuid();
  wp_shaft uuid := gen_random_uuid();
  wp_lith uuid := gen_random_uuid();
  wp_nav uuid := gen_random_uuid();
  wp_rig uuid := gen_random_uuid();
  wp_seacock uuid := gen_random_uuid();
  wp_int uuid := gen_random_uuid();
  wp_deck uuid := gen_random_uuid();
  wp_trials uuid := gen_random_uuid();
  -- inspections
  in_hull uuid := gen_random_uuid();
  in_seacock uuid := gen_random_uuid();
  in_chain uuid := gen_random_uuid();
  in_keel uuid := gen_random_uuid();
  in_shaft uuid := gen_random_uuid();
  in_torque uuid := gen_random_uuid();
  in_trials uuid := gen_random_uuid();
  -- defects, change orders, approvals
  ncr_keel uuid := gen_random_uuid();
  ncr_cutless uuid := gen_random_uuid();
  ncr_chain uuid := gen_random_uuid();
  ncr_exhaust uuid := gen_random_uuid();
  ncr_sole uuid := gen_random_uuid();
  co_keel uuid := gen_random_uuid();
  co_cutless uuid := gen_random_uuid();
  co_chain uuid := gen_random_uuid();
  co_lith uuid := gen_random_uuid();
  co_deck uuid := gen_random_uuid();
  ap_keel uuid := gen_random_uuid();
  ap_cutless uuid := gen_random_uuid();
  ap_chain uuid := gen_random_uuid();
  ap_lith uuid := gen_random_uuid();
  -- spaces and parts
  sp_er uuid := gen_random_uuid();
  sp_bilge uuid := gen_random_uuid();
  sp_laz uuid := gen_random_uuid();
  sp_saloon uuid := gen_random_uuid();
  sp_deck uuid := gen_random_uuid();
  pt_engine uuid := gen_random_uuid();
  pt_exhaust uuid := gen_random_uuid();
  pt_shaft uuid := gen_random_uuid();
  pt_cutless uuid := gen_random_uuid();
  pt_keel uuid := gen_random_uuid();
  pt_bolts uuid := gen_random_uuid();
  pt_mast uuid := gen_random_uuid();
  pt_chain uuid := gen_random_uuid();
  pt_batt uuid := gen_random_uuid();
  pt_sc1 uuid := gen_random_uuid();
  pt_sc2 uuid := gen_random_uuid();
  -- events used as cascade parents
  ev_keel uuid := gen_random_uuid();
  ev_cutless uuid := gen_random_uuid();
  ev_chain uuid := gen_random_uuid();
  ev_lith uuid := gen_random_uuid();
  v_recent integer;
begin
  if p_user_id is null or p_email is null or p_email not like '%@demo.yam.limited' then
    raise exception 'demo_create_sandbox: a demo user is required' using errcode = 'P0001';
  end if;
  select count(*) into v_recent from demo_sessions where created_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'The demo is busy right now. Try again in a few minutes.' using errcode = 'P0001';
  end if;

  perform set_config('yam.demo_seed', 'on', true);

  insert into vessels (id, name, hull_id, vessel_type, loa, beam, draft, gross_tonnage, flag_state,
                       class_society, class_number, year_built, build_yard)
  values (v_vessel, 'S/Y Tessera', 'DEMO-32-0001', 'Sailing sloop', 32.4, 7.1, 4.2, 162, 'Malta',
          'BV', 'BV-DEMO-0001', 2011, 'Fictional yard (demo)');

  insert into projects (id, vessel_id, name, project_type, phase, yard_name, yard_location,
                        planned_start, planned_delivery, actual_start, budget_locked, budget_spent,
                        budget_contingency, class_society, survey_due_date)
  values (v_project, v_vessel, 'Winter refit (demo)', 'REFIT', 'SYSTEMS', 'Demo Refit Yard', 'Olbia, Sardinia',
          d - 35, d + 49, d - 35, 1450000, 612400, 120000, 'BV', d + 44);

  insert into project_members (id, project_id, user_id, role, name, email, company, status, invited_at, first_seen_at, last_seen_at)
  values
    (v_me, v_project, p_user_id, 'OWNERS_REP', 'You (demo visitor)', lower(p_email), 'Owner''s representative', 'ACTIVE', t, t, t),
    (v_owner, v_project, null, 'OWNER', 'Elena Marsh', 'owner@example.com', 'Tessera Holdings (fictional)', 'ACTIVE', t - interval '40 days', t - interval '39 days', t - interval '1 day'),
    (v_yard, v_project, null, 'YARD_PM', 'Marco Ferri', 'yard.pm@example.com', 'Demo Refit Yard', 'ACTIVE', t - interval '40 days', t - interval '38 days', t - interval '3 hours'),
    (v_class, v_project, null, 'CLASS_SURVEYOR', 'Sofie Krag', 'surveyor@example.com', 'Class society (sample)', 'ACTIVE', t - interval '36 days', t - interval '33 days', t - interval '8 days'),
    (v_captain, v_project, null, 'CAPTAIN', 'Tom Hale', 'captain@example.com', 'S/Y Tessera', 'ACTIVE', t - interval '40 days', t - interval '40 days', t - interval '5 hours'),
    (v_rigger, v_project, null, 'SUBCONTRACTOR', 'Jonas Berg', 'rigger@example.com', 'North Rig Works (fictional)', 'ACTIVE', t - interval '32 days', t - interval '31 days', t - interval '2 days');

  -- Work packages: one critical path to sea trials, a few problems on it.
  insert into work_packages (id, project_id, wp_number, title, discipline, description, status,
                             planned_hours, actual_hours, planned_cost, actual_cost, trade_contractor,
                             planned_start, planned_end, actual_start, actual_end, is_class_item, class_society,
                             baseline_start, baseline_end)
  values
    (wp_haul, v_project, 'WP-HULL-001', 'Haul-out, pressure wash and hull survey', 'HULL',
     'Travel-lift haul-out, wash, blocking and out-of-water survey with class.', 'COMPLETE',
     60, 58, 18500, 18200, 'Demo Refit Yard', d - 35, d - 30, d - 35, d - 30, true, 'BV', d - 35, d - 30),
    (wp_seacock, v_project, 'WP-SAFE-001', 'Seacocks and through-hulls renewed', 'SAFETY',
     'All 14 below-waterline fittings renewed in DZR bronze, witnessed by class.', 'COMPLETE',
     90, 96, 26000, 27150, 'Demo Refit Yard', d - 30, d - 15, d - 30, d - 14, true, 'BV', d - 30, d - 15),
    (wp_keel, v_project, 'WP-STRUCT-001', 'Keel bolts: withdraw, inspect, renew', 'STRUCTURAL',
     'Withdraw two sample bolts; renew the set if either is beyond limits.', 'EXPANDED',
     120, 84, 32000, 21500, 'Demo Refit Yard', d - 28, d + 6, d - 28, null, true, 'BV', d - 28, d + 2),
    (wp_rig, v_project, 'WP-RIG-001', 'Mast unstepped, standing rigging renewed', 'RIGGING',
     '10-year rod rigging renewal, chainplate NDT, mast stripped and inspected.', 'ACTIVE',
     220, 140, 148000, 96000, 'North Rig Works (fictional)', d - 30, d + 15, d - 30, null, true, 'BV', d - 30, d + 15),
    (wp_engine, v_project, 'WP-MECH-001', 'Main engine 10,000 h overhaul', 'MECHANICAL',
     'Top-end overhaul, injectors, heat exchanger, exhaust elbow and mounts.', 'ACTIVE',
     160, 110, 54000, 38900, 'Demo Refit Yard', d - 25, d + 10, d - 24, null, false, null, d - 25, d + 10),
    (wp_shaft, v_project, 'WP-MECH-002', 'Shaft line, cutless bearing and propeller', 'MECHANICAL',
     'Draw shaft, measure, renew cutless bearing, balance and pitch the propeller.', 'ON_HOLD',
     40, 12, 9800, 3100, 'Demo Refit Yard', d - 10, d + 8, d - 10, null, false, null, d - 10, d + 4),
    (wp_af, v_project, 'WP-HULL-002', 'Antifouling and topsides fairing', 'HULL',
     'Two coats antifouling, topsides fair and paint touch-up to the boot top.', 'ACTIVE',
     180, 75, 62000, 21000, 'Demo Refit Yard', d - 20, d + 12, d - 19, null, false, null, d - 20, d + 12),
    (wp_lith, v_project, 'WP-ELEC-001', 'House bank renewal', 'ELECTRICAL',
     'Like-for-like AGM renewal. Owner has asked to price lithium instead (CO-2026-004).', 'SCOPED',
     80, 0, 21000, 0, 'Demo Refit Yard', d + 5, d + 25, null, null, false, null, d + 5, d + 25),
    (wp_nav, v_project, 'WP-ELEC-002', 'Navigation electronics upgrade', 'ELECTRICAL',
     'Chartplotters, radar and instruments; cabling reused where sound.', 'SCOPED',
     70, 0, 38000, 0, 'Demo Refit Yard', d + 12, d + 30, null, null, false, null, d + 12, d + 30),
    (wp_int, v_project, 'WP-INT-001', 'Saloon upholstery and teak sole', 'INTERIOR',
     'New upholstery; sole re-oiled, two boards to be assessed for delamination.', 'ACTIVE',
     140, 22, 44000, 6200, 'Demo Refit Yard', d - 5, d + 30, d - 4, null, false, null, d - 5, d + 30),
    (wp_deck, v_project, 'WP-PAINT-001', 'Deck hardware rebed', 'PAINT',
     'Rebed stanchion bases, cleats and hatches; reseal teak deck seams locally.', 'SCOPED',
     90, 0, 17500, 0, 'Demo Refit Yard', d + 15, d + 35, null, null, false, null, d + 15, d + 35),
    (wp_trials, v_project, 'WP-CLASS-001', 'Intermediate survey and sea trials', 'CLASS',
     'Class intermediate survey afloat, sea trials and owner acceptance.', 'SCOPED',
     40, 0, 12000, 0, 'Demo Refit Yard', d + 38, d + 47, null, null, true, 'BV', d + 38, d + 47);

  insert into work_package_dependencies (project_id, predecessor_id, successor_id, kind, lag_days, created_by_name)
  values
    (v_project, wp_haul, wp_af, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_haul, wp_seacock, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_haul, wp_keel, 'SS', 7, 'Marco Ferri'),
    (v_project, wp_lith, wp_nav, 'SS', 7, 'Marco Ferri'),
    (v_project, wp_keel, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_rig, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_engine, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_shaft, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_af, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_nav, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_int, wp_trials, 'FS', 0, 'Marco Ferri'),
    (v_project, wp_deck, wp_trials, 'FS', 0, 'Marco Ferri');

  insert into inspection_events (id, project_id, work_package_id, inspection_number, title, inspector_role, inspector_name,
                                 scheduled_date, actual_date, result, notes, is_class_inspection, defect_count)
  values
    (in_hull, v_project, wp_haul, 'INSP-HULL-001', 'Out-of-water hull survey', 'CLASS_SURVEYOR', 'Sofie Krag',
     d - 33, d - 33, 'PASS', 'Hull, rudder and appendages satisfactory. Keel bolt sampling requested.', true, 0),
    (in_seacock, v_project, wp_seacock, 'INSP-SAFE-001', 'Seacock renewal witness', 'CLASS_SURVEYOR', 'Sofie Krag',
     d - 16, d - 16, 'PASS', 'All 14 fittings witnessed and tested.', true, 0),
    (in_chain, v_project, wp_rig, 'INSP-RIG-001', 'Chainplate dye-penetrant test', 'SUBCONTRACTOR', 'Jonas Berg',
     d - 18, d - 18, 'CONDITIONAL_PASS', 'Crevice corrosion at the starboard cap shroud chainplate; repairable.', false, 1),
    (in_keel, v_project, wp_keel, 'INSP-STRUCT-001', 'Keel bolt withdrawal inspection', 'CLASS_SURVEYOR', 'Sofie Krag',
     d - 12, d - 12, 'FAIL', 'Bolt #4 necked by crevice corrosion at the hull-keel joint, beyond the 10% section limit.', true, 1),
    (in_shaft, v_project, wp_shaft, 'INSP-MECH-001', 'Shaft and cutless bearing measurement', 'YARD_PM', 'Marco Ferri',
     d - 8, d - 8, 'CONDITIONAL_PASS', 'Cutless bearing clearance 1.9 mm against 1.0 mm limit. Shaft straight.', false, 1),
    (in_torque, v_project, wp_keel, 'INSP-STRUCT-002', 'New keel bolts: torque witness', 'CLASS_SURVEYOR', 'Sofie Krag',
     d + 4, null, 'PENDING', null, true, 0),
    (in_trials, v_project, wp_trials, 'INSP-CLASS-001', 'Intermediate survey afloat and sea trials', 'CLASS_SURVEYOR', 'Sofie Krag',
     d + 44, null, 'PENDING', null, true, 0);

  insert into defect_records (id, project_id, inspection_event_id, work_package_id, ncr_number, title, description,
                              location_on_vessel, severity, status, root_cause, disposition, is_class_defect, class_item_ref,
                              discovered_by, discovered_date, closed_date, cost_impact, schedule_impact_days, change_order_id)
  values
    (ncr_keel, v_project, in_keel, wp_keel, 'NCR-2026-001', 'Keel bolt #4 corroded beyond section limit',
     'Crevice corrosion at the hull-keel joint has reduced bolt #4 by 14% of section. Class requires the full set renewed.',
     'Keel sump, frame 18', 'HIGH', 'PENDING_APPROVAL', 'CORROSION', 'REPLACE', true, 'BV hull 4.2',
     'Sofie Krag', d - 12, null, 14800, 4, null),
    (ncr_cutless, v_project, in_shaft, wp_shaft, 'NCR-2026-002', 'Cutless bearing worn beyond tolerance',
     'Clearance 1.9 mm against a 1.0 mm limit. Bearing and shaft seal to be renewed.',
     'Stern tube', 'MEDIUM', 'IN_PROGRESS', 'WEAR', 'REPLACE', false, null,
     'Marco Ferri', d - 8, null, 3900, 2, null),
    (ncr_chain, v_project, in_chain, wp_rig, 'NCR-2026-003', 'Starboard cap shroud chainplate: crevice corrosion',
     'Pitting under the deck collar. Cleaned, weld-repaired and re-tested.',
     'Starboard chainplate, deck level', 'HIGH', 'CLOSED', 'CORROSION', 'REPAIR', false, null,
     'Jonas Berg', d - 18, d - 6, 6200, 3, null),
    (ncr_exhaust, v_project, null, wp_engine, 'NCR-2026-004', 'Exhaust elbow cracked at the weld',
     'Found at strip-down. Hairline crack at the injection point weld.',
     'Engine room', 'MEDIUM', 'OPEN', 'FATIGUE', 'REPLACE', false, null,
     'Marco Ferri', d - 3, null, 2100, 0, null),
    (ncr_sole, v_project, null, wp_int, 'NCR-2026-005', 'Saloon teak sole: two boards delaminating',
     'Moisture under two boards by the companionway. Monitor until the deck leak is traced.',
     'Saloon, companionway', 'LOW', 'OPEN', 'MOISTURE_INGRESS', 'MONITOR', false, null,
     'Tom Hale', d - 2, null, 0, 0, null);

  insert into change_orders (id, project_id, co_number, title, description, trigger_type, status, cost_delta,
                             schedule_delta_days, raised_by, raised_date, defect_record_id, approval_id)
  values
    (co_chain, v_project, 'CO-2026-001', 'Chainplate weld repair and re-test', 'From NCR-2026-003.', 'DEFECT_DISCOVERY', 'IMPLEMENTED',
     6200, 3, 'Jonas Berg', d - 17, ncr_chain, null),
    (co_keel, v_project, 'CO-2026-002', 'Renew all 9 keel bolts', 'From NCR-2026-001. Class requires the full set; bolts in 316L.', 'CLASS_REQUIREMENT', 'PENDING_APPROVAL',
     14800, 4, 'Marco Ferri', d - 11, ncr_keel, null),
    (co_cutless, v_project, 'CO-2026-003', 'Cutless bearing and shaft seal renewal', 'From NCR-2026-002.', 'DEFECT_DISCOVERY', 'APPROVED',
     3900, 2, 'Marco Ferri', d - 7, ncr_cutless, null),
    (co_lith, v_project, 'CO-2026-004', 'House bank: lithium instead of AGM', 'Owner request. 900 Ah LiFePO4 with new chargers and BMS integration.', 'OWNER_REQUEST', 'PENDING_APPROVAL',
     38500, 6, 'Elena Marsh', d - 4, null, null),
    (co_deck, v_project, 'CO-2026-005', 'Winch bases added to the rebed scope', 'Found while surveying the deck hardware.', 'SCOPE_GROWTH', 'DRAFT',
     4200, 2, 'Marco Ferri', d - 1, null, null);

  insert into owner_approvals (id, project_id, approval_number, title, description, tier, status, requested_by,
                               requested_date, approver_name, decision_date, decision_notes, change_order_id, cost_amount, deadline)
  values
    (ap_chain, v_project, 'APPR-2026-001', 'Approve CO-2026-001 chainplate repair', null, 'TIER_1', 'APPROVED', 'Marco Ferri',
     d - 17, 'You (demo visitor)', d - 16, 'Approved. Re-test witnessed before the mast goes back.', co_chain, 6200, d - 14),
    (ap_keel, v_project, 'APPR-2026-002', 'Approve CO-2026-002 keel bolt renewal', 'Class requirement; blocks sea trials.', 'TIER_2', 'PENDING', 'Marco Ferri',
     d - 11, null, null, null, co_keel, 14800, d + 2),
    (ap_cutless, v_project, 'APPR-2026-003', 'Approve CO-2026-003 cutless bearing', null, 'TIER_1', 'APPROVED', 'Marco Ferri',
     d - 7, 'You (demo visitor)', d - 6, null, co_cutless, 3900, d - 5),
    (ap_lith, v_project, 'APPR-2026-004', 'Approve CO-2026-004 lithium house bank', 'Owner request above the Tier 2 limit.', 'TIER_3', 'PENDING', 'Elena Marsh',
     d - 4, null, null, null, co_lith, 38500, d + 6);

  -- NCRs, change orders and approvals point at each other; close the loop.
  update defect_records set change_order_id = case id
      when ncr_keel then co_keel when ncr_cutless then co_cutless when ncr_chain then co_chain end
   where id in (ncr_keel, ncr_cutless, ncr_chain);
  update change_orders set approval_id = case id
      when co_chain then ap_chain when co_keel then ap_keel when co_cutless then ap_cutless when co_lith then ap_lith end
   where id in (co_chain, co_keel, co_cutless, co_lith);

  -- The record of how it got here.
  insert into world_model_events (id, project_id, event_type, object_type, object_id, before_state, after_state,
                                  triggered_by, triggered_by_name, triggered_at, cascade_from_event_id)
  values
    (gen_random_uuid(), v_project, 'PROJECT_CREATED', 'PROJECT', v_project, null,
     jsonb_build_object('name', 'Winter refit (demo)', 'project_type', 'REFIT'), null, 'You (demo visitor)', t - interval '40 days', null),
    (gen_random_uuid(), v_project, 'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', wp_haul,
     '{"status":"ACTIVE"}', '{"status":"COMPLETE","wp_number":"WP-HULL-001"}', null, 'Marco Ferri', t - interval '30 days', null),
    (gen_random_uuid(), v_project, 'INSPECTION_COMPLETED', 'INSPECTION_EVENT', in_hull, null,
     '{"result":"PASS","inspection_number":"INSP-HULL-001"}', null, 'Sofie Krag', t - interval '33 days', null),
    (ev_chain, v_project, 'DEFECT_RAISED', 'DEFECT_RECORD', ncr_chain, null,
     '{"ncr_number":"NCR-2026-003","title":"Starboard cap shroud chainplate: crevice corrosion","severity":"HIGH","status":"OPEN","cost_impact":6200}',
     null, 'Jonas Berg', t - interval '18 days', null),
    (gen_random_uuid(), v_project, 'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', co_chain, null,
     '{"co_number":"CO-2026-001","status":"PENDING_APPROVAL","cost_delta":6200,"trigger_type":"DEFECT_DISCOVERY","schedule_delta_days":3}',
     null, 'Jonas Berg', t - interval '17 days', ev_chain),
    (gen_random_uuid(), v_project, 'APPROVAL_DECISION', 'OWNER_APPROVAL', ap_chain, '{"status":"PENDING"}',
     '{"status":"APPROVED","approval_number":"APPR-2026-001"}', null, 'You (demo visitor)', t - interval '16 days', null),
    (gen_random_uuid(), v_project, 'INSPECTION_COMPLETED', 'INSPECTION_EVENT', in_seacock, null,
     '{"result":"PASS","inspection_number":"INSP-SAFE-001"}', null, 'Sofie Krag', t - interval '16 days', null),
    (gen_random_uuid(), v_project, 'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', wp_seacock,
     '{"status":"ACTIVE"}', '{"status":"COMPLETE","wp_number":"WP-SAFE-001"}', null, 'Marco Ferri', t - interval '14 days', null),
    (gen_random_uuid(), v_project, 'INSPECTION_COMPLETED', 'INSPECTION_EVENT', in_keel, null,
     '{"result":"FAIL","inspection_number":"INSP-STRUCT-001"}', null, 'Sofie Krag', t - interval '12 days', null),
    (ev_keel, v_project, 'DEFECT_RAISED', 'DEFECT_RECORD', ncr_keel, null,
     '{"ncr_number":"NCR-2026-001","title":"Keel bolt #4 corroded beyond section limit","severity":"HIGH","status":"PENDING_APPROVAL","cost_impact":14800}',
     null, 'Sofie Krag', t - interval '12 days', null),
    (gen_random_uuid(), v_project, 'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', co_keel, null,
     '{"co_number":"CO-2026-002","status":"PENDING_APPROVAL","cost_delta":14800,"trigger_type":"CLASS_REQUIREMENT","schedule_delta_days":4}',
     null, 'Marco Ferri', t - interval '11 days', ev_keel),
    (gen_random_uuid(), v_project, 'APPROVAL_REQUESTED', 'OWNER_APPROVAL', ap_keel, null,
     '{"approval_number":"APPR-2026-002","tier":"TIER_2","cost_amount":14800}', null, 'Marco Ferri', t - interval '11 days', ev_keel),
    (gen_random_uuid(), v_project, 'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', wp_keel,
     '{"status":"ACTIVE"}', '{"status":"EXPANDED","wp_number":"WP-STRUCT-001"}', null, 'Marco Ferri', t - interval '11 days', ev_keel),
    (gen_random_uuid(), v_project, 'INSPECTION_COMPLETED', 'INSPECTION_EVENT', in_shaft, null,
     '{"result":"CONDITIONAL_PASS","inspection_number":"INSP-MECH-001"}', null, 'Marco Ferri', t - interval '8 days', null),
    (ev_cutless, v_project, 'DEFECT_RAISED', 'DEFECT_RECORD', ncr_cutless, null,
     '{"ncr_number":"NCR-2026-002","title":"Cutless bearing worn beyond tolerance","severity":"MEDIUM","status":"OPEN","cost_impact":3900}',
     null, 'Marco Ferri', t - interval '8 days', null),
    (gen_random_uuid(), v_project, 'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', co_cutless, null,
     '{"co_number":"CO-2026-003","status":"PENDING_APPROVAL","cost_delta":3900,"trigger_type":"DEFECT_DISCOVERY","schedule_delta_days":2}',
     null, 'Marco Ferri', t - interval '7 days', ev_cutless),
    (gen_random_uuid(), v_project, 'APPROVAL_DECISION', 'OWNER_APPROVAL', ap_cutless, '{"status":"PENDING"}',
     '{"status":"APPROVED","approval_number":"APPR-2026-003"}', null, 'You (demo visitor)', t - interval '6 days', null),
    (gen_random_uuid(), v_project, 'DEFECT_STATUS_CHANGED', 'DEFECT_RECORD', ncr_chain, '{"status":"IN_PROGRESS"}',
     '{"status":"CLOSED","ncr_number":"NCR-2026-003"}', null, 'Jonas Berg', t - interval '6 days', null),
    (gen_random_uuid(), v_project, 'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', wp_shaft,
     '{"status":"ACTIVE"}', '{"status":"ON_HOLD","wp_number":"WP-MECH-002"}', null, 'Marco Ferri', t - interval '5 days', null),
    (ev_lith, v_project, 'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', co_lith, null,
     '{"co_number":"CO-2026-004","status":"PENDING_APPROVAL","cost_delta":38500,"trigger_type":"OWNER_REQUEST","schedule_delta_days":6}',
     null, 'Elena Marsh', t - interval '4 days', null),
    (gen_random_uuid(), v_project, 'APPROVAL_REQUESTED', 'OWNER_APPROVAL', ap_lith, null,
     '{"approval_number":"APPR-2026-004","tier":"TIER_3","cost_amount":38500}', null, 'Elena Marsh', t - interval '4 days', ev_lith),
    (gen_random_uuid(), v_project, 'DEFECT_RAISED', 'DEFECT_RECORD', ncr_exhaust, null,
     '{"ncr_number":"NCR-2026-004","title":"Exhaust elbow cracked at the weld","severity":"MEDIUM","status":"OPEN","cost_impact":2100}',
     null, 'Marco Ferri', t - interval '3 days', null),
    (gen_random_uuid(), v_project, 'DEFECT_RAISED', 'DEFECT_RECORD', ncr_sole, null,
     '{"ncr_number":"NCR-2026-005","title":"Saloon teak sole: two boards delaminating","severity":"LOW","status":"OPEN","cost_impact":0}',
     null, 'Tom Hale', t - interval '2 days', null);

  -- Conversation on the records.
  insert into messages (project_id, body, kind, source, author_id, author_name, author_role, linked_object_type, linked_object_id, created_at)
  values
    (v_project, 'Bolt #4 is necked right at the joint. I will not sign the hull off with one renewed: the full set, please.',
     'NOTE', 'APP', null, 'Sofie Krag', 'CLASS_SURVEYOR', 'DEFECT_RECORD', ncr_keel, t - interval '12 days'),
    (v_project, '316L bolts are 9 working days from the supplier. If the approval lands by Friday we keep the torque witness on the 4th.',
     'NOTE', 'APP', null, 'Marco Ferri', 'YARD_PM', 'CHANGE_ORDER', co_keel, t - interval '10 days'),
    (v_project, 'Shaft work stopped until the bearing arrives; the yard has moved the team to the antifouling.',
     'NOTE', 'APP', null, 'Marco Ferri', 'YARD_PM', 'WORK_PACKAGE', wp_shaft, t - interval '5 days'),
    (v_project, 'Please price lithium properly, chargers and BMS included. I would rather do it now than in two years.',
     'DECISION', 'APP', null, 'Elena Marsh', 'OWNER', 'CHANGE_ORDER', co_lith, t - interval '4 days'),
    (v_project, 'Yard fitted two extra bilge pump float switches while the sole was up. Not in the spec; worth recording.',
     'UNPLANNED_WORK', 'APP', null, 'Tom Hale', 'CAPTAIN', 'WORK_PACKAGE', wp_int, t - interval '1 day');

  -- What the agent had to say (written ahead so the visit costs nothing).
  insert into agent_notes (project_id, kind, audience, title, body, object_type, object_id, object_number, suggestion, created_at)
  values
    (v_project, 'BRIEF', 'ALL', 'Morning brief',
     'Two decisions are waiting on you. APPR-2026-002 (keel bolts, €14,800, Tier 2) is due in 2 days and sits on the critical path: without it the torque witness slips and sea trials move with it. APPR-2026-004 (lithium bank, €38,500, Tier 3) is due in 6 days. WP-MECH-002 has been on hold for 5 days waiting for the cutless bearing. WP-STRUCT-001 is 4 days behind its baseline; sea trials have no float, so the next slip there moves delivery.',
     'PROJECT', v_project, null, 'Decide APPR-2026-002 today.', t - interval '6 hours'),
    (v_project, 'NOTICE', 'ALL', 'Keel bolt renewal is now on the critical path',
     'NCR-2026-001 failed the class inspection and CO-2026-002 adds 4 days to WP-STRUCT-001, which feeds the intermediate survey. The approval has been open 11 days.',
     'DEFECT_RECORD', ncr_keel, 'NCR-2026-001', 'Approve or reject APPR-2026-002.', t - interval '11 days');

  -- The boat's parts, where they are, and what the work touches.
  insert into spaces (id, vessel_id, name, created_by_name) values
    (sp_er, v_vessel, 'Engine room', 'Tom Hale'),
    (sp_bilge, v_vessel, 'Keel sump', 'Tom Hale'),
    (sp_laz, v_vessel, 'Lazarette', 'Tom Hale'),
    (sp_saloon, v_vessel, 'Saloon', 'Tom Hale'),
    (sp_deck, v_vessel, 'Deck', 'Tom Hale');

  insert into parts (id, vessel_id, parent_id, name, category, location, manufacturer, model, kind, space_id, safety_critical, created_by_name)
  values
    (pt_engine, v_vessel, null, 'Main engine', 'MECHANICAL', 'Engine room', 'Sample Marine', 'M6-260 (fictional)', 'ASSEMBLY', sp_er, false, 'Tom Hale'),
    (pt_exhaust, v_vessel, pt_engine, 'Exhaust elbow', 'MECHANICAL', 'Engine room', null, null, 'COMPONENT', sp_er, false, 'Tom Hale'),
    (pt_shaft, v_vessel, null, 'Propeller shaft line', 'MECHANICAL', 'Stern tube', null, null, 'ASSEMBLY', sp_laz, false, 'Tom Hale'),
    (pt_cutless, v_vessel, pt_shaft, 'Cutless bearing', 'MECHANICAL', 'Stern tube', null, null, 'COMPONENT', sp_laz, false, 'Tom Hale'),
    (pt_keel, v_vessel, null, 'Keel', 'STRUCTURAL', 'Keel sump', null, null, 'ASSEMBLY', sp_bilge, true, 'Tom Hale'),
    (pt_bolts, v_vessel, pt_keel, 'Keel bolts (9)', 'STRUCTURAL', 'Keel sump, frames 14-22', null, null, 'COMPONENT', sp_bilge, true, 'Tom Hale'),
    (pt_mast, v_vessel, null, 'Mast and standing rigging', 'RIGGING', 'Deck', null, null, 'ASSEMBLY', sp_deck, true, 'Tom Hale'),
    (pt_chain, v_vessel, pt_mast, 'Starboard cap shroud chainplate', 'RIGGING', 'Deck, starboard', null, null, 'COMPONENT', sp_deck, true, 'Tom Hale'),
    (pt_batt, v_vessel, null, 'House battery bank', 'ELECTRICAL', 'Saloon, under the settee', null, 'AGM 24 V 720 Ah', 'ASSEMBLY', sp_saloon, false, 'Tom Hale'),
    (pt_sc1, v_vessel, null, 'Engine raw-water seacock', 'SAFETY', 'Engine room', null, 'DZR bronze 1 1/2"', 'COMPONENT', sp_er, true, 'Tom Hale'),
    (pt_sc2, v_vessel, null, 'Galley sink seacock', 'SAFETY', 'Galley', null, 'DZR bronze 1"', 'COMPONENT', sp_saloon, true, 'Tom Hale');

  insert into part_links (part_id, project_id, object_type, object_id, created_by_name) values
    (pt_bolts, v_project, 'WORK_PACKAGE', wp_keel, 'Marco Ferri'),
    (pt_bolts, v_project, 'DEFECT_RECORD', ncr_keel, 'Sofie Krag'),
    (pt_cutless, v_project, 'WORK_PACKAGE', wp_shaft, 'Marco Ferri'),
    (pt_cutless, v_project, 'DEFECT_RECORD', ncr_cutless, 'Marco Ferri'),
    (pt_chain, v_project, 'DEFECT_RECORD', ncr_chain, 'Jonas Berg'),
    (pt_mast, v_project, 'WORK_PACKAGE', wp_rig, 'Jonas Berg'),
    (pt_engine, v_project, 'WORK_PACKAGE', wp_engine, 'Marco Ferri'),
    (pt_exhaust, v_project, 'DEFECT_RECORD', ncr_exhaust, 'Marco Ferri'),
    (pt_batt, v_project, 'WORK_PACKAGE', wp_lith, 'Marco Ferri'),
    (pt_batt, v_project, 'CHANGE_ORDER', co_lith, 'Elena Marsh'),
    (pt_sc1, v_project, 'WORK_PACKAGE', wp_seacock, 'Marco Ferri'),
    (pt_sc2, v_project, 'WORK_PACKAGE', wp_seacock, 'Marco Ferri');

  insert into demo_sessions (user_id, email, project_id, vessel_id)
  values (p_user_id, lower(p_email), v_project, v_vessel);

  perform set_config('yam.demo_seed', 'off', true);
  return v_project;
end;
$$;

-- Only the demo-session function (service role) seeds and purges.
revoke all on function public.demo_create_sandbox(uuid, text) from public, anon, authenticated;
revoke all on function public.demo_purge(uuid) from public, anon, authenticated;
grant execute on function public.demo_create_sandbox(uuid, text) to service_role;
grant execute on function public.demo_purge(uuid) to service_role;
revoke all on function public.demo_take_agent_turn() from public, anon;
grant execute on function public.demo_take_agent_turn() to authenticated, service_role;
revoke all on function public.assert_not_demo(text) from public, anon;
grant execute on function public.assert_not_demo(text) to authenticated, service_role;
grant execute on function public.is_demo_user() to authenticated, service_role;

-- The morning brief is a model call per project. Run it per project and skip
-- demo sandboxes, so a busy day of visitors does not become a busy morning of
-- briefs nobody reads. (Applied with cron.schedule, which updates the job.)
select cron.schedule('agent-watch-morning', '30 5 * * *',
  $cron$select public.agent_watch_call(jsonb_build_object('mode', 'morning', 'project_id', p.id))
          from public.projects p
         where not exists (select 1 from public.demo_sessions d where d.project_id = p.id)$cron$);
