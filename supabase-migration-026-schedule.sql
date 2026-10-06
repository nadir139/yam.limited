-- =============================================================================
-- YAM Migration 026 — THE PLAN HAS A SHAPE IN TIME
--
-- Applied to the live project as `schedule`.
--
-- Work packages had planned and actual dates and nothing else: no order between
-- them, no record of what was originally agreed, and the only way to move one
-- was action_update_work_package, whose event recorded status and cost but not
-- the dates it changed. A Gantt drawn from that could show bars, but not why a
-- bar moved, what it waits on, or how far the plan has drifted.
--
-- 1. Dependencies. "The cars before the mainsail is re-divided" is a fact about
--    the work, so it is a row: predecessor, successor, finish-to-start or
--    start-to-start, and a lag in days. Removing one is recorded, not deleted,
--    like everything else here.
--
-- 2. The baseline. baseline_start/baseline_end freeze the plan as agreed, so
--    slip is measured against a commitment rather than against whatever the
--    dates say today.
--
-- 3. Rescheduling is its own Action, and its event carries the dates before and
--    after plus the reason. Dragging a bar on the chart is a change to the
--    world model like any other, and should read like one in the history.
--
-- The forecast itself (what slips when a predecessor or a change order moves)
-- is derived, not stored: it is computed from these rows by the client and by
-- the agent with the same function, supabase/functions/agent/schedule.ts.
-- =============================================================================

-- 1. Baseline -----------------------------------------------------------------
alter table public.work_packages add column if not exists baseline_start date;
alter table public.work_packages add column if not exists baseline_end date;

-- 2. Dependencies ---------------------------------------------------------------
create table if not exists public.work_package_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  predecessor_id uuid not null references public.work_packages(id),
  successor_id uuid not null references public.work_packages(id),
  kind text not null default 'FS' check (kind in ('FS', 'SS')),
  lag_days integer not null default 0 check (lag_days between -365 and 365),
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text,
  check (predecessor_id <> successor_id)
);

-- One live link per pair; a removed one may be re-added later.
create unique index if not exists work_package_dependencies_live_pair
  on public.work_package_dependencies (predecessor_id, successor_id)
  where removed_at is null;
create index if not exists work_package_dependencies_project_idx
  on public.work_package_dependencies (project_id);
create index if not exists work_package_dependencies_successor_idx
  on public.work_package_dependencies (successor_id);

alter table public.work_package_dependencies enable row level security;
create policy work_package_dependencies_read on public.work_package_dependencies
  for select using (is_project_member(project_id));

revoke all on public.work_package_dependencies from anon, authenticated;
grant select on public.work_package_dependencies to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'work_package_dependencies'
  ) then
    alter publication supabase_realtime add table public.work_package_dependencies;
  end if;
end $$;

-- 3. Actions --------------------------------------------------------------------

-- Moves a work package in time. Either date may be omitted to keep it.
create or replace function public.action_reschedule_work_package(
  p_work_package_id uuid,
  p_planned_start date default null,
  p_planned_end date default null,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before work_packages;
  v_after work_packages;
  v_start date;
  v_end date;
begin
  perform require_permission_for_object('action_reschedule_work_package', 'WORK_PACKAGE', p_work_package_id);

  select * into v_before from work_packages where id = p_work_package_id;
  if not found then
    raise exception 'Work package does not exist' using errcode = 'P0001';
  end if;
  if p_planned_start is null and p_planned_end is null then
    raise exception 'Give a new start, a new end, or both' using errcode = 'P0001';
  end if;

  v_start := coalesce(p_planned_start, v_before.planned_start);
  v_end := coalesce(p_planned_end, v_before.planned_end);
  -- A package given only one date is a one-day package until told otherwise.
  v_start := coalesce(v_start, v_end);
  v_end := coalesce(v_end, v_start);

  if v_end < v_start then
    raise exception 'Planned end (%) cannot be before planned start (%)', v_end, v_start
      using errcode = 'P0001';
  end if;

  update work_packages
     set planned_start = v_start, planned_end = v_end
   where id = p_work_package_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'WORK_PACKAGE_RESCHEDULED', 'WORK_PACKAGE', v_after.id,
    jsonb_build_object('planned_start', v_before.planned_start, 'planned_end', v_before.planned_end),
    jsonb_build_object('planned_start', v_after.planned_start, 'planned_end', v_after.planned_end,
                       'reason', nullif(trim(coalesce(p_reason, '')), '')),
    v_actor_id, v_actor_name
  );

  return json_build_object('work_package', row_to_json(v_after));
end;
$$;

-- Says that one package waits on another. Re-linking an existing pair updates
-- its kind and lag. Refuses anything that would make the plan circular.
create or replace function public.action_link_work_packages(
  p_predecessor_id uuid,
  p_successor_id uuid,
  p_kind text default 'FS',
  p_lag_days integer default 0
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_pred work_packages;
  v_succ work_packages;
  v_kind text := upper(coalesce(nullif(trim(p_kind), ''), 'FS'));
  v_lag integer := coalesce(p_lag_days, 0);
  v_dep work_package_dependencies;
  v_cycle boolean;
begin
  perform require_permission_for_object('action_link_work_packages', 'WORK_PACKAGE', p_successor_id);

  select * into v_pred from work_packages where id = p_predecessor_id;
  select * into v_succ from work_packages where id = p_successor_id;
  if v_pred.id is null or v_succ.id is null then
    raise exception 'Both work packages must exist' using errcode = 'P0001';
  end if;
  if v_pred.project_id <> v_succ.project_id then
    raise exception 'Work packages are on different projects' using errcode = 'P0001';
  end if;
  if v_pred.id = v_succ.id then
    raise exception 'A work package cannot depend on itself' using errcode = 'P0001';
  end if;
  if v_kind not in ('FS', 'SS') then
    raise exception 'Unknown dependency kind: % (use FS or SS)', p_kind using errcode = 'P0001';
  end if;
  if v_lag not between -365 and 365 then
    raise exception 'Lag must be within a year either way' using errcode = 'P0001';
  end if;

  -- Would the successor already lead back to the predecessor?
  with recursive downstream(id) as (
    select successor_id from work_package_dependencies
     where predecessor_id = v_succ.id and removed_at is null
    union
    select d.successor_id from work_package_dependencies d
      join downstream ds on d.predecessor_id = ds.id
     where d.removed_at is null
  )
  select exists (select 1 from downstream where id = v_pred.id) into v_cycle;
  if v_cycle then
    raise exception '% already depends on % — linking them this way would make the plan circular',
      v_pred.wp_number, v_succ.wp_number using errcode = 'P0001';
  end if;

  update work_package_dependencies
     set kind = v_kind, lag_days = v_lag
   where predecessor_id = v_pred.id and successor_id = v_succ.id and removed_at is null
  returning * into v_dep;

  if v_dep.id is null then
    insert into work_package_dependencies (
      project_id, predecessor_id, successor_id, kind, lag_days, created_by, created_by_name
    ) values (
      v_succ.project_id, v_pred.id, v_succ.id, v_kind, v_lag, v_actor_id, v_actor_name
    ) returning * into v_dep;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_succ.project_id, 'DEPENDENCY_LINKED', 'WORK_PACKAGE', v_succ.id,
    null,
    jsonb_build_object('predecessor', v_pred.wp_number, 'successor', v_succ.wp_number,
                       'kind', v_kind, 'lag_days', v_lag),
    v_actor_id, v_actor_name
  );

  return json_build_object('dependency', row_to_json(v_dep));
end;
$$;

-- Removes a dependency. The row stays, marked removed, with who and why.
create or replace function public.action_unlink_work_packages(
  p_predecessor_id uuid,
  p_successor_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_dep work_package_dependencies;
  v_pred_no text;
  v_succ_no text;
begin
  perform require_permission_for_object('action_link_work_packages', 'WORK_PACKAGE', p_successor_id);

  update work_package_dependencies
     set removed_at = now(), removed_by_name = v_actor_name,
         removed_reason = nullif(trim(coalesce(p_reason, '')), '')
   where predecessor_id = p_predecessor_id and successor_id = p_successor_id
     and removed_at is null
  returning * into v_dep;

  if v_dep.id is null then
    raise exception 'There is no such dependency' using errcode = 'P0001';
  end if;

  select wp_number into v_pred_no from work_packages where id = p_predecessor_id;
  select wp_number into v_succ_no from work_packages where id = p_successor_id;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_dep.project_id, 'DEPENDENCY_REMOVED', 'WORK_PACKAGE', p_successor_id,
    jsonb_build_object('predecessor', v_pred_no, 'successor', v_succ_no,
                       'kind', v_dep.kind, 'lag_days', v_dep.lag_days),
    jsonb_build_object('reason', v_dep.removed_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('dependency', row_to_json(v_dep));
end;
$$;

-- Freezes the current plan as the baseline that slip is measured against.
create or replace function public.action_set_schedule_baseline(
  p_project_id uuid default null,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_count integer;
begin
  perform require_permission('action_set_schedule_baseline', v_project_id);

  update work_packages
     set baseline_start = planned_start, baseline_end = planned_end
   where project_id = v_project_id
     and planned_start is not null and planned_end is not null;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'No work package has planned dates yet — schedule some before setting a baseline'
      using errcode = 'P0001';
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SCHEDULE_BASELINED', 'PROJECT', v_project_id,
    null,
    jsonb_build_object('work_packages', v_count,
                       'reason', nullif(trim(coalesce(p_reason, '')), '')),
    v_actor_id, v_actor_name
  );

  return json_build_object('baselined', v_count);
end;
$$;

revoke all on function public.action_reschedule_work_package(uuid, date, date, text) from anon, public;
revoke all on function public.action_link_work_packages(uuid, uuid, text, integer) from anon, public;
revoke all on function public.action_unlink_work_packages(uuid, uuid, text) from anon, public;
revoke all on function public.action_set_schedule_baseline(uuid, text) from anon, public;
grant execute on function public.action_reschedule_work_package(uuid, date, date, text) to authenticated;
grant execute on function public.action_link_work_packages(uuid, uuid, text, integer) to authenticated;
grant execute on function public.action_unlink_work_packages(uuid, uuid, text) to authenticated;
grant execute on function public.action_set_schedule_baseline(uuid, text) to authenticated;

-- 4. Permissions: whoever may plan the work may sequence it; the baseline is
--    a commitment, so it belongs to the owner's side.
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_reschedule_work_package', 'OWNERS_REP'),
    ('action_reschedule_work_package', 'YARD_PM'),
    ('action_reschedule_work_package', 'NAVAL_ARCHITECT'),
    ('action_link_work_packages', 'OWNERS_REP'),
    ('action_link_work_packages', 'YARD_PM'),
    ('action_link_work_packages', 'NAVAL_ARCHITECT'),
    ('action_set_schedule_baseline', 'OWNERS_REP')
  ) as v(k, r)
on conflict do nothing;

-- 5. Registry, so the agent can plan as well as read.
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_reschedule_work_package',
  'Reschedule work package',
  'Sets a work package''s planned start and/or end date. An omitted date keeps its value; a package given only one date becomes a one-day package. The previous dates and the reason are recorded. Use this for every change to planned dates.',
  'WORK_PACKAGE',
  jsonb_build_array(
    jsonb_build_object('name', 'p_work_package_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_planned_start', 'type', 'date'),
    jsonb_build_object('name', 'p_planned_end', 'type', 'date'),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
),
(
  'action_link_work_packages',
  'Link work packages',
  'Records that one work package waits on another. FS (default): the successor starts after the predecessor finishes. SS: they start together. lag_days adds (or with a negative value, overlaps) days. Refuses links that would make the plan circular. Linking an existing pair updates its kind and lag.',
  'WORK_PACKAGE',
  jsonb_build_array(
    jsonb_build_object('name', 'p_predecessor_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_successor_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_kind', 'type', 'enum', 'values', jsonb_build_array('FS', 'SS')),
    jsonb_build_object('name', 'p_lag_days', 'type', 'integer')
  ),
  '{}', true
),
(
  'action_unlink_work_packages',
  'Remove dependency',
  'Removes a dependency between two work packages. The link is kept in the record as removed, with the reason.',
  'WORK_PACKAGE',
  jsonb_build_array(
    jsonb_build_object('name', 'p_predecessor_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_successor_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
),
(
  'action_set_schedule_baseline',
  'Set schedule baseline',
  'Freezes the current planned dates of every scheduled work package as the baseline that slip is measured against. Only do this when someone says the plan is agreed; it replaces any earlier baseline.',
  'PROJECT',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  target_type = excluded.target_type,
  parameters = excluded.parameters,
  is_agent_usable = excluded.is_agent_usable;
