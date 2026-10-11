-- Migration 043: the asset is a boat, a building or an aircraft (assets, part 1).
--
-- The model was built around a yacht: one row in `vessels` that every part,
-- reading, service, log day, transaction and payment of the boat hangs on
-- (`vessel_id`), outliving each project done to it. A house needs exactly
-- that too -- its boiler, roof and lift outlive any renovation -- but until
-- now a PROPERTY project had no asset row, so its parts belonged to the
-- project and ended with it. An aircraft is the same shape again.
--
-- So `vessels` becomes the asset record, of a kind:
--   VESSEL    the boat, as before (LOA, beam, draft, hull id, flag, class)
--   BUILDING  a house or other building (address, cadastral reference, area)
--   AIRCRAFT  an aircraft (registration, manufacturer, model, serial (MSN))
-- The table and the `vessel_id` columns keep their names: every RLS rule,
-- function and index already scopes by them, and renaming them would touch
-- all of it for no change in behaviour. In the app and the docs it is "the
-- asset"; `asset_kind` says which.
--
-- Kind-specific facts live in `details` (jsonb), with allowed keys checked
-- per kind, so a building does not grow LOA columns and an aircraft does not
-- grow a cadastral one. The boat's existing columns stay where they are.
--
-- A PROPERTY project can now record its building (action_set_project_asset).
-- When it does, whatever the project owned on its own -- parts, spaces,
-- connections -- moves onto the building, and its finance rows and payment
-- plans are tied to the building, so they outlive the project like a boat's.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: assets_1_kind, assets_1b_registry,
-- assets_2_actions, assets_2b_vessel_guard, assets_3_logbook_guard,
-- assets_3b_kind_message.

-- 1. Kind and details ----------------------------------------------------------------------
alter table public.vessels add column if not exists asset_kind text not null default 'VESSEL';
alter table public.vessels add column if not exists details jsonb not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vessels_asset_kind_check') then
    alter table public.vessels add constraint vessels_asset_kind_check check (asset_kind in ('VESSEL', 'BUILDING', 'AIRCRAFT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vessels_details_object_check') then
    alter table public.vessels add constraint vessels_details_object_check check (jsonb_typeof(details) = 'object');
  end if;
end $$;

-- The kind of asset a project of this type is done to.
create or replace function public.project_asset_kind(p_type project_type)
returns text
language sql
immutable
as $$
  select case p_type::text when 'PROPERTY' then 'BUILDING' else 'VESSEL' end;
$$;

-- Allowed details per kind, with their type. Anything else is refused, so
-- a typo ("adress") is caught rather than stored and never shown.
create or replace function public.asset_details_spec(p_kind text)
returns jsonb
language sql
immutable
as $$
  select case p_kind
    when 'BUILDING' then jsonb_build_object(
      'address', 'text', 'city', 'text', 'postcode', 'text', 'country', 'text',
      'cadastral_ref', 'text', 'building_use', 'text', 'floor_area_m2', 'number', 'plot_area_m2', 'number',
      'floors', 'number', 'units', 'number', 'energy_class', 'text', 'latitude', 'number', 'longitude', 'number')
    when 'AIRCRAFT' then jsonb_build_object(
      'registration', 'text', 'manufacturer', 'text', 'model', 'text', 'msn', 'text', 'category', 'text',
      'engines', 'number', 'engine_model', 'text', 'mtow_kg', 'number', 'seats', 'number',
      'base', 'text', 'operator', 'text', 'type_certificate', 'text')
    else jsonb_build_object('notes', 'text')
  end;
$$;

-- Validates and cleans details: known keys only, right types, text trimmed,
-- empty values dropped (a key set to "" or null is removed).
create or replace function public.clean_asset_details(p_kind text, p_details jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_spec jsonb := asset_details_spec(p_kind);
  v_out jsonb := '{}';
  v_key text;
  v_val jsonb;
  v_type text;
begin
  if p_details is null then return '{}'; end if;
  if jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details are a set of named values' using errcode = 'P0001';
  end if;
  for v_key, v_val in select * from jsonb_each(p_details) loop
    v_type := v_spec ->> v_key;
    if v_type is null then
      raise exception '"%" is not a detail of a %: use %', v_key, lower(p_kind),
        (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_spec) k) using errcode = 'P0001';
    end if;
    continue when v_val is null or jsonb_typeof(v_val) = 'null' or (jsonb_typeof(v_val) = 'string' and trim(v_val #>> '{}') = '');
    if v_type = 'number' then
      begin
        v_out := v_out || jsonb_build_object(v_key, (v_val #>> '{}')::numeric);
      exception when others then
        raise exception '"%" must be a number', v_key using errcode = 'P0001';
      end;
    else
      v_out := v_out || jsonb_build_object(v_key, trim(v_val #>> '{}'));
    end if;
  end loop;
  return v_out;
end;
$$;

-- Run inside a DO block when applied (the MCP holds a bare UPDATE for confirmation).
do $$
begin
  update ontology_object_types
     set label = 'Asset',
         description = 'The thing the work is done to and the record outlives every project: a VESSEL (boat), a BUILDING (house) or an AIRCRAFT, by asset_kind. Kind-specific facts are in details (a building''s address and cadastral reference; an aircraft''s registration and MSN; a boat''s LOA, beam, draft, hull id, flag and class are columns). Parts, readings, services, logbook, finance and payment plans hang on it through vessel_id.'
   where key = 'VESSEL';
end $$;

-- 2. Actions ---------------------------------------------------------------------------------------
-- Records (or updates) the asset of a project of any kind. The kind follows
-- the project type. Details are merged: keys given replace, keys set to ""
-- remove, keys not given stay.
create or replace function public.action_set_project_asset(
  p_project_id uuid default null, p_name text default null, p_details jsonb default '{}', p_year_built int default null
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
  v_kind text;
  v_before vessels;
  v_after vessels;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_details jsonb;
  v_moved jsonb;
  n_parts int; n_spaces int; n_links int; n_fin int;
begin
  perform require_permission('action_set_project_asset', v_project_id);
  select * into v_project from projects where id = v_project_id;
  if not found then raise exception 'Project not found' using errcode = 'P0001'; end if;
  v_kind := project_asset_kind(v_project.project_type);
  if p_year_built is not null and (p_year_built < 1000 or p_year_built > extract(year from now())::int + 5) then
    raise exception 'Year built % is not plausible', p_year_built using errcode = 'P0001';
  end if;
  -- Keys given as "" are removals: validate the rest, then apply both.
  v_details := clean_asset_details(v_kind, coalesce(p_details, '{}'));

  if v_project.vessel_id is null then
    if v_name is null then
      raise exception 'The % needs a name', lower(v_kind) using errcode = 'P0001';
    end if;
    insert into vessels (name, asset_kind, details, year_built)
    values (v_name, v_kind, v_details, p_year_built)
    returning * into v_after;
    update projects set vessel_id = v_after.id where id = v_project_id;

    -- What the project owned on its own now belongs to the asset, so it
    -- outlives the project. Nothing is copied or deleted: rows are re-homed.
    update parts set vessel_id = v_after.id, project_id = null where project_id = v_project_id and vessel_id is null;
    get diagnostics n_parts = row_count;
    update spaces set vessel_id = v_after.id, project_id = null where project_id = v_project_id and vessel_id is null;
    get diagnostics n_spaces = row_count;
    update part_connections set vessel_id = v_after.id, project_id = null where project_id = v_project_id and vessel_id is null;
    get diagnostics n_links = row_count;
    update finance_accounts set vessel_id = v_after.id where project_id = v_project_id and vessel_id is null;
    get diagnostics n_fin = row_count;
    update finance_transactions set vessel_id = v_after.id where project_id = v_project_id and vessel_id is null;
    update finance_connections set vessel_id = v_after.id where project_id = v_project_id and vessel_id is null;
    update payment_agreements set vessel_id = v_after.id where project_id = v_project_id and vessel_id is null;
    v_moved := jsonb_build_object('parts', n_parts, 'spaces', n_spaces, 'connections', n_links, 'finance_accounts', n_fin);

    insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
    values (v_project_id, 'ASSET_CREATED', 'VESSEL', v_after.id, null,
            (to_jsonb(v_after) - 'created_at') || jsonb_build_object('moved_from_project', v_moved), v_actor_id, v_actor_name);
  else
    select * into v_before from vessels where id = v_project.vessel_id for update;
    if v_before.asset_kind <> v_kind then
      raise exception 'This project''s asset is a %, not a %', lower(v_before.asset_kind), lower(v_kind) using errcode = 'P0001';
    end if;
    update vessels set
      name = coalesce(v_name, name),
      year_built = coalesce(p_year_built, year_built),
      details = (details - array(select k from jsonb_each(coalesce(p_details, '{}')) e(k, v)
                                  where v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '')))
                || v_details
    where id = v_before.id
    returning * into v_after;
    insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
    values (v_project_id, 'ASSET_UPDATED', 'VESSEL', v_after.id, to_jsonb(v_before) - 'created_at', to_jsonb(v_after) - 'created_at',
            v_actor_id, v_actor_name);
  end if;
  return json_build_object('asset', row_to_json(v_after), 'moved', v_moved);
end;
$$;
revoke execute on function public.action_set_project_asset(uuid, text, jsonb, int) from anon, public;
grant execute on function public.action_set_project_asset(uuid, text, jsonb, int) to authenticated;

-- The boat form keeps its own action; it must not write boat columns onto a
-- building or an aircraft.
create or replace function public.require_vessel_kind(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
begin
  select v.asset_kind into v_kind from projects p join vessels v on v.id = p.vessel_id where p.id = p_project_id;
  if v_kind is not null and v_kind <> 'VESSEL' then
    raise exception 'This project''s asset is a %, not a boat: this is for boats only (record a % with action_set_project_asset)',
      lower(v_kind), lower(v_kind) using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.require_vessel_kind(uuid) from anon, public;

insert into action_permissions (action_key, role)
select 'action_set_project_asset', role from action_permissions where action_key = 'action_set_project_vessel'
on conflict do nothing;

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values ('action_set_project_asset', 'Record the asset',
  'Records or updates the asset a project is done to: for a PROPERTY project, the building (name, year built, and details: address, city, postcode, country, cadastral_ref, building_use, floor_area_m2, plot_area_m2, floors, units, energy_class, latitude, longitude). Details are merged; a detail given as "" is removed. When a building is first recorded, the parts, spaces and finance the project held on its own move onto it. For a boat use action_set_project_vessel.',
  'VESSEL',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_name', 'type', 'text'),
    jsonb_build_object('name', 'p_details', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_year_built', 'type', 'int')
  ), '{}', true)
on conflict (key) do nothing;

-- The boat's own action, unchanged but for the kind guard.
create or replace function public.action_set_project_vessel(
  p_project_id uuid default null, p_name text default null, p_vessel_type text default null, p_year_built integer default null,
  p_build_yard text default null, p_loa numeric default null, p_beam numeric default null, p_draft numeric default null,
  p_gross_tonnage numeric default null, p_hull_id text default null, p_flag_state text default null,
  p_class_society text default null, p_class_number text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
    raise exception 'A property project has a building, not a vessel: use action_set_project_asset' using errcode = 'P0001';
  end if;
  perform require_vessel_kind(v_project_id);

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
$fn$;

-- A boat's logbook is for a boat: refused on a building or an aircraft
-- (assets_3_logbook_guard). Unchanged otherwise.
create or replace function public.action_open_logbook(p_from_project_id uuid default null, p_vessel_name text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_name text := nullif(trim(coalesce(p_vessel_name, '')), '');
  v_from projects;
  v_vessel vessels;
  v_role user_role;
  v_project projects;
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;
  if (p_from_project_id is null) = (v_name is null) then
    raise exception 'Open a logbook from a project, or name a new boat' using errcode = 'P0001';
  end if;

  if p_from_project_id is not null then
    v_role := current_actor_role(p_from_project_id);
    if v_role is null then
      raise exception 'You are not a member of that project' using errcode = 'P0001';
    end if;
    if v_role not in ('OWNER', 'OWNERS_REP', 'CAPTAIN') then
      raise exception 'Only the owner, the owner''s representative or the captain can open a boat''s logbook'
        using errcode = 'P0001';
    end if;
    select * into v_from from projects where id = p_from_project_id;
    if v_from.vessel_id is null then
      raise exception 'Record the vessel on this project first' using errcode = 'P0001';
    end if;
    perform require_vessel_kind(p_from_project_id);
    if exists (select 1 from projects where vessel_id = v_from.vessel_id and project_type = 'OPERATIONS') then
      raise exception 'This boat already has a logbook. Ask its captain to invite you.' using errcode = 'P0001';
    end if;
    select * into v_vessel from vessels where id = v_from.vessel_id;
  else
    if length(v_name) > 200 then
      raise exception 'A boat''s name is at most 200 characters' using errcode = 'P0001';
    end if;
    insert into vessels (name) values (v_name) returning * into v_vessel;
    v_role := 'CAPTAIN';
  end if;

  insert into projects (vessel_id, name, project_type, phase)
  values (v_vessel.id, v_vessel.name || ' · Logbook', 'OPERATIONS', 'IN_SERVICE')
  returning * into v_project;

  insert into project_members (project_id, user_id, role, name, email, status, first_seen_at, last_seen_at)
  values (v_project.id, v_actor_id, v_role, coalesce(v_actor_name, v_email), v_email, 'ACTIVE', now(), now());

  if p_from_project_id is null then
    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_project.id, 'VESSEL_CREATED', 'VESSEL', v_vessel.id,
      null, jsonb_build_object('name', v_vessel.name), v_actor_id, v_actor_name
    );
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project.id, 'PROJECT_CREATED', 'PROJECT', v_project.id, null,
    jsonb_build_object('name', v_project.name, 'project_type', v_project.project_type,
                       'vessel', v_vessel.name, 'opened_from', p_from_project_id),
    v_actor_id, v_actor_name
  );

  return json_build_object('project', row_to_json(v_project));
end;
$fn$;
