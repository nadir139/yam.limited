-- =============================================================================
-- YAM Migration 011 — PLANNING THE WORK
--
-- Applied to the live project as migration `work_package_actions`.
--
-- The write path was lopsided. You could record what went wrong (raise an NCR,
-- record an inspection result, decide an approval) but you could not plan the
-- work: nothing created a work package, and nothing created an inspection. The
-- job list could only be seeded, never grown, which made the system a defect
-- tracker bolted to a fixed scope rather than a model of the project.
--
-- Four Actions close that:
--   action_create_work_package        — add scope
--   action_update_work_package        — progress it, book actuals against it
--   action_schedule_inspection        — book an attendance before it happens
--   action_link_defect_to_work_package — attach a finding to the scope it hits
--
-- Same contract as 006/007: SECURITY DEFINER, search_path pinned, actor stamped
-- from auth.uid(), audit event written in the same transaction as the mutation.
-- =============================================================================

-- ─── Shared: the numbering convention ────────────────────────────────────────
--
-- Existing numbers are WP-STRUCT-001 / INSP-HULL-003 — a prefix, a discipline
-- abbreviation, then a sequence. The seed is not perfectly consistent about it
-- (WP-HULL-002 is a STRUCTURAL package), so the sequence is taken from the
-- highest suffix sharing the same prefix rather than per discipline. Numbering
-- follows the numbers that exist, not the category they ought to belong to.

create or replace function discipline_abbrev(p_discipline discipline)
returns text language sql immutable
as $$
  select case p_discipline
    when 'STRUCTURAL' then 'STRUCT'
    when 'MECHANICAL' then 'MECH'
    when 'ELECTRICAL' then 'ELEC'
    when 'RIGGING'    then 'RIG'
    when 'INTERIOR'   then 'INT'
    when 'SAFETY'     then 'SAFE'
    else p_discipline::text          -- HULL, PAINT, CLASS are already short
  end;
$$;

comment on function discipline_abbrev(discipline) is
  'The short form used inside WP-/INSP- numbers, matching the seeded data.';

-- ─── Action: create a work package ───────────────────────────────────────────

create or replace function action_create_work_package(
  p_title text,
  p_discipline text,
  p_description text default null,
  p_planned_hours numeric default null,
  p_planned_cost numeric default null,
  p_trade_contractor text default null,
  p_planned_start date default null,
  p_planned_end date default null,
  p_is_class_item boolean default false,
  p_class_item_ref text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_project_id uuid;
  v_discipline discipline;
  v_prefix text;
  v_seq int;
  v_wp_number text;
  v_wp work_packages;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title is required' using errcode = 'P0001';
  end if;

  begin
    v_discipline := p_discipline::discipline;
  exception when invalid_text_representation then
    raise exception 'Unknown discipline: %', p_discipline using errcode = 'P0001';
  end;

  if p_planned_hours is not null and p_planned_hours < 0 then
    raise exception 'Planned hours cannot be negative' using errcode = 'P0001';
  end if;
  if p_planned_cost is not null and p_planned_cost < 0 then
    raise exception 'Planned cost cannot be negative' using errcode = 'P0001';
  end if;
  if p_planned_start is not null and p_planned_end is not null
     and p_planned_end < p_planned_start then
    raise exception 'Planned end cannot be before planned start' using errcode = 'P0001';
  end if;

  select id into v_project_id from projects order by created_at limit 1;
  if v_project_id is null then
    raise exception 'No project exists' using errcode = 'P0001';
  end if;

  v_prefix := 'WP-' || discipline_abbrev(v_discipline);
  select coalesce(max((substring(wp_number from '\d+$'))::int), 0) + 1
    into v_seq
    from work_packages
   where project_id = v_project_id
     and wp_number like v_prefix || '-%';
  v_wp_number := v_prefix || '-' || lpad(v_seq::text, 3, '0');

  -- New scope starts DRAFT. Moving it to SCOPED is a deliberate second step:
  -- an agreed package and a proposed one are different things to a yard.
  insert into work_packages (
    project_id, wp_number, title, discipline, description, status,
    planned_hours, planned_cost, trade_contractor,
    planned_start, planned_end, is_class_item, class_item_ref
  ) values (
    v_project_id, v_wp_number, trim(p_title), v_discipline,
    nullif(trim(coalesce(p_description, '')), ''), 'DRAFT'::work_package_status,
    coalesce(p_planned_hours, 0), coalesce(p_planned_cost, 0),
    nullif(trim(coalesce(p_trade_contractor, '')), ''),
    p_planned_start, p_planned_end,
    coalesce(p_is_class_item, false),
    nullif(trim(coalesce(p_class_item_ref, '')), '')
  ) returning * into v_wp;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'WORK_PACKAGE_CREATED', 'WORK_PACKAGE', v_wp.id, null,
    jsonb_build_object(
      'wp_number', v_wp.wp_number, 'title', v_wp.title,
      'discipline', v_wp.discipline, 'status', v_wp.status,
      'planned_cost', v_wp.planned_cost, 'planned_hours', v_wp.planned_hours),
    v_actor_id, v_actor_name
  );

  return json_build_object('work_package', row_to_json(v_wp));
end;
$$;

comment on function action_create_work_package is
  'Adds a work package to the project. Numbered from the highest existing suffix sharing its prefix.';

-- ─── Action: update a work package ───────────────────────────────────────────

create or replace function action_update_work_package(
  p_work_package_id uuid,
  p_status text default null,
  p_planned_hours numeric default null,
  p_planned_cost numeric default null,
  p_actual_hours numeric default null,
  p_actual_cost numeric default null,
  p_trade_contractor text default null,
  p_planned_start date default null,
  p_planned_end date default null,
  p_actual_start date default null,
  p_actual_end date default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before work_packages;
  v_after work_packages;
  v_status work_package_status;
  v_open_ncrs text;
begin
  select * into v_before from work_packages where id = p_work_package_id;
  if not found then
    raise exception 'Work package does not exist' using errcode = 'P0001';
  end if;

  if p_status is not null then
    begin
      v_status := p_status::work_package_status;
    exception when invalid_text_representation then
      raise exception 'Unknown status: %', p_status using errcode = 'P0001';
    end;
  else
    v_status := v_before.status;
  end if;

  -- Work is not complete while the findings against it are open. This is the
  -- whole point of holding defects and scope in one model: the system can
  -- refuse a claim the project's own records contradict, rather than leaving
  -- someone to notice later.
  if v_status = 'COMPLETE' and v_before.status <> 'COMPLETE' then
    select string_agg(ncr_number, ', ' order by ncr_number)
      into v_open_ncrs
      from defect_records
     where work_package_id = p_work_package_id
       and status <> 'CLOSED';
    if v_open_ncrs is not null then
      raise exception
        'Cannot complete %: open NCRs against it (%)', v_before.wp_number, v_open_ncrs
        using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_planned_hours, 0) < 0 or coalesce(p_actual_hours, 0) < 0
     or coalesce(p_planned_cost, 0) < 0 or coalesce(p_actual_cost, 0) < 0 then
    raise exception 'Hours and costs cannot be negative' using errcode = 'P0001';
  end if;

  -- A null parameter means "leave this field alone", so a field cannot be
  -- cleared through this Action -- only overwritten.
  update work_packages set
    status           = v_status,
    planned_hours    = coalesce(p_planned_hours, planned_hours),
    planned_cost     = coalesce(p_planned_cost, planned_cost),
    actual_hours     = coalesce(p_actual_hours, actual_hours),
    actual_cost      = coalesce(p_actual_cost, actual_cost),
    trade_contractor = coalesce(nullif(trim(coalesce(p_trade_contractor, '')), ''), trade_contractor),
    planned_start    = coalesce(p_planned_start, planned_start),
    planned_end      = coalesce(p_planned_end, planned_end),
    -- Dates the status implies, filled in only when the caller left them out:
    -- a package that is ACTIVE started, and one that is COMPLETE ended.
    actual_start     = coalesce(p_actual_start, actual_start,
                         case when v_status in ('ACTIVE', 'EXPANDED', 'COMPLETE')
                              then current_date end),
    actual_end       = coalesce(p_actual_end, actual_end,
                         case when v_status = 'COMPLETE' then current_date end)
  where id = p_work_package_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', v_after.id,
    jsonb_build_object('status', v_before.status, 'planned_cost', v_before.planned_cost,
      'actual_cost', v_before.actual_cost, 'actual_hours', v_before.actual_hours),
    jsonb_build_object('status', v_after.status, 'planned_cost', v_after.planned_cost,
      'actual_cost', v_after.actual_cost, 'actual_hours', v_after.actual_hours),
    v_actor_id, v_actor_name
  );

  return json_build_object('work_package', row_to_json(v_after));
end;
$$;

comment on function action_update_work_package is
  'Progresses a work package. Refuses COMPLETE while open NCRs are linked to it.';

-- ─── Action: schedule an inspection ──────────────────────────────────────────

create or replace function action_schedule_inspection(
  p_title text,
  p_inspector_role text,
  p_work_package_id uuid default null,
  p_inspector_name text default null,
  p_scheduled_date date default null,
  p_is_class_inspection boolean default false,
  p_class_item_ref text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_project_id uuid;
  v_wp work_packages;
  v_prefix text;
  v_seq int;
  v_number text;
  v_insp inspection_events;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title is required' using errcode = 'P0001';
  end if;
  if p_inspector_role not in ('CLASS_SURVEYOR', 'OWNERS_REP', 'YARD_QC', 'FLAG_STATE') then
    raise exception 'Unknown inspector role: %', p_inspector_role using errcode = 'P0001';
  end if;

  if p_work_package_id is not null then
    select * into v_wp from work_packages where id = p_work_package_id;
    if not found then
      raise exception 'Work package does not exist' using errcode = 'P0001';
    end if;
    v_project_id := v_wp.project_id;
  else
    select id into v_project_id from projects order by created_at limit 1;
  end if;

  if v_project_id is null then
    raise exception 'No project exists' using errcode = 'P0001';
  end if;

  -- Numbered after the work package it attends, so INSP-HULL-004 sits with the
  -- hull work rather than in an undifferentiated sequence. Unattached class
  -- attendances fall back to INSP-CLASS-, everything else to INSP-GEN-.
  v_prefix := 'INSP-' || coalesce(
    discipline_abbrev(v_wp.discipline),
    case when coalesce(p_is_class_inspection, false) then 'CLASS' else 'GEN' end);
  select coalesce(max((substring(inspection_number from '\d+$'))::int), 0) + 1
    into v_seq
    from inspection_events
   where project_id = v_project_id
     and inspection_number like v_prefix || '-%';
  v_number := v_prefix || '-' || lpad(v_seq::text, 3, '0');

  insert into inspection_events (
    project_id, work_package_id, inspection_number, title,
    inspector_role, inspector_name, scheduled_date, result,
    is_class_inspection, class_item_ref
  ) values (
    v_project_id, p_work_package_id, v_number, trim(p_title),
    p_inspector_role, nullif(trim(coalesce(p_inspector_name, '')), ''),
    p_scheduled_date, 'PENDING'::inspection_result,
    coalesce(p_is_class_inspection, false),
    nullif(trim(coalesce(p_class_item_ref, '')), '')
  ) returning * into v_insp;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'INSPECTION_SCHEDULED', 'INSPECTION_EVENT', v_insp.id, null,
    jsonb_build_object(
      'inspection_number', v_insp.inspection_number, 'title', v_insp.title,
      'inspector_role', v_insp.inspector_role, 'scheduled_date', v_insp.scheduled_date,
      'is_class_inspection', v_insp.is_class_inspection),
    v_actor_id, v_actor_name
  );

  return json_build_object('inspection', row_to_json(v_insp));
end;
$$;

comment on function action_schedule_inspection is
  'Books an inspection attendance. Result starts PENDING until action_record_inspection_result.';

-- ─── Action: attach a defect to a work package ───────────────────────────────

create or replace function action_link_defect_to_work_package(
  p_defect_id uuid,
  p_work_package_id uuid default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before defect_records;
  v_after defect_records;
  v_wp work_packages;
begin
  select * into v_before from defect_records where id = p_defect_id;
  if not found then
    raise exception 'Defect does not exist' using errcode = 'P0001';
  end if;

  -- A closed NCR is a settled record. Re-filing it under different scope would
  -- rewrite history that an approval may already have been granted against.
  if v_before.status = 'CLOSED' then
    raise exception 'Cannot re-link %: it is closed', v_before.ncr_number
      using errcode = 'P0001';
  end if;

  if p_work_package_id is not null then
    select * into v_wp from work_packages where id = p_work_package_id;
    if not found then
      raise exception 'Work package does not exist' using errcode = 'P0001';
    end if;
    if v_wp.project_id <> v_before.project_id then
      raise exception 'Work package belongs to a different project'
        using errcode = 'P0001';
    end if;
  end if;

  update defect_records set work_package_id = p_work_package_id
   where id = p_defect_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'DEFECT_RELINKED', 'DEFECT_RECORD', v_after.id,
    jsonb_build_object('work_package_id', v_before.work_package_id),
    jsonb_build_object('work_package_id', v_after.work_package_id,
      'wp_number', v_wp.wp_number),
    v_actor_id, v_actor_name
  );

  return json_build_object(
    'defect', row_to_json(v_after),
    'work_package', case when v_wp.id is not null then row_to_json(v_wp) end
  );
end;
$$;

comment on function action_link_defect_to_work_package is
  'Attaches an open NCR to a work package, or detaches it when given null.';

-- ─── Grants ──────────────────────────────────────────────────────────────────
--
-- PUBLIC first: Postgres grants EXECUTE to PUBLIC on new functions by default,
-- which would leave anon able to call them (see migration 008).

revoke execute on function
  action_create_work_package(text, text, text, numeric, numeric, text, date, date, boolean, text),
  action_update_work_package(uuid, text, numeric, numeric, numeric, numeric, text, date, date, date, date),
  action_schedule_inspection(text, text, uuid, text, date, boolean, text),
  action_link_defect_to_work_package(uuid, uuid),
  discipline_abbrev(discipline)
from public, anon;

grant execute on function
  action_create_work_package(text, text, text, numeric, numeric, text, date, date, boolean, text),
  action_update_work_package(uuid, text, numeric, numeric, numeric, numeric, text, date, date, date, date),
  action_schedule_inspection(text, text, uuid, text, date, boolean, text),
  action_link_defect_to_work_package(uuid, uuid)
to authenticated;

-- ─── Registry ────────────────────────────────────────────────────────────────
--
-- The agent's tool manifest is generated from this table, so registering an
-- Action here is what makes it callable by the agent. No TypeScript changes.

insert into ontology_actions
  (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_create_work_package', 'Create work package',
   'Adds a unit of scope to the project — a discipline, a cost and hours estimate, and planned dates. Starts in DRAFT.',
   'WORK_PACKAGE',
   '[{"name":"p_title","type":"text","required":true},
     {"name":"p_discipline","type":"enum","required":true,"values":["STRUCTURAL","HULL","MECHANICAL","ELECTRICAL","RIGGING","INTERIOR","PAINT","CLASS","SAFETY"]},
     {"name":"p_description","type":"text"},
     {"name":"p_planned_hours","type":"numeric"},
     {"name":"p_planned_cost","type":"numeric"},
     {"name":"p_trade_contractor","type":"text"},
     {"name":"p_planned_start","type":"date"},
     {"name":"p_planned_end","type":"date"},
     {"name":"p_is_class_item","type":"boolean"},
     {"name":"p_class_item_ref","type":"text"}]'::jsonb,
   '{}'::text[], true),

  ('action_update_work_package', 'Update work package',
   'Progresses a work package and books actuals against it. Omitted fields are left unchanged. Refuses to move to COMPLETE while open NCRs are linked to it.',
   'WORK_PACKAGE',
   '[{"name":"p_work_package_id","type":"uuid","required":true},
     {"name":"p_status","type":"enum","values":["DRAFT","SCOPED","ACTIVE","EXPANDED","ON_HOLD","COMPLETE"]},
     {"name":"p_planned_hours","type":"numeric"},
     {"name":"p_planned_cost","type":"numeric"},
     {"name":"p_actual_hours","type":"numeric"},
     {"name":"p_actual_cost","type":"numeric"},
     {"name":"p_trade_contractor","type":"text"},
     {"name":"p_planned_start","type":"date"},
     {"name":"p_planned_end","type":"date"},
     {"name":"p_actual_start","type":"date"},
     {"name":"p_actual_end","type":"date"}]'::jsonb,
   '{}'::text[], true),

  ('action_schedule_inspection', 'Schedule inspection',
   'Books a survey attendance against a work package, before it happens. Result stays PENDING until it is recorded.',
   'INSPECTION_EVENT',
   '[{"name":"p_title","type":"text","required":true},
     {"name":"p_inspector_role","type":"enum","required":true,"values":["CLASS_SURVEYOR","OWNERS_REP","YARD_QC","FLAG_STATE"]},
     {"name":"p_work_package_id","type":"uuid"},
     {"name":"p_inspector_name","type":"text"},
     {"name":"p_scheduled_date","type":"date"},
     {"name":"p_is_class_inspection","type":"boolean"},
     {"name":"p_class_item_ref","type":"text"}]'::jsonb,
   '{}'::text[], true),

  ('action_link_defect_to_work_package', 'Attach NCR to work package',
   'Attaches an open NCR to the work package it affects, or detaches it when the work package is omitted. A closed NCR cannot be re-linked.',
   'DEFECT_RECORD',
   '[{"name":"p_defect_id","type":"uuid","required":true},
     {"name":"p_work_package_id","type":"uuid"}]'::jsonb,
   '{}'::text[], true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  target_type = excluded.target_type,
  parameters = excluded.parameters,
  cascades = excluded.cascades,
  is_agent_usable = excluded.is_agent_usable;
