-- =============================================================================
-- YAM Migration 006 — ACTIONS LAYER (helpers + defect cascade)
--
-- Applied to the live project as migration `actions_helpers_and_defect_cascade`.
--
-- Every Action is SECURITY DEFINER so it can write to tables the caller has no
-- direct grant on (see migration 008). That makes Actions the ONLY write path,
-- which is what makes provenance trustworthy: the actor is stamped from
-- auth.uid() server-side and the event log is written in the same transaction
-- as the mutation. A client cannot forge an actor, and cannot mutate without
-- producing an event.
--
-- search_path is pinned on every function: without it, a caller can prepend a
-- schema and hijack unqualified table references inside a SECURITY DEFINER
-- function.
-- =============================================================================

create or replace function current_actor_id()
returns uuid language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;

comment on function current_actor_id() is
  'The acting user, from the verified JWT. Never client-supplied.';

create or replace function current_actor_name()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select pm.name from project_members pm
      where lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', '')) limit 1),
    nullif(auth.jwt() ->> 'email', ''),
    'Unknown'
  );
$$;

comment on function current_actor_name() is
  'Display name for the acting user, resolved from project_members by JWT email.';

create or replace function approval_tier_for_cost(p_cost numeric)
returns approval_tier language sql immutable
as $$
  select case
    when abs(coalesce(p_cost, 0)) < 10000 then 'TIER_1'::approval_tier
    when abs(coalesce(p_cost, 0)) <= 50000 then 'TIER_2'::approval_tier
    else 'TIER_3'::approval_tier
  end;
$$;

create or replace function approval_days_for_tier(p_tier approval_tier)
returns int language sql immutable
as $$
  select case p_tier when 'TIER_3' then 2 when 'TIER_2' then 5 else 14 end;
$$;

-- ─── Action: raise a defect, with automatic cascade ──────────────────────────

create or replace function action_raise_defect(
  p_title text, p_description text, p_location_on_vessel text,
  p_severity text, p_root_cause text, p_disposition text,
  p_is_class_defect boolean default false, p_class_item_ref text default null,
  p_cost_impact numeric default null, p_schedule_impact_days int default null,
  p_work_package_id uuid default null, p_inspection_event_id uuid default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := 'a1b2c3d4-0002-0000-0000-000000000001';
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_seq int; v_ncr_number text; v_co_number text; v_appr_number text;
  v_defect defect_records; v_co change_orders; v_approval owner_approvals;
  v_defect_event_id uuid; v_tier approval_tier; v_should_cascade boolean;
begin
  -- Validation. The client validates too, but anything reaching the database
  -- must stand on its own -- the endpoint is callable directly.
  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'Defect title must be at least 3 characters' using errcode = 'P0001';
  end if;
  if p_cost_impact is not null and p_cost_impact < 0 then
    raise exception 'Cost impact cannot be negative' using errcode = 'P0001';
  end if;
  if p_schedule_impact_days is not null and p_schedule_impact_days < 0 then
    raise exception 'Schedule impact cannot be negative' using errcode = 'P0001';
  end if;
  if p_work_package_id is not null
     and not exists (select 1 from work_packages where id = p_work_package_id) then
    raise exception 'Work package does not exist' using errcode = 'P0001';
  end if;
  if p_inspection_event_id is not null
     and not exists (select 1 from inspection_events where id = p_inspection_event_id) then
    raise exception 'Inspection event does not exist' using errcode = 'P0001';
  end if;

  -- Sequential NCR number from the highest existing suffix rather than a row
  -- count, so deleting a record can't cause a duplicate number.
  select coalesce(max((substring(ncr_number from '\d+$'))::int), 0) + 1
    into v_seq from defect_records where project_id = v_project_id;
  v_ncr_number := 'NCR-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into defect_records (
    project_id, inspection_event_id, work_package_id, ncr_number, title,
    description, location_on_vessel, severity, status, root_cause, disposition,
    is_class_defect, class_item_ref, discovered_by, discovered_date,
    cost_impact, schedule_impact_days
  ) values (
    v_project_id, p_inspection_event_id, p_work_package_id, v_ncr_number,
    trim(p_title), p_description, p_location_on_vessel,
    p_severity::defect_severity, 'OPEN'::defect_status,
    p_root_cause::root_cause, p_disposition::disposition,
    coalesce(p_is_class_defect, false), nullif(p_class_item_ref, ''),
    v_actor_name, current_date, p_cost_impact, p_schedule_impact_days
  ) returning * into v_defect;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'DEFECT_CREATED', 'DEFECT_RECORD', v_defect.id, null,
    jsonb_build_object('ncr_number', v_defect.ncr_number, 'severity', v_defect.severity,
      'status', v_defect.status, 'title', v_defect.title, 'cost_impact', v_defect.cost_impact),
    v_actor_id, v_actor_name
  ) returning id into v_defect_event_id;

  -- Cascade rule: material defects require a costed change order.
  v_should_cascade := v_defect.severity in ('HIGH', 'CRITICAL')
                      and coalesce(v_defect.cost_impact, 0) > 0;

  if not v_should_cascade then
    return json_build_object('defect', row_to_json(v_defect),
                             'change_order', null, 'approval', null);
  end if;

  select coalesce(max((substring(co_number from '\d+$'))::int), 0) + 1
    into v_seq from change_orders where project_id = v_project_id;
  v_co_number := 'CO-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into change_orders (
    project_id, co_number, title, description, trigger_type, status,
    cost_delta, schedule_delta_days, raised_by, raised_date, defect_record_id
  ) values (
    v_project_id, v_co_number, v_ncr_number || ': ' || v_defect.title,
    'Change order automatically raised from ' || v_ncr_number || '. '
      || coalesce(v_defect.description, ''),
    'DEFECT_DISCOVERY'::change_order_trigger, 'PENDING_APPROVAL'::change_order_status,
    coalesce(v_defect.cost_impact, 0), coalesce(v_defect.schedule_impact_days, 0),
    v_actor_name, current_date, v_defect.id
  ) returning * into v_co;

  update defect_records
     set change_order_id = v_co.id, status = 'PENDING_APPROVAL'::defect_status
   where id = v_defect.id returning * into v_defect;

  v_tier := approval_tier_for_cost(v_co.cost_delta);

  select coalesce(max((substring(approval_number from '\d+$'))::int), 0) + 1
    into v_seq from owner_approvals where project_id = v_project_id;
  v_appr_number := 'APPR-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into owner_approvals (
    project_id, approval_number, title, description, tier, status,
    requested_by, requested_date, change_order_id, cost_amount, deadline
  ) values (
    v_project_id, v_appr_number, 'Approval required: ' || v_co_number,
    v_co.description, v_tier, 'PENDING'::approval_status,
    v_actor_name, current_date, v_co.id, v_co.cost_delta,
    current_date + approval_days_for_tier(v_tier)
  ) returning * into v_approval;

  update change_orders set approval_id = v_approval.id
   where id = v_co.id returning * into v_co;

  -- Both cascade events point back at the defect event that caused them, so the
  -- chain is walkable from the originating finding.
  insert into world_model_events (
    project_id, event_type, object_type, object_id, before_state, after_state,
    triggered_by, triggered_by_name, cascade_from_event_id
  ) values (
    v_project_id, 'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', v_co.id, null,
    jsonb_build_object('co_number', v_co.co_number, 'status', v_co.status,
      'cost_delta', v_co.cost_delta, 'schedule_delta_days', v_co.schedule_delta_days,
      'trigger_type', v_co.trigger_type),
    v_actor_id, v_actor_name, v_defect_event_id
  );

  insert into world_model_events (
    project_id, event_type, object_type, object_id, before_state, after_state,
    triggered_by, triggered_by_name, cascade_from_event_id
  ) values (
    v_project_id, 'APPROVAL_REQUESTED', 'OWNER_APPROVAL', v_approval.id, null,
    jsonb_build_object('approval_number', v_approval.approval_number,
      'tier', v_approval.tier, 'status', v_approval.status,
      'cost_amount', v_approval.cost_amount, 'deadline', v_approval.deadline),
    v_actor_id, v_actor_name, v_defect_event_id
  );

  return json_build_object('defect', row_to_json(v_defect),
                           'change_order', row_to_json(v_co),
                           'approval', row_to_json(v_approval));
end;
$$;

comment on function action_raise_defect is
  'Raises an NCR. HIGH/CRITICAL with cost impact auto-creates the Change Order and Owner Approval, linked and logged, atomically.';
