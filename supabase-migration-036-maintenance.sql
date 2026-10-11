-- Migration 036: readings on parts, service intervals and maintenance done.
--
-- Phase 3 of the logbook merge. An engineer writes "main engine 4,312 h";
-- that reading lands on the part, the part's service intervals ("oil and
-- filter every 250 h or 12 months") say what is due, and the 3D view and the
-- agent see it. Nothing here is ever deleted or edited in place:
--
--   part_readings     one meter reading on a part (running hours, fuel...)
--   service_intervals what a part needs and how often; changed with a
--                     before/after event, retired with a reason
--   service_records   maintenance done on a part, against an interval or not
--
-- Readings and service records are struck out with a reason (voided), like
-- log entries. All three belong to the VESSEL, not to one project: the
-- engine's hours are the same fact for the crew, the yard and the next owner,
-- so any member of any project on the vessel can read them (can_read_part).
-- Each write is recorded in world_model_events on the project it was made
-- from; on a boat's logbook it is also written as a log entry, so the log
-- shows "Main engine: 4,312 h" in its place in the day.
--
-- client_id: the browser's own id for a write. A write sent twice (a phone
-- that lost signal after sending, an offline queue replayed) is recorded
-- once and the first row returned, so nothing is lost and nothing doubles.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: maintenance_0_enum,
-- maintenance_1_tables, maintenance_2_actions, maintenance_3_due,
-- maintenance_4_permissions_registry, maintenance_5_reading_order (readings
-- taken at the same moment ordered by value) and maintenance_6_hours_since
-- (service_due counts hours run reading by reading). The first service_due,
-- which had no hours_since column, was renamed service_due_superseded_036
-- and its execute right revoked rather than dropped; nothing ever read it.

-- 0. Object types (an enum value must be committed before it is used) -------------
alter type object_type add value if not exists 'READING';
alter type object_type add value if not exists 'SERVICE_INTERVAL';
alter type object_type add value if not exists 'SERVICE_RECORD';

-- 1. Tables ---------------------------------------------------------------------------
create table if not exists public.part_readings (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid not null references public.vessels(id),
  part_id uuid not null references public.parts(id),
  project_id uuid not null references public.projects(id),
  kind text not null default 'RUNNING_HOURS'
    check (kind in ('RUNNING_HOURS', 'FUEL_LEVEL', 'OTHER')),
  value numeric not null check (value >= 0),
  unit text not null,
  read_at timestamptz not null,
  note text,
  -- Set when a reading goes backwards (a meter replaced or reset).
  reset_reason text,
  log_entry_id uuid references public.log_entries(id),
  client_id uuid unique,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index if not exists part_readings_part_idx on public.part_readings (part_id, kind, read_at desc);
create index if not exists part_readings_vessel_idx on public.part_readings (vessel_id, read_at desc);

create table if not exists public.service_intervals (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid not null references public.vessels(id),
  part_id uuid not null references public.parts(id),
  project_id uuid not null references public.projects(id),
  title text not null check (length(trim(title)) >= 3),
  every_hours numeric check (every_hours is null or every_hours > 0),
  every_days int check (every_days is null or every_days > 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz,
  updated_by_name text,
  retired_at timestamptz,
  retired_by_name text,
  retired_reason text,
  check (every_hours is not null or every_days is not null)
);
create index if not exists service_intervals_vessel_idx on public.service_intervals (vessel_id);
create index if not exists service_intervals_part_idx on public.service_intervals (part_id);

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid not null references public.vessels(id),
  part_id uuid not null references public.parts(id),
  interval_id uuid references public.service_intervals(id),
  project_id uuid not null references public.projects(id),
  done_on date not null,
  hours_at numeric check (hours_at is null or hours_at >= 0),
  note text,
  -- True for the "last done" given when an interval was set up: what was
  -- known before YAM, not work recorded here.
  is_baseline boolean not null default false,
  log_entry_id uuid references public.log_entries(id),
  work_package_id uuid references public.work_packages(id),
  client_id uuid unique,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index if not exists service_records_interval_idx on public.service_records (interval_id, done_on desc);
create index if not exists service_records_part_idx on public.service_records (part_id, done_on desc);

alter table public.part_readings enable row level security;
alter table public.service_intervals enable row level security;
alter table public.service_records enable row level security;
create policy part_readings_read on public.part_readings for select using (can_read_part(vessel_id, null));
create policy service_intervals_read on public.service_intervals for select using (can_read_part(vessel_id, null));
create policy service_records_read on public.service_records for select using (can_read_part(vessel_id, null));
revoke all on public.part_readings, public.service_intervals, public.service_records from anon, authenticated;
grant select on public.part_readings, public.service_intervals, public.service_records to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.part_readings;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.service_intervals;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.service_records;
exception when duplicate_object then null;
end $$;

-- 2. Actions --------------------------------------------------------------------------

-- The part, checked to be a current part of the project's vessel.
create or replace function public.vessel_part(p_project_id uuid, p_part_id uuid)
returns parts
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_part parts;
begin
  select * into v_part from parts where id = p_part_id;
  if not found or not part_is_on_project(v_part, p_project_id) or v_part.vessel_id is null then
    raise exception 'That part is not on this vessel' using errcode = 'P0001';
  end if;
  if v_part.removed_at is not null then
    raise exception '"%" was removed from the vessel', v_part.name using errcode = 'P0001';
  end if;
  return v_part;
end;
$$;
revoke execute on function public.vessel_part(uuid, uuid) from anon, public;

-- On a logbook, a reading or a service is also an entry in the day's log.
-- Returns the entry's id, or null when the project is not a logbook.
create or replace function public.log_alongside(
  p_project_id uuid, p_kind log_entry_kind, p_body text, p_when timestamptz, p_part_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project projects;
  v_entry log_entries;
begin
  select * into v_project from projects where id = p_project_id;
  if v_project.project_type <> 'OPERATIONS' then
    return null;
  end if;
  insert into log_entries (project_id, vessel_id, occurred_at, kind, body, part_id, author_id, author_name)
  values (p_project_id, v_project.vessel_id, p_when, p_kind, p_body, p_part_id, current_actor_id(), current_actor_name())
  returning * into v_entry;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    p_project_id, 'LOG_ENTRY_WRITTEN', 'LOG_ENTRY', v_entry.id, null,
    jsonb_build_object('kind', v_entry.kind, 'occurred_at', v_entry.occurred_at,
                       'body', v_entry.body, 'part_id', v_entry.part_id),
    current_actor_id(), current_actor_name()
  );
  return v_entry.id;
end;
$$;
revoke execute on function public.log_alongside(uuid, log_entry_kind, text, timestamptz, uuid) from anon, public;

-- Records a meter reading on a part.
create or replace function public.action_record_reading(
  p_project_id uuid,
  p_part_id uuid,
  p_value numeric,
  p_kind text default 'RUNNING_HOURS',
  p_unit text default null,
  p_read_at timestamptz default null,
  p_note text default null,
  p_reset_reason text default null,
  p_client_id uuid default null
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
  v_part parts;
  v_kind text := upper(coalesce(nullif(trim(p_kind), ''), 'RUNNING_HOURS'));
  v_unit text;
  v_when timestamptz := coalesce(p_read_at, now());
  v_reset text := nullif(trim(coalesce(p_reset_reason, '')), '');
  v_prev part_readings;
  v_next part_readings;
  v_after part_readings;
  v_entry uuid;
begin
  perform require_permission('action_record_reading', v_project_id);

  -- Sent before: return what was recorded the first time.
  if p_client_id is not null then
    select * into v_after from part_readings where client_id = p_client_id;
    if found then
      return json_build_object('reading', row_to_json(v_after), 'duplicate', true);
    end if;
  end if;

  v_part := vessel_part(v_project_id, p_part_id);
  if v_kind not in ('RUNNING_HOURS', 'FUEL_LEVEL', 'OTHER') then
    raise exception 'A reading is RUNNING_HOURS, FUEL_LEVEL or OTHER' using errcode = 'P0001';
  end if;
  if p_value is null or p_value < 0 then
    raise exception 'A reading is a number of zero or more' using errcode = 'P0001';
  end if;
  v_unit := coalesce(nullif(trim(coalesce(p_unit, '')), ''), case v_kind when 'RUNNING_HOURS' then 'h' when 'FUEL_LEVEL' then 'L' end);
  if v_unit is null then
    raise exception 'Say what the reading is measured in' using errcode = 'P0001';
  end if;
  if v_when > now() + interval '10 minutes' then
    raise exception 'A reading records what the meter showed, not what it will show' using errcode = 'P0001';
  end if;

  -- A running-hours meter only goes up, so among readings taken at the same
  -- moment the highest is the latest. A lower figure than an earlier
  -- reading (or a higher one than a later reading) means the meter was
  -- replaced or reset: that is allowed, but only with the reason recorded.
  if v_kind = 'RUNNING_HOURS' then
    select * into v_prev from part_readings
     where part_id = p_part_id and kind = 'RUNNING_HOURS' and voided_at is null and read_at <= v_when
     order by read_at desc, created_at desc, value desc limit 1;
    select * into v_next from part_readings
     where part_id = p_part_id and kind = 'RUNNING_HOURS' and voided_at is null and read_at > v_when
     order by read_at asc, created_at asc, value asc limit 1;
    if ((v_prev.id is not null and p_value < v_prev.value) or (v_next.id is not null and p_value > v_next.value))
       and v_reset is null then
      raise exception '% h is out of step with the readings around it (% h before, % after). If the meter was replaced or reset, say so.',
        p_value, coalesce(v_prev.value::text, '-'), coalesce(v_next.value::text || ' h', 'none')
        using errcode = 'P0001';
    end if;
  end if;

  v_entry := log_alongside(
    v_project_id, 'ENGINE',
    v_part.name || ': ' || to_char(p_value, 'FM999,999,990.##') || ' ' || v_unit
      || case v_kind when 'RUNNING_HOURS' then ' (running hours)' when 'FUEL_LEVEL' then ' (fuel)' else '' end
      || coalesce('. ' || nullif(trim(coalesce(p_note, '')), ''), '')
      || coalesce(' Meter replaced or reset: ' || v_reset, ''),
    v_when, v_part.id
  );

  insert into part_readings (
    vessel_id, part_id, project_id, kind, value, unit, read_at, note, reset_reason,
    log_entry_id, client_id, recorded_by, recorded_by_name
  ) values (
    v_part.vessel_id, v_part.id, v_project_id, v_kind, p_value, v_unit, v_when,
    nullif(trim(coalesce(p_note, '')), ''), v_reset, v_entry, p_client_id, v_actor_id, v_actor_name
  ) returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'READING_RECORDED', 'READING', v_after.id,
    case when v_prev.id is null then null
         else jsonb_build_object('value', v_prev.value, 'read_at', v_prev.read_at) end,
    jsonb_build_object('part_id', v_part.id, 'part', v_part.name, 'kind', v_kind, 'value', p_value,
                       'unit', v_unit, 'read_at', v_when, 'reset_reason', v_reset, 'log_entry_id', v_entry),
    v_actor_id, v_actor_name
  );

  return json_build_object('reading', row_to_json(v_after), 'duplicate', false);
end;
$$;

-- Strikes out a reading entered wrongly. It stays readable; so does its log entry.
create or replace function public.action_void_reading(p_project_id uuid, p_reading_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before part_readings;
  v_after part_readings;
begin
  perform require_permission('action_record_reading', v_project_id);
  select * into v_before from part_readings r
   where r.id = p_reading_id
     and r.vessel_id = (select vessel_id from projects where id = v_project_id)
   for update;
  if not found then
    raise exception 'No reading with that id on this vessel' using errcode = 'P0001';
  end if;
  if v_before.voided_at is not null then
    raise exception 'That reading is already struck out' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the reading is struck out' using errcode = 'P0001';
  end if;

  update part_readings set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
   where id = v_before.id returning * into v_after;
  if v_before.log_entry_id is not null then
    update log_entries set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
     where id = v_before.log_entry_id and voided_at is null;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'READING_VOIDED', 'READING', v_after.id,
    jsonb_build_object('value', v_before.value, 'unit', v_before.unit, 'read_at', v_before.read_at),
    jsonb_build_object('voided_at', v_after.voided_at, 'reason', v_reason),
    current_actor_id(), v_actor_name
  );
  return json_build_object('reading', row_to_json(v_after));
end;
$$;

-- Sets up what a part needs and how often, or changes it. A change records
-- before and after, and needs a reason once the interval has been used.
create or replace function public.action_set_service_interval(
  p_project_id uuid,
  p_part_id uuid,
  p_title text,
  p_every_hours numeric default null,
  p_every_days int default null,
  p_notes text default null,
  p_interval_id uuid default null,
  p_last_done_on date default null,
  p_last_done_hours numeric default null,
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
  v_part parts;
  v_before service_intervals;
  v_after service_intervals;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_baseline service_records;
begin
  perform require_permission('action_set_service_interval', v_project_id);
  v_part := vessel_part(v_project_id, p_part_id);
  if nullif(trim(coalesce(p_title, '')), '') is null or length(trim(p_title)) < 3 then
    raise exception 'Say what the service is (e.g. "Oil and filter change")' using errcode = 'P0001';
  end if;
  if p_every_hours is null and p_every_days is null then
    raise exception 'Give an interval in running hours, in days, or both' using errcode = 'P0001';
  end if;
  if coalesce(p_every_hours, 1) <= 0 or coalesce(p_every_days, 1) <= 0 then
    raise exception 'An interval is more than zero' using errcode = 'P0001';
  end if;
  if p_last_done_on is not null and p_last_done_on > current_date then
    raise exception 'The last service cannot be in the future' using errcode = 'P0001';
  end if;
  if p_last_done_hours is not null and p_last_done_hours < 0 then
    raise exception 'Running hours are zero or more' using errcode = 'P0001';
  end if;

  if p_interval_id is not null then
    select * into v_before from service_intervals where id = p_interval_id and vessel_id = v_part.vessel_id for update;
    if not found then
      raise exception 'No service interval with that id on this vessel' using errcode = 'P0001';
    end if;
    if v_before.retired_at is not null then
      raise exception 'That interval was retired; set up a new one' using errcode = 'P0001';
    end if;
    if v_reason is null and exists (select 1 from service_records where interval_id = v_before.id and voided_at is null and not is_baseline) then
      raise exception 'Say why the interval is changing: services have been recorded against it' using errcode = 'P0001';
    end if;
    update service_intervals set
      part_id = v_part.id,
      title = trim(p_title),
      every_hours = p_every_hours,
      every_days = p_every_days,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now(), updated_by_name = v_actor_name
    where id = v_before.id returning * into v_after;
  else
    insert into service_intervals (
      vessel_id, part_id, project_id, title, every_hours, every_days, notes, created_by, created_by_name
    ) values (
      v_part.vessel_id, v_part.id, v_project_id, trim(p_title), p_every_hours, p_every_days,
      nullif(trim(coalesce(p_notes, '')), ''), v_actor_id, v_actor_name
    ) returning * into v_after;
  end if;

  -- When it was last done, as the person setting it up knows it: kept as a
  -- baseline service record so the due date has somewhere to count from.
  if p_last_done_on is not null or p_last_done_hours is not null then
    insert into service_records (
      vessel_id, part_id, interval_id, project_id, done_on, hours_at, note, is_baseline,
      recorded_by, recorded_by_name
    ) values (
      v_part.vessel_id, v_part.id, v_after.id, v_project_id, coalesce(p_last_done_on, current_date),
      p_last_done_hours, 'Last done before it was recorded in YAM, as stated when the interval was set up',
      true, v_actor_id, v_actor_name
    ) returning * into v_baseline;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id,
    case when v_before.id is null then 'SERVICE_INTERVAL_SET' else 'SERVICE_INTERVAL_CHANGED' end,
    'SERVICE_INTERVAL', v_after.id,
    case when v_before.id is null then null else to_jsonb(v_before) - 'created_at' - 'updated_at' end,
    (to_jsonb(v_after) - 'created_at' - 'updated_at')
      || jsonb_build_object('part', v_part.name, 'reason', v_reason,
                            'last_done_on', v_baseline.done_on, 'last_done_hours', v_baseline.hours_at),
    v_actor_id, v_actor_name
  );

  return json_build_object('interval', row_to_json(v_after));
end;
$$;

-- An interval no longer applies (part replaced, maker changed the schedule).
-- Kept, with its services, and the reason.
create or replace function public.action_retire_service_interval(p_project_id uuid, p_interval_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before service_intervals;
  v_after service_intervals;
begin
  perform require_permission('action_set_service_interval', v_project_id);
  select * into v_before from service_intervals
   where id = p_interval_id and vessel_id = (select vessel_id from projects where id = v_project_id)
   for update;
  if not found then
    raise exception 'No service interval with that id on this vessel' using errcode = 'P0001';
  end if;
  if v_before.retired_at is not null then
    raise exception 'That interval is already retired' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the interval no longer applies' using errcode = 'P0001';
  end if;
  update service_intervals set retired_at = now(), retired_by_name = v_actor_name, retired_reason = v_reason
   where id = v_before.id returning * into v_after;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SERVICE_INTERVAL_RETIRED', 'SERVICE_INTERVAL', v_after.id,
    jsonb_build_object('title', v_before.title, 'every_hours', v_before.every_hours, 'every_days', v_before.every_days),
    jsonb_build_object('retired_at', v_after.retired_at, 'reason', v_reason),
    current_actor_id(), v_actor_name
  );
  return json_build_object('interval', row_to_json(v_after));
end;
$$;

-- Records maintenance done on a part. Running hours at the time are taken
-- from p_hours_at when given (and recorded as a reading too), otherwise from
-- the last reading on or before the day.
create or replace function public.action_record_service(
  p_project_id uuid,
  p_part_id uuid,
  p_interval_id uuid default null,
  p_done_on date default null,
  p_hours_at numeric default null,
  p_note text default null,
  p_work_package_id uuid default null,
  p_client_id uuid default null
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
  v_part parts;
  v_interval service_intervals;
  v_done date := coalesce(p_done_on, current_date);
  v_hours numeric := p_hours_at;
  v_last part_readings;
  v_after service_records;
  v_entry uuid;
  v_what text;
begin
  perform require_permission('action_record_service', v_project_id);

  if p_client_id is not null then
    select * into v_after from service_records where client_id = p_client_id;
    if found then
      return json_build_object('service', row_to_json(v_after), 'duplicate', true);
    end if;
  end if;

  v_part := vessel_part(v_project_id, p_part_id);
  if v_done > current_date then
    raise exception 'Record maintenance once it is done' using errcode = 'P0001';
  end if;
  if p_interval_id is not null then
    select * into v_interval from service_intervals where id = p_interval_id and part_id = v_part.id;
    if not found then
      raise exception 'That service interval is not for this part' using errcode = 'P0001';
    end if;
    if v_interval.retired_at is not null then
      raise exception 'That interval was retired' using errcode = 'P0001';
    end if;
  end if;
  if p_work_package_id is not null and not exists (
    select 1 from work_packages w join projects p on p.id = w.project_id
     where w.id = p_work_package_id and p.vessel_id = v_part.vessel_id and is_project_member(p.id)
  ) then
    raise exception 'That work package is not on this vessel' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null and p_interval_id is null then
    raise exception 'Say what was done' using errcode = 'P0001';
  end if;

  select * into v_last from part_readings
   where part_id = v_part.id and kind = 'RUNNING_HOURS' and voided_at is null
     and read_at < (v_done + 1)::timestamptz
   order by read_at desc, created_at desc, value desc limit 1;
  if v_hours is null then
    v_hours := v_last.value;
  elsif v_last.id is null or v_hours <> v_last.value then
    -- The hours given with the service are a reading in their own right.
    perform action_record_reading(
      v_project_id, v_part.id, v_hours, 'RUNNING_HOURS', 'h',
      case when v_done = current_date then now() else (v_done + 1)::timestamptz - interval '1 second' end,
      'Read when ' || coalesce(v_interval.title, 'maintenance') || ' was done', null, null
    );
  end if;

  v_what := coalesce(v_interval.title, trim(p_note));
  v_entry := log_alongside(
    v_project_id, 'MAINTENANCE',
    v_part.name || ': ' || v_what || ' done'
      || coalesce(' at ' || to_char(v_hours, 'FM999,999,990.##') || ' h', '')
      || case when v_interval.id is not null and nullif(trim(coalesce(p_note, '')), '') is not null then '. ' || trim(p_note) else '' end,
    case when v_done = current_date then now() else (v_done + 1)::timestamptz - interval '1 second' end,
    v_part.id
  );

  insert into service_records (
    vessel_id, part_id, interval_id, project_id, done_on, hours_at, note,
    log_entry_id, work_package_id, client_id, recorded_by, recorded_by_name
  ) values (
    v_part.vessel_id, v_part.id, v_interval.id, v_project_id, v_done, v_hours,
    nullif(trim(coalesce(p_note, '')), ''), v_entry, p_work_package_id, p_client_id, v_actor_id, v_actor_name
  ) returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SERVICE_RECORDED', 'SERVICE_RECORD', v_after.id, null,
    jsonb_build_object('part_id', v_part.id, 'part', v_part.name, 'interval_id', v_interval.id,
                       'interval', v_interval.title, 'done_on', v_done, 'hours_at', v_hours,
                       'note', v_after.note, 'work_package_id', p_work_package_id, 'log_entry_id', v_entry),
    v_actor_id, v_actor_name
  );

  return json_build_object('service', row_to_json(v_after), 'duplicate', false);
end;
$$;

-- Strikes out a service record entered wrongly; it stays readable.
create or replace function public.action_void_service_record(p_project_id uuid, p_record_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before service_records;
  v_after service_records;
begin
  perform require_permission('action_record_service', v_project_id);
  select * into v_before from service_records
   where id = p_record_id and vessel_id = (select vessel_id from projects where id = v_project_id)
   for update;
  if not found then
    raise exception 'No service record with that id on this vessel' using errcode = 'P0001';
  end if;
  if v_before.voided_at is not null then
    raise exception 'That service record is already struck out' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the service record is struck out' using errcode = 'P0001';
  end if;
  update service_records set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
   where id = v_before.id returning * into v_after;
  if v_before.log_entry_id is not null then
    update log_entries set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
     where id = v_before.log_entry_id and voided_at is null;
  end if;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SERVICE_RECORD_VOIDED', 'SERVICE_RECORD', v_after.id,
    jsonb_build_object('done_on', v_before.done_on, 'hours_at', v_before.hours_at, 'interval_id', v_before.interval_id),
    jsonb_build_object('voided_at', v_after.voided_at, 'reason', v_reason),
    current_actor_id(), v_actor_name
  );
  return json_build_object('service', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_record_reading(uuid, uuid, numeric, text, text, timestamptz, text, text, uuid) from anon, public;
revoke execute on function public.action_void_reading(uuid, uuid, text) from anon, public;
revoke execute on function public.action_set_service_interval(uuid, uuid, text, numeric, int, text, uuid, date, numeric, text) from anon, public;
revoke execute on function public.action_retire_service_interval(uuid, uuid, text) from anon, public;
revoke execute on function public.action_record_service(uuid, uuid, uuid, date, numeric, text, uuid, uuid) from anon, public;
revoke execute on function public.action_void_service_record(uuid, uuid, text) from anon, public;
grant execute on function public.action_record_reading(uuid, uuid, numeric, text, text, timestamptz, text, text, uuid) to authenticated;
grant execute on function public.action_void_reading(uuid, uuid, text) to authenticated;
grant execute on function public.action_set_service_interval(uuid, uuid, text, numeric, int, text, uuid, date, numeric, text) to authenticated;
grant execute on function public.action_retire_service_interval(uuid, uuid, text) to authenticated;
grant execute on function public.action_record_service(uuid, uuid, uuid, date, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.action_void_service_record(uuid, uuid, text) to authenticated;

-- A struck-out log entry that carried a reading or a service strikes those
-- out too, so the log and the part never disagree.
create or replace function public.action_void_log_entry(
  p_project_id uuid,
  p_entry_id uuid,
  p_reason text
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
  v_before log_entries;
  v_after log_entries;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_readings jsonb;
  v_services jsonb;
begin
  perform require_permission('action_add_log_entry', v_project_id);
  perform operations_project(v_project_id);

  select * into v_before from log_entries where id = p_entry_id and project_id = v_project_id;
  if not found then
    raise exception 'No entry with that id in this logbook' using errcode = 'P0001';
  end if;
  if v_before.voided_at is not null then
    raise exception 'That entry is already struck out' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the entry is struck out' using errcode = 'P0001';
  end if;
  if v_before.author_id is distinct from v_actor_id and current_actor_role(v_project_id) <> 'CAPTAIN' then
    raise exception 'Only the entry''s author or the captain can strike it out' using errcode = 'P0001';
  end if;

  update log_entries set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
   where id = p_entry_id returning * into v_after;

  with r as (
    update part_readings set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
     where log_entry_id = p_entry_id and voided_at is null returning id
  ) select coalesce(jsonb_agg(id), '[]') into v_readings from r;
  with s as (
    update service_records set voided_at = now(), voided_by_name = v_actor_name, void_reason = v_reason
     where log_entry_id = p_entry_id and voided_at is null returning id
  ) select coalesce(jsonb_agg(id), '[]') into v_services from s;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'LOG_ENTRY_VOIDED', 'LOG_ENTRY', v_after.id,
    jsonb_build_object('body', v_before.body, 'kind', v_before.kind),
    jsonb_build_object('voided_at', v_after.voided_at, 'reason', v_reason,
                       'readings_voided', v_readings, 'services_voided', v_services),
    v_actor_id, v_actor_name
  );

  return json_build_object('entry', row_to_json(v_after));
end;
$$;

-- 3. What is due ----------------------------------------------------------------------
-- One row per current interval on the project's vessel: when it was last
-- done, the part's running hours now, when it is next due and how close.
--
-- Hours run since the last service are added up reading by reading, so a
-- meter replaced or reset (a reading with reset_reason) starts a new count
-- instead of making the engine look new. The service's own moment is the
-- earlier of when it was recorded and the end of the day it was done.
-- SECURITY INVOKER: the caller's own read rights apply to every table used.
create or replace function public.service_due(p_project_id uuid)
returns table (
  interval_id uuid,
  part_id uuid,
  part_name text,
  title text,
  every_hours numeric,
  every_days int,
  last_done_on date,
  last_hours numeric,
  last_is_baseline boolean,
  hours_now numeric,
  hours_read_at timestamptz,
  hours_since numeric,
  due_hours numeric,
  hours_left numeric,
  due_on date,
  days_left int,
  status text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with v as (select vessel_id from projects where id = p_project_id and is_project_member(id)),
  i as (
    select si.* from service_intervals si, v
     where si.vessel_id = v.vessel_id and si.retired_at is null
  ),
  last as (
    select distinct on (sr.interval_id) sr.interval_id, sr.part_id, sr.done_on, sr.hours_at, sr.is_baseline,
           least(sr.created_at, (sr.done_on + 1)::timestamptz) as at
      from service_records sr join i on i.id = sr.interval_id
     where sr.voided_at is null
     order by sr.interval_id, sr.done_on desc, sr.created_at desc
  ),
  hrs as (
    select distinct on (r.part_id) r.part_id, r.value, r.read_at
      from part_readings r, v
     where r.vessel_id = v.vessel_id and r.kind = 'RUNNING_HOURS' and r.voided_at is null
     order by r.part_id, r.read_at desc, r.created_at desc, r.value desc
  ),
  -- The service's hours, then every reading after it, in order.
  seq as (
    select l.interval_id, l.at as read_at, 0 as ord, null::timestamptz as created_at, l.hours_at as value, null::text as reset_reason
      from last l where l.hours_at is not null
    union all
    select l.interval_id, r.read_at, 1, r.created_at, r.value, r.reset_reason
      from last l join part_readings r on r.part_id = l.part_id
     where l.hours_at is not null and r.kind = 'RUNNING_HOURS' and r.voided_at is null and r.read_at > l.at
  ),
  deltas as (
    select interval_id,
           case when ord = 0 or reset_reason is not null then 0
                else value - lag(value) over (partition by interval_id order by read_at, ord, created_at, value)
           end as d
      from seq
  ),
  since as (select interval_id, sum(d) as hours_since from deltas group by interval_id),
  calc as (
    select i.id as interval_id, i.part_id, p.name as part_name, i.title, i.every_hours, i.every_days,
           l.done_on as last_done_on, l.hours_at as last_hours, l.is_baseline as last_is_baseline,
           h.value as hours_now, h.read_at as hours_read_at, s.hours_since,
           case when i.every_hours is not null and s.hours_since is not null then i.every_hours - s.hours_since end as hours_left,
           case when i.every_days is not null and l.done_on is not null then l.done_on + i.every_days end as due_on
      from i
      join parts p on p.id = i.part_id
      left join last l on l.interval_id = i.id
      left join hrs h on h.part_id = i.part_id
      left join since s on s.interval_id = i.id
  )
  select c.interval_id, c.part_id, c.part_name, c.title, c.every_hours, c.every_days,
         c.last_done_on, c.last_hours, c.last_is_baseline, c.hours_now, c.hours_read_at, c.hours_since,
         -- The meter reading at which it falls due, on the meter as it is now.
         case when c.hours_left is not null and c.hours_now is not null then c.hours_now + c.hours_left end as due_hours,
         c.hours_left,
         c.due_on,
         case when c.due_on is not null then c.due_on - current_date end as days_left,
         case
           when c.last_done_on is null then 'NO_BASELINE'
           when (c.hours_left is not null and c.hours_left <= 0)
             or (c.due_on is not null and current_date >= c.due_on) then 'OVERDUE'
           -- Due soon: within a tenth of the interval, and at least 10 h / 14 days ahead.
           when (c.hours_left is not null and c.hours_left <= greatest(c.every_hours * 0.1, 10))
             or (c.due_on is not null and c.due_on - current_date <= greatest(ceil(c.every_days * 0.1)::int, 14)) then 'DUE_SOON'
           when c.every_days is null and c.hours_left is null then 'NO_READING'
           else 'OK'
         end as status
    from calc c
   order by case
              when c.last_done_on is null then 2
              when (c.hours_left is not null and c.hours_left <= 0)
                or (c.due_on is not null and current_date >= c.due_on) then 0
              else 1
            end,
            least(coalesce(c.due_on, current_date + 36500),
                  coalesce(current_date + (c.hours_left / 8)::int, current_date + 36500)),
            c.part_name, c.title;
$$;
revoke execute on function public.service_due(uuid) from anon, public;
grant execute on function public.service_due(uuid) to authenticated;

-- 4. Permissions and registry ---------------------------------------------------------
-- The people who run and service the boat. On a refit, the yard records the
-- services it does too.
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_record_reading', 'CAPTAIN'), ('action_record_reading', 'CREW'),
    ('action_record_reading', 'YARD_PM'), ('action_record_reading', 'OWNERS_REP'),
    ('action_record_service', 'CAPTAIN'), ('action_record_service', 'CREW'),
    ('action_record_service', 'YARD_PM'), ('action_record_service', 'OWNERS_REP'),
    ('action_set_service_interval', 'CAPTAIN'), ('action_set_service_interval', 'CREW'),
    ('action_set_service_interval', 'OWNER'), ('action_set_service_interval', 'OWNERS_REP'),
    ('action_set_service_interval', 'YARD_PM')
  ) as p(k, r)
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values
  ('READING', 'Reading', 'part_readings',
   'A meter reading on a part: running hours, fuel level or another quantity, when it was read and by whom. Running hours only go up unless a meter replacement or reset is recorded. Struck out with a reason, never deleted. Belongs to the vessel.', 34),
  ('SERVICE_INTERVAL', 'Service interval', 'service_intervals',
   'What a part needs and how often: every so many running hours, every so many days, or both. Changed with a recorded before and after, retired with a reason. Belongs to the vessel.', 35),
  ('SERVICE_RECORD', 'Service record', 'service_records',
   'Maintenance done on a part: when, at how many running hours, against which interval, by whom; linked to the log entry and work package. A baseline record holds when it was last done before YAM. Belongs to the vessel.', 36)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select f::object_type, t::object_type, l, c, v
  from (values
    ('READING', 'PART', 'was read on', 'MANY_TO_ONE', 'part_id'),
    ('READING', 'LOG_ENTRY', 'is written in the log as', 'ONE_TO_ONE', 'log_entry_id'),
    ('SERVICE_INTERVAL', 'PART', 'is due on', 'MANY_TO_ONE', 'part_id'),
    ('SERVICE_RECORD', 'PART', 'was done on', 'MANY_TO_ONE', 'part_id'),
    ('SERVICE_RECORD', 'SERVICE_INTERVAL', 'fulfils', 'MANY_TO_ONE', 'interval_id'),
    ('SERVICE_RECORD', 'WORK_PACKAGE', 'was done under', 'MANY_TO_ONE', 'work_package_id'),
    ('SERVICE_RECORD', 'LOG_ENTRY', 'is written in the log as', 'ONE_TO_ONE', 'log_entry_id')
  ) as x(f, t, l, c, v)
 where not exists (select 1 from ontology_links ol where ol.from_type::text = x.f and ol.to_type::text = x.t);

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_record_reading', 'Record a reading',
   'Records a meter reading on a part: running hours (default, in h), FUEL_LEVEL (L) or OTHER (give the unit). On a logbook it is also written as an ENGINE entry. A running-hours figure lower than an earlier reading needs p_reset_reason (meter replaced or reset).',
   'READING',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_value', 'type', 'numeric', 'required', true),
     jsonb_build_object('name', 'p_kind', 'type', 'text', 'enum', jsonb_build_array('RUNNING_HOURS', 'FUEL_LEVEL', 'OTHER')),
     jsonb_build_object('name', 'p_unit', 'type', 'text'),
     jsonb_build_object('name', 'p_read_at', 'type', 'timestamptz'),
     jsonb_build_object('name', 'p_note', 'type', 'text'),
     jsonb_build_object('name', 'p_reset_reason', 'type', 'text')
   ), '{LOG_ENTRY}', true),
  ('action_void_reading', 'Strike out a reading',
   'Strikes out a reading entered wrongly, with a reason; it stays readable, and so does its log entry (struck out too).',
   'READING',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reading_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false),
  ('action_set_service_interval', 'Set a service interval',
   'Sets up what a part needs and how often (p_every_hours of running hours and/or p_every_days), or changes one (p_interval_id; a reason is needed once services were recorded against it). p_last_done_on / p_last_done_hours record when it was last done before YAM, so the due date can be counted.',
   'SERVICE_INTERVAL',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_title', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_every_hours', 'type', 'numeric'),
     jsonb_build_object('name', 'p_every_days', 'type', 'integer'),
     jsonb_build_object('name', 'p_notes', 'type', 'text'),
     jsonb_build_object('name', 'p_interval_id', 'type', 'uuid'),
     jsonb_build_object('name', 'p_last_done_on', 'type', 'date'),
     jsonb_build_object('name', 'p_last_done_hours', 'type', 'numeric'),
     jsonb_build_object('name', 'p_reason', 'type', 'text')
   ), '{}', true),
  ('action_retire_service_interval', 'Retire a service interval',
   'An interval no longer applies (part replaced, schedule changed). Kept with its services and the reason.',
   'SERVICE_INTERVAL',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_interval_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false),
  ('action_record_service', 'Record maintenance done',
   'Records maintenance done on a part, against a service interval (p_interval_id) or described in p_note. Running hours at the time: p_hours_at (also recorded as a reading) or the last reading. On a logbook it is also written as a MAINTENANCE entry.',
   'SERVICE_RECORD',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_interval_id', 'type', 'uuid'),
     jsonb_build_object('name', 'p_done_on', 'type', 'date'),
     jsonb_build_object('name', 'p_hours_at', 'type', 'numeric'),
     jsonb_build_object('name', 'p_note', 'type', 'text'),
     jsonb_build_object('name', 'p_work_package_id', 'type', 'uuid')
   ), '{READING,LOG_ENTRY}', true),
  ('action_void_service_record', 'Strike out a service record',
   'Strikes out a service record entered wrongly, with a reason; it stays readable.',
   'SERVICE_RECORD',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_record_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false)
on conflict (key) do nothing;

-- The agent writes the log through the same audited actions as everyone else.
update ontology_actions set is_agent_usable = true
 where key in ('action_add_log_entry', 'action_raise_ncr_from_entry');
