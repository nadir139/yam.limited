-- Migration 045: aircraft (assets, part 3).
--
-- The third kind of asset. An aircraft is maintained by hours and landings
-- rather than days at sea, and its record in service is the technical log:
-- every flight, with its times and landings, adding up to the airframe's
-- total time. So:
--
--   * two project types done to an aircraft, with their own phases,
--     disciplines and documents (ontology_vocabulary): AIRCRAFT_CHECK (a
--     scheduled maintenance check or inspection) and AIRCRAFT_REFURB
--     (interior, paint, avionics work);
--   * the aircraft as an asset (043): registration, manufacturer, model,
--     MSN..., plus the airframe hours and landings it had when its record
--     started here (hours_at_entry, landings_at_entry);
--   * its tech log: an OPERATIONS project "<registration> · Tech log" with
--     `aircraft_flights`. Each flight's airborne time (takeoff to landing;
--     block time when those are not given) adds to the airframe's total
--     time, which is recorded as an hours reading on the asset's Airframe
--     part -- so a "100-hour inspection every 100 h" on the Airframe is due
--     by the same maintenance engine as a boat's engine service.
--
-- A flight is never edited or deleted. A wrong one is voided with its
-- reason and entered again; the airframe readings after it are recomputed
-- (the old ones voided with the reason, the new ones recorded), so the
-- total time is always the sum of the flights that stand.
--
-- Landings are counted (total cycles) but intervals in cycles are not yet
-- supported by the maintenance engine: hours and days only, for now.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: aircraft_0_enums,
-- aircraft_1_vocabulary, aircraft_2a_flights_table, aircraft_2b_flight_actions,
-- aircraft_3_tech_log, aircraft_4_kind_article.

-- 0. Enum values (their own step) ------------------------------------------------------------
alter type project_type add value if not exists 'AIRCRAFT_CHECK';
alter type project_type add value if not exists 'AIRCRAFT_REFURB';
alter type project_phase add value if not exists 'INDUCTION';
alter type project_phase add value if not exists 'FUNCTIONAL_TESTS';
alter type project_phase add value if not exists 'RETURN_TO_SERVICE';
alter type discipline add value if not exists 'AIRFRAME';
alter type discipline add value if not exists 'POWERPLANT';
alter type discipline add value if not exists 'AVIONICS';
alter type doc_type add value if not exists 'CRS';
alter type doc_type add value if not exists 'AIRWORTHINESS_REVIEW';
alter type doc_type add value if not exists 'TECH_LOG';
alter type object_type add value if not exists 'FLIGHT';

-- 1. Kinds and vocabulary ----------------------------------------------------------------------
create or replace function public.project_asset_kind(p_type project_type)
returns text
language sql
immutable
as $$
  select case
    when p_type::text = 'PROPERTY' then 'BUILDING'
    when p_type::text in ('AIRCRAFT_CHECK', 'AIRCRAFT_REFURB') then 'AIRCRAFT'
    else 'VESSEL'
  end;
$$;

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
      'base', 'text', 'operator', 'text', 'type_certificate', 'text',
      'hours_at_entry', 'number', 'landings_at_entry', 'number')
    else jsonb_build_object('notes', 'text')
  end;
$$;

insert into ontology_vocabulary (kind, value, applies_to, display_order)
select x.kind, x.value, x.applies_to::project_type, x.ord
  from (values
    ('PHASE', 'INDUCTION', 'AIRCRAFT_CHECK', 1), ('PHASE', 'SURVEY', 'AIRCRAFT_CHECK', 2), ('PHASE', 'REMEDIATION', 'AIRCRAFT_CHECK', 3),
    ('PHASE', 'FUNCTIONAL_TESTS', 'AIRCRAFT_CHECK', 4), ('PHASE', 'RETURN_TO_SERVICE', 'AIRCRAFT_CHECK', 5), ('PHASE', 'DELIVERED', 'AIRCRAFT_CHECK', 6),
    ('PHASE', 'INDUCTION', 'AIRCRAFT_REFURB', 1), ('PHASE', 'STRUCTURAL', 'AIRCRAFT_REFURB', 2), ('PHASE', 'SYSTEMS', 'AIRCRAFT_REFURB', 3),
    ('PHASE', 'INTERIOR', 'AIRCRAFT_REFURB', 4), ('PHASE', 'FUNCTIONAL_TESTS', 'AIRCRAFT_REFURB', 5), ('PHASE', 'RETURN_TO_SERVICE', 'AIRCRAFT_REFURB', 6),
    ('PHASE', 'DELIVERED', 'AIRCRAFT_REFURB', 7),
    ('DISCIPLINE', 'AIRFRAME', 'AIRCRAFT_CHECK', 100), ('DISCIPLINE', 'POWERPLANT', 'AIRCRAFT_CHECK', 101), ('DISCIPLINE', 'AVIONICS', 'AIRCRAFT_CHECK', 102), ('DISCIPLINE', 'PAINT', 'AIRCRAFT_CHECK', 103),
    ('DISCIPLINE', 'AIRFRAME', 'AIRCRAFT_REFURB', 100), ('DISCIPLINE', 'POWERPLANT', 'AIRCRAFT_REFURB', 101), ('DISCIPLINE', 'AVIONICS', 'AIRCRAFT_REFURB', 102), ('DISCIPLINE', 'PAINT', 'AIRCRAFT_REFURB', 103),
    ('DOC_TYPE', 'CRS', 'AIRCRAFT_CHECK', 100), ('DOC_TYPE', 'AIRWORTHINESS_REVIEW', 'AIRCRAFT_CHECK', 101), ('DOC_TYPE', 'TECH_LOG', 'AIRCRAFT_CHECK', 102),
    ('DOC_TYPE', 'CRS', 'AIRCRAFT_REFURB', 100), ('DOC_TYPE', 'AIRWORTHINESS_REVIEW', 'AIRCRAFT_REFURB', 101), ('DOC_TYPE', 'TECH_LOG', 'AIRCRAFT_REFURB', 102),
    ('ROOT_CAUSE', 'CORROSION', 'AIRCRAFT_CHECK', 100), ('ROOT_CAUSE', 'FATIGUE', 'AIRCRAFT_CHECK', 101),
    ('ROOT_CAUSE', 'CORROSION', 'AIRCRAFT_REFURB', 100), ('ROOT_CAUSE', 'FATIGUE', 'AIRCRAFT_REFURB', 101)
  ) as x(kind, value, applies_to, ord)
 where not exists (select 1 from ontology_vocabulary v where v.kind = x.kind and v.value = x.value and v.applies_to::text = x.applies_to);

-- 2. Flights -----------------------------------------------------------------------------------------
create table if not exists public.aircraft_flights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  flight_date date not null,
  departure text not null check (length(trim(departure)) between 2 and 60),
  arrival text not null check (length(trim(arrival)) between 2 and 60),
  block_off timestamptz not null,
  block_on timestamptz not null,
  takeoff_at timestamptz,
  landing_at timestamptz,
  block_minutes int not null check (block_minutes > 0),
  air_minutes int check (air_minutes is null or air_minutes > 0),
  landings int not null default 1 check (landings >= 0),
  pic_name text,
  notes text,
  client_id uuid,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text,
  check (block_on > block_off)
);
create unique index if not exists aircraft_flights_client_idx on public.aircraft_flights (vessel_id, client_id) where client_id is not null;
create index if not exists aircraft_flights_vessel_idx on public.aircraft_flights (vessel_id, block_off);
alter table public.aircraft_flights enable row level security;
-- Read by the members of any project on the aircraft (the tech log and its checks).
create policy aircraft_flights_read on public.aircraft_flights for select
  using (exists (select 1 from projects p where p.vessel_id = aircraft_flights.vessel_id and current_actor_role(p.id) is not null));
revoke all on public.aircraft_flights from anon, authenticated;
grant select on public.aircraft_flights to authenticated;

alter table public.part_readings add column if not exists flight_id uuid references public.aircraft_flights(id);

-- The hours a flight adds to the airframe: airborne when known, else block.
create or replace function public.flight_hours(f aircraft_flights)
returns numeric
language sql
immutable
as $$
  select round(coalesce(f.air_minutes, f.block_minutes)::numeric / 60, 2);
$$;

-- The aircraft's totals: its hours and landings at entry plus the flights that stand.
create or replace function public.aircraft_totals_for(p_vessel_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'hours_at_entry', coalesce((v.details ->> 'hours_at_entry')::numeric, 0),
    'landings_at_entry', coalesce((v.details ->> 'landings_at_entry')::numeric, 0),
    'flights', (select count(*) from aircraft_flights f where f.vessel_id = v.id and f.voided_at is null),
    'flight_hours', (select coalesce(sum(flight_hours(f)), 0) from aircraft_flights f where f.vessel_id = v.id and f.voided_at is null),
    'landings', (select coalesce(sum(f.landings), 0) from aircraft_flights f where f.vessel_id = v.id and f.voided_at is null),
    'total_hours', coalesce((v.details ->> 'hours_at_entry')::numeric, 0)
                   + (select coalesce(sum(flight_hours(f)), 0) from aircraft_flights f where f.vessel_id = v.id and f.voided_at is null),
    'total_landings', coalesce((v.details ->> 'landings_at_entry')::numeric, 0)
                   + (select coalesce(sum(f.landings), 0) from aircraft_flights f where f.vessel_id = v.id and f.voided_at is null))
  from vessels v where v.id = p_vessel_id;
$$;
revoke execute on function public.aircraft_totals_for(uuid) from anon, authenticated, public;

create or replace function public.aircraft_totals(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_vessel uuid;
begin
  if current_actor_role(p_project_id) is null then
    raise exception 'You are not a member of this project' using errcode = 'P0001';
  end if;
  select vessel_id into v_vessel from projects where id = p_project_id;
  if v_vessel is null or (select asset_kind from vessels where id = v_vessel) <> 'AIRCRAFT' then
    raise exception 'This project''s asset is not an aircraft' using errcode = 'P0001';
  end if;
  return aircraft_totals_for(v_vessel);
end;
$$;
revoke execute on function public.aircraft_totals(uuid) from anon, public;
grant execute on function public.aircraft_totals(uuid) to authenticated;

-- Re-records the airframe's hours reading for every standing flight from
-- p_from on, in order: the reading a flight made before is voided with the
-- reason and a new one recorded at the flight's block-on time. Called when a
-- flight is entered out of order or voided, so total time stays the sum.
create or replace function public.aircraft_rerecord_hours(p_project_id uuid, p_vessel_id uuid, p_from timestamptz, p_reason text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_airframe uuid;
  v_base numeric;
  v_f aircraft_flights;
  v_total numeric;
  v_n int := 0;
begin
  select id into v_airframe from parts
   where vessel_id = p_vessel_id and parent_id is null and lower(name) = 'airframe' and removed_at is null limit 1;
  if v_airframe is null then
    insert into parts (vessel_id, name, category, created_by, created_by_name, notes)
    values (p_vessel_id, 'Airframe', 'AIRFRAME', current_actor_id(), current_actor_name(),
            'Created by the tech log: its hours reading is the aircraft''s total time.')
    returning id into v_airframe;
  end if;
  v_base := coalesce((select (details ->> 'hours_at_entry')::numeric from vessels where id = p_vessel_id), 0);
  for v_f in select * from aircraft_flights where vessel_id = p_vessel_id and voided_at is null and block_off >= p_from order by block_off, created_at loop
    select v_base + coalesce(sum(flight_hours(f)), 0) into v_total from aircraft_flights f
     where f.vessel_id = p_vessel_id and f.voided_at is null
       and (f.block_off < v_f.block_off or (f.block_off = v_f.block_off and f.created_at <= v_f.created_at));
    update part_readings set voided_at = now(), voided_by_name = current_actor_name(), void_reason = p_reason
     where flight_id = v_f.id and voided_at is null and value <> v_total;
    if not exists (select 1 from part_readings where flight_id = v_f.id and voided_at is null) then
      insert into part_readings (vessel_id, part_id, project_id, kind, value, unit, read_at, note, flight_id, recorded_by, recorded_by_name)
      values (p_vessel_id, v_airframe, p_project_id, 'RUNNING_HOURS', v_total, 'h', v_f.block_on,
              'Total time after ' || v_f.departure || ' - ' || v_f.arrival || ' on ' || v_f.flight_date, v_f.id,
              current_actor_id(), current_actor_name());
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.aircraft_rerecord_hours(uuid, uuid, timestamptz, text) from anon, authenticated, public;

create or replace function public.action_record_flight(
  p_project_id uuid, p_flight_date date, p_departure text, p_arrival text,
  p_block_off timestamptz, p_block_on timestamptz,
  p_takeoff_at timestamptz default null, p_landing_at timestamptz default null,
  p_landings int default 1, p_pic_name text default null, p_notes text default null, p_client_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_kind text;
  v_dup aircraft_flights;
  v_after aircraft_flights;
  v_block int;
  v_air int;
begin
  perform require_permission('action_record_flight', v_project_id);
  select * into v_project from projects where id = v_project_id;
  select asset_kind into v_kind from vessels where id = v_project.vessel_id;
  if v_project.project_type <> 'OPERATIONS' or v_kind is distinct from 'AIRCRAFT' then
    raise exception 'Flights are recorded in an aircraft''s tech log' using errcode = 'P0001';
  end if;
  if p_client_id is not null then
    select * into v_dup from aircraft_flights where vessel_id = v_project.vessel_id and client_id = p_client_id;
    if found then return json_build_object('flight', row_to_json(v_dup), 'duplicate', true); end if;
  end if;
  if p_flight_date is null or p_block_off is null or p_block_on is null then
    raise exception 'A flight needs its date and block times' using errcode = 'P0001';
  end if;
  if p_block_on <= p_block_off then
    raise exception 'Block on is after block off' using errcode = 'P0001';
  end if;
  if p_block_on - p_block_off > interval '20 hours' then
    raise exception 'A flight of more than 20 hours block time is not plausible: check the times' using errcode = 'P0001';
  end if;
  if p_block_off > now() + interval '10 minutes' then
    raise exception 'A flight is recorded after it happens' using errcode = 'P0001';
  end if;
  if (p_takeoff_at is null) <> (p_landing_at is null) then
    raise exception 'Give both takeoff and landing times, or neither' using errcode = 'P0001';
  end if;
  if p_takeoff_at is not null and not (p_block_off <= p_takeoff_at and p_takeoff_at < p_landing_at and p_landing_at <= p_block_on) then
    raise exception 'Takeoff and landing fall between block off and block on' using errcode = 'P0001';
  end if;
  if coalesce(p_landings, 1) < 0 or coalesce(p_landings, 1) > 50 then
    raise exception 'Landings are between 0 and 50' using errcode = 'P0001';
  end if;
  v_block := ceil(extract(epoch from (p_block_on - p_block_off)) / 60)::int;
  v_air := case when p_takeoff_at is null then null else ceil(extract(epoch from (p_landing_at - p_takeoff_at)) / 60)::int end;

  insert into aircraft_flights (project_id, vessel_id, flight_date, departure, arrival, block_off, block_on, takeoff_at, landing_at,
                                block_minutes, air_minutes, landings, pic_name, notes, client_id, recorded_by, recorded_by_name)
  values (v_project_id, v_project.vessel_id, p_flight_date, upper(trim(p_departure)), upper(trim(p_arrival)), p_block_off, p_block_on,
          p_takeoff_at, p_landing_at, v_block, v_air, coalesce(p_landings, 1), nullif(trim(coalesce(p_pic_name, '')), ''),
          nullif(trim(coalesce(p_notes, '')), ''), p_client_id, current_actor_id(), current_actor_name())
  returning * into v_after;

  perform aircraft_rerecord_hours(v_project_id, v_project.vessel_id, v_after.block_off,
    'Recomputed: a flight of ' || v_after.flight_date || ' was entered before it');
  insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (v_project_id, 'FLIGHT_RECORDED', 'FLIGHT', v_after.id, null, to_jsonb(v_after) - 'created_at', current_actor_id(), current_actor_name());
  return json_build_object('flight', row_to_json(v_after), 'duplicate', false, 'totals', aircraft_totals_for(v_project.vessel_id));
end;
$$;

create or replace function public.action_void_flight(p_project_id uuid, p_flight_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_before aircraft_flights;
  v_after aircraft_flights;
begin
  perform require_permission('action_void_flight', v_project_id);
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the flight is wrong' using errcode = 'P0001';
  end if;
  select f.* into v_before from aircraft_flights f join projects p on p.vessel_id = f.vessel_id
   where f.id = p_flight_id and p.id = v_project_id for update of f;
  if not found then raise exception 'No flight with that id on this aircraft' using errcode = 'P0001'; end if;
  if v_before.voided_at is not null then raise exception 'That flight was already voided' using errcode = 'P0001'; end if;
  update aircraft_flights set voided_at = now(), voided_by_name = current_actor_name(), void_reason = trim(p_reason)
   where id = v_before.id returning * into v_after;
  update part_readings set voided_at = now(), voided_by_name = current_actor_name(), void_reason = 'Flight voided: ' || trim(p_reason)
   where flight_id = v_before.id and voided_at is null;
  perform aircraft_rerecord_hours(v_project_id, v_before.vessel_id, v_before.block_off,
    'Recomputed: the flight of ' || v_before.flight_date || ' was voided');
  insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (v_project_id, 'FLIGHT_VOIDED', 'FLIGHT', v_after.id, to_jsonb(v_before) - 'created_at', to_jsonb(v_after) - 'created_at',
          current_actor_id(), current_actor_name());
  return json_build_object('flight', row_to_json(v_after), 'totals', aircraft_totals_for(v_before.vessel_id));
end;
$$;

insert into action_permissions (action_key, role)
values ('action_record_flight', 'OWNER'), ('action_record_flight', 'OWNERS_REP'), ('action_record_flight', 'CAPTAIN'), ('action_record_flight', 'CREW'),
       ('action_void_flight', 'OWNER'), ('action_void_flight', 'OWNERS_REP'), ('action_void_flight', 'CAPTAIN')
on conflict do nothing;

-- 3. The tech log -------------------------------------------------------------------------------------
-- An aircraft's record in service: an OPERATIONS project "<name> · Tech log".
create or replace function public.action_open_tech_log(p_from_project_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_from projects;
  v_asset vessels;
  v_role user_role;
  v_project projects;
begin
  if v_email is null then raise exception 'You must be signed in' using errcode = 'P0001'; end if;
  v_role := current_actor_role(p_from_project_id);
  if v_role is null then raise exception 'You are not a member of that project' using errcode = 'P0001'; end if;
  if v_role not in ('OWNER', 'OWNERS_REP', 'CAPTAIN') then
    raise exception 'Only the owner, the owner''s representative or the captain can open an aircraft''s tech log' using errcode = 'P0001';
  end if;
  select * into v_from from projects where id = p_from_project_id;
  if v_from.vessel_id is null then raise exception 'Record the aircraft on this project first' using errcode = 'P0001'; end if;
  select * into v_asset from vessels where id = v_from.vessel_id;
  if v_asset.asset_kind <> 'AIRCRAFT' then
    raise exception 'This project''s asset is a %, not an aircraft', lower(v_asset.asset_kind) using errcode = 'P0001';
  end if;
  if exists (select 1 from projects where vessel_id = v_asset.id and project_type = 'OPERATIONS') then
    raise exception 'This aircraft already has a tech log. Ask its owner to invite you.' using errcode = 'P0001';
  end if;
  insert into projects (vessel_id, name, project_type, phase)
  values (v_asset.id, v_asset.name || ' · Tech log', 'OPERATIONS', 'IN_SERVICE')
  returning * into v_project;
  insert into project_members (project_id, user_id, role, name, email, status, first_seen_at, last_seen_at)
  values (v_project.id, current_actor_id(), v_role, coalesce(current_actor_name(), v_email), v_email, 'ACTIVE', now(), now());
  insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (v_project.id, 'PROJECT_CREATED', 'PROJECT', v_project.id, null,
          jsonb_build_object('name', v_project.name, 'project_type', 'OPERATIONS', 'asset', v_asset.name, 'asset_kind', 'AIRCRAFT',
                             'opened_from', p_from_project_id),
          current_actor_id(), current_actor_name());
  return json_build_object('project', row_to_json(v_project));
end;
$$;
revoke execute on function public.action_open_tech_log(uuid) from anon, public;
grant execute on function public.action_open_tech_log(uuid) to authenticated;

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('FLIGHT', 'Flight', 'aircraft_flights',
  'A flight in an aircraft''s tech log: date, departure and arrival, block off/on, takeoff/landing, landings, pilot in command. Airborne time (block when not given) adds to the airframe''s total time, recorded as the Airframe part''s hours reading. Voided with a reason, never edited.', 49)
on conflict do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select 'FLIGHT'::object_type, 'VESSEL'::object_type, 'was flown by', 'MANY_TO_ONE', 'vessel_id'
 where not exists (select 1 from ontology_links where from_type::text = 'FLIGHT' and via_column = 'vessel_id');

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values ('action_record_flight', 'Record a flight',
  'Records a flight in the aircraft''s tech log (an OPERATIONS project on an AIRCRAFT). Times are ISO timestamps with time zone. Airborne time (takeoff to landing) adds to total time; when takeoff and landing are not given, block time does. The airframe''s hours reading is updated, so hour-based maintenance moves.',
  'FLIGHT',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_flight_date', 'type', 'date', 'required', true),
    jsonb_build_object('name', 'p_departure', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_arrival', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_block_off', 'type', 'timestamptz', 'required', true),
    jsonb_build_object('name', 'p_block_on', 'type', 'timestamptz', 'required', true),
    jsonb_build_object('name', 'p_takeoff_at', 'type', 'timestamptz'),
    jsonb_build_object('name', 'p_landing_at', 'type', 'timestamptz'),
    jsonb_build_object('name', 'p_landings', 'type', 'int'),
    jsonb_build_object('name', 'p_pic_name', 'type', 'text'),
    jsonb_build_object('name', 'p_notes', 'type', 'text')
  ), '{PART_READING}', true)
on conflict (key) do nothing;

-- 4. Wording (aircraft_4_kind_article): "an aircraft", not "a aircraft".
create or replace function public.require_vessel_kind(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_noun text;
begin
  select v.asset_kind into v_kind from projects p join vessels v on v.id = p.vessel_id where p.id = p_project_id;
  if v_kind is not null and v_kind <> 'VESSEL' then
    v_noun := case v_kind when 'AIRCRAFT' then 'an aircraft' else 'a ' || lower(v_kind) end;
    raise exception 'This project''s asset is %, not a boat: this is for boats only (record % with action_set_project_asset)',
      v_noun, v_noun using errcode = 'P0001';
  end if;
end;
$$;
