-- =============================================================================
-- YAM Migration 025 — A PROJECT CAN SAY WHICH BOAT IT IS
--
-- Applied to the live project as `vessel_details`.
--
-- Projects created in the app had no way to get a vessel. action_create_project
-- takes no vessel fields, nothing else writes to `vessels`, and since migration
-- 008 nothing may write to it directly. So Lucky Bird, a refit of a 1974 Swan
-- 46, showed "No vessel on this project" with no way to change that. The agent
-- said as much: "there's no vessel record linked to Lucky Bird yet and I have
-- no tool to create one".
--
-- 1. Only the name is required. hull_id, vessel_type, loa, flag_state and
--    class_society were NOT NULL, which made sense for the seeded superyacht
--    and is wrong for a 46-foot classic that has no class society and whose
--    hull number nobody has to hand on day one. A record you can start with a
--    name and complete later beats one you cannot start.
--
-- 2. action_set_project_vessel creates the vessel the first time and updates
--    it after that. Omitted fields keep their current value, so the agent can
--    record "she's a Swan 46 from 1974" without wiping the LOA someone typed.
--    The previous values go into the event log, like every other change.
--
-- 3. Registered for the agent and permitted to the roles that know the boat.
-- =============================================================================

-- 1. Only the name is required ------------------------------------------------
alter table public.vessels alter column hull_id drop not null;
alter table public.vessels alter column vessel_type drop not null;
alter table public.vessels alter column loa drop not null;
alter table public.vessels alter column flag_state drop not null;
alter table public.vessels alter column class_society drop not null;

-- 2. The Action ---------------------------------------------------------------
create or replace function public.action_set_project_vessel(
  p_project_id uuid default null,
  p_name text default null,
  p_vessel_type text default null,
  p_year_built integer default null,
  p_build_yard text default null,
  p_loa numeric default null,
  p_beam numeric default null,
  p_draft numeric default null,
  p_gross_tonnage numeric default null,
  p_hull_id text default null,
  p_flag_state text default null,
  p_class_society text default null,
  p_class_number text default null
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
  v_project projects;
  v_before vessels;
  v_after vessels;
  v_class class_society;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_blank constant text := '';
begin
  perform require_permission('action_set_project_vessel', v_project_id);

  select * into v_project from projects where id = v_project_id;
  if not found then
    raise exception 'Project not found' using errcode = 'P0001';
  end if;
  if v_project.project_type = 'PROPERTY' then
    raise exception 'A property project has no vessel' using errcode = 'P0001';
  end if;

  -- Validation stands on its own: the endpoint is callable directly.
  if p_year_built is not null
     and (p_year_built < 1800 or p_year_built > extract(year from now())::int + 5) then
    raise exception 'Year built % is not plausible', p_year_built using errcode = 'P0001';
  end if;
  if coalesce(p_loa, 1) <= 0 or coalesce(p_beam, 1) <= 0
     or coalesce(p_draft, 1) <= 0 or coalesce(p_gross_tonnage, 1) <= 0 then
    raise exception 'Dimensions must be greater than zero' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_class_society, '')), '') is not null then
    begin
      v_class := upper(trim(p_class_society))::class_society;
    exception when invalid_text_representation then
      raise exception 'Unknown class society: % (use LLOYDS, BV, RINA, DNV, ABS or OTHER)',
        p_class_society using errcode = 'P0001';
    end;
  end if;

  if v_project.vessel_id is null then
    if v_name is null then
      raise exception 'A vessel needs a name' using errcode = 'P0001';
    end if;

    insert into vessels (
      name, vessel_type, year_built, build_yard, loa, beam, draft, gross_tonnage,
      hull_id, flag_state, class_society, class_number
    ) values (
      v_name,
      nullif(trim(coalesce(p_vessel_type, v_blank)), ''),
      p_year_built,
      nullif(trim(coalesce(p_build_yard, v_blank)), ''),
      p_loa, p_beam, p_draft, p_gross_tonnage,
      nullif(trim(coalesce(p_hull_id, v_blank)), ''),
      nullif(trim(coalesce(p_flag_state, v_blank)), ''),
      v_class,
      nullif(trim(coalesce(p_class_number, v_blank)), '')
    ) returning * into v_after;

    update projects set vessel_id = v_after.id where id = v_project_id;

    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_project_id, 'VESSEL_CREATED', 'VESSEL', v_after.id,
      null, to_jsonb(v_after) - 'created_at',
      v_actor_id, v_actor_name
    );
  else
    select * into v_before from vessels where id = v_project.vessel_id;

    -- Omitted means "leave it as it is", never "clear it".
    update vessels set
      name          = coalesce(v_name, name),
      vessel_type   = coalesce(nullif(trim(coalesce(p_vessel_type, v_blank)), ''), vessel_type),
      year_built    = coalesce(p_year_built, year_built),
      build_yard    = coalesce(nullif(trim(coalesce(p_build_yard, v_blank)), ''), build_yard),
      loa           = coalesce(p_loa, loa),
      beam          = coalesce(p_beam, beam),
      draft         = coalesce(p_draft, draft),
      gross_tonnage = coalesce(p_gross_tonnage, gross_tonnage),
      hull_id       = coalesce(nullif(trim(coalesce(p_hull_id, v_blank)), ''), hull_id),
      flag_state    = coalesce(nullif(trim(coalesce(p_flag_state, v_blank)), ''), flag_state),
      class_society = coalesce(v_class, class_society),
      class_number  = coalesce(nullif(trim(coalesce(p_class_number, v_blank)), ''), class_number)
    where id = v_project.vessel_id
    returning * into v_after;

    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_project_id, 'VESSEL_UPDATED', 'VESSEL', v_after.id,
      to_jsonb(v_before) - 'created_at', to_jsonb(v_after) - 'created_at',
      v_actor_id, v_actor_name
    );
  end if;

  return json_build_object('vessel', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_set_project_vessel(
  uuid, text, text, integer, text, numeric, numeric, numeric, numeric, text, text, text, text
) from anon, public;
grant execute on function public.action_set_project_vessel(
  uuid, text, text, integer, text, numeric, numeric, numeric, numeric, text, text, text, text
) to authenticated;

-- 3. Permissions and registry -------------------------------------------------
insert into action_permissions (action_key, role)
select 'action_set_project_vessel', r::user_role
  from unnest(array['OWNERS_REP', 'OWNER', 'CAPTAIN', 'NAVAL_ARCHITECT']) as r
on conflict do nothing;

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values (
  'action_set_project_vessel',
  'Set vessel details',
  'Records which boat this project is about: creates the vessel the first time (a name is enough to start), and updates it after that. Omitted fields keep their current value. Not available on PROPERTY projects. Use it when someone tells you the boat''s name, type, builder, year or dimensions.',
  'VESSEL',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_name', 'type', 'text'),
    jsonb_build_object('name', 'p_vessel_type', 'type', 'text'),
    jsonb_build_object('name', 'p_year_built', 'type', 'integer'),
    jsonb_build_object('name', 'p_build_yard', 'type', 'text'),
    jsonb_build_object('name', 'p_loa', 'type', 'numeric'),
    jsonb_build_object('name', 'p_beam', 'type', 'numeric'),
    jsonb_build_object('name', 'p_draft', 'type', 'numeric'),
    jsonb_build_object('name', 'p_gross_tonnage', 'type', 'numeric'),
    jsonb_build_object('name', 'p_hull_id', 'type', 'text'),
    jsonb_build_object('name', 'p_flag_state', 'type', 'text'),
    jsonb_build_object('name', 'p_class_society', 'type', 'enum',
                       'values', jsonb_build_array('LLOYDS', 'BV', 'RINA', 'DNV', 'ABS', 'OTHER')),
    jsonb_build_object('name', 'p_class_number', 'type', 'text')
  ),
  '{}',
  true
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  target_type = excluded.target_type,
  parameters = excluded.parameters,
  is_agent_usable = excluded.is_agent_usable;
