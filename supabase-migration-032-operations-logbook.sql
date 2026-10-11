-- =============================================================================
-- YAM Migration 032 — THE BOAT'S DAY-TO-DAY: THE OPERATIONS LOGBOOK
--
-- The logbook comes into YAM (plan: "Digital Logbook Integration Plan";
-- direction: YAM-KNOWLEDGE.md §39). Phase 1: the operations project, crew,
-- the daily log with who was aboard, and timestamped entries.
--
-- 1. `OPERATIONS` is a project type. Each vessel has at most one, it never
--    closes, and its members are the boat's people. Access, permissions, the
--    event log, realtime and the agent then work for the logbook unchanged.
--    One person can be captain of one boat and crew on another: each boat's
--    records live in its own project and are read only by its members.
-- 2. `action_open_logbook` creates it: from a refit project with a vessel
--    (owner, owner's rep or captain there), or for a new boat by name (the
--    caller becomes captain). A second open is refused, so a boat's logbook
--    can only be joined by invitation from its captain.
-- 3. `crew`, `log_days`, `log_day_crew`, `log_entries`: read by members of
--    the operations project, written only by Actions. Entries are voided with
--    a reason, never edited or deleted; a day recorded again after it has
--    passed needs a reason. Everything lands in world_model_events.
-- 4. Captains invite crew through `action_set_crew` (CREW or CAPTAIN only, on
--    their own boat's logbook), not through action_invite_member, so being a
--    captain gives no power to add people to a refit project.
-- =============================================================================

-- 0. Enum values (applied first, on their own: a new enum value cannot be used
--    in the transaction that adds it) ----------------------------------------
alter type public.project_type add value if not exists 'OPERATIONS';
alter type public.project_phase add value if not exists 'IN_SERVICE';
alter type public.object_type add value if not exists 'CREW';
alter type public.object_type add value if not exists 'LOG_DAY';
alter type public.object_type add value if not exists 'LOG_ENTRY';

-- 1. Vocabulary and the one-per-vessel rule -----------------------------------
-- An operations project has one phase: the boat is in service. Where the
-- vessel is in her life (building, in service, laid up, sold, retired) is a
-- fact about the vessel, for a later migration, not a project phase.
insert into ontology_vocabulary (kind, value, applies_to, display_order)
select 'PHASE', 'IN_SERVICE', 'OPERATIONS', 1
 where not exists (
   select 1 from ontology_vocabulary
    where kind = 'PHASE' and value = 'IN_SERVICE' and applies_to = 'OPERATIONS'
 );

create unique index if not exists projects_one_operations_per_vessel
  on public.projects (vessel_id)
  where project_type = 'OPERATIONS' and vessel_id is not null;

-- 2. Tables -------------------------------------------------------------------
do $$ begin
  create type public.log_status as enum ('SEA_SERVICE', 'STANDBY', 'YARD');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('PRESENT', 'HOLIDAY', 'ABSENT');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.log_entry_kind as enum (
    'NOTE', 'NAVIGATION', 'ENGINE', 'DEFECT', 'SAFETY', 'BUNKERING', 'WEATHER', 'MAINTENANCE'
  );
exception when duplicate_object then null; end $$;

-- The boat's people as the boat knows them. A member is someone with a login
-- on the project; a crew record exists whether or not they have one.
create table if not exists public.crew (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  member_id uuid references public.project_members(id),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null default '' check (length(last_name) <= 100),
  position text not null check (length(trim(position)) between 1 and 100),
  department text check (length(department) <= 100),
  email text check (length(email) <= 254),
  phone text check (length(phone) <= 50),
  joined_on date,
  left_on date,
  emergency_contact_name text check (length(emergency_contact_name) <= 200),
  emergency_contact_phone text check (length(emergency_contact_phone) <= 50),
  holidays_allocated numeric check (holidays_allocated >= 0),
  flights_allocated numeric check (flights_allocated >= 0),
  notes text check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz
);
create index if not exists crew_project_idx on public.crew (project_id);
create index if not exists crew_vessel_idx on public.crew (vessel_id);
create unique index if not exists crew_one_per_member on public.crew (member_id) where member_id is not null;

-- One per vessel per date.
create table if not exists public.log_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  log_date date not null,
  status public.log_status not null,
  position text check (length(position) <= 200),
  port_from text check (length(port_from) <= 200),
  port_to text check (length(port_to) <= 200),
  nautical_miles numeric not null default 0 check (nautical_miles >= 0 and nautical_miles <= 2000),
  watchkeeping boolean not null default false,
  notes text check (length(notes) <= 4000),
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz,
  updated_by_name text,
  unique (vessel_id, log_date)
);
create index if not exists log_days_project_date_idx on public.log_days (project_id, log_date);

create table if not exists public.log_day_crew (
  log_day_id uuid not null references public.log_days(id),
  crew_id uuid not null references public.crew(id),
  attendance public.attendance_status not null,
  primary key (log_day_id, crew_id)
);
create index if not exists log_day_crew_crew_idx on public.log_day_crew (crew_id);

create table if not exists public.log_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  occurred_at timestamptz not null,
  kind public.log_entry_kind not null default 'NOTE',
  body text not null check (length(trim(body)) between 1 and 4000),
  part_id uuid references public.parts(id),
  author_id uuid,
  author_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index if not exists log_entries_project_time_idx on public.log_entries (project_id, occurred_at desc);
create index if not exists log_entries_part_idx on public.log_entries (part_id) where part_id is not null;

-- 3. Read access: members of the boat's operations project, nobody else -------
alter table public.crew enable row level security;
alter table public.log_days enable row level security;
alter table public.log_day_crew enable row level security;
alter table public.log_entries enable row level security;

create policy crew_read on public.crew for select using (is_project_member(project_id));
create policy log_days_read on public.log_days for select using (is_project_member(project_id));
create policy log_day_crew_read on public.log_day_crew for select using (
  exists (select 1 from log_days d where d.id = log_day_id and is_project_member(d.project_id))
);
create policy log_entries_read on public.log_entries for select using (is_project_member(project_id));

revoke all on public.crew, public.log_days, public.log_day_crew, public.log_entries from anon, authenticated;
grant select on public.crew, public.log_days, public.log_day_crew, public.log_entries to authenticated;

-- 4. Helpers --------------------------------------------------------------------
-- The operations project the caller is on, with its vessel; refuses anything else.
create or replace function public.operations_project(p_project_id uuid)
returns public.projects
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project projects;
begin
  select * into v_project from projects where id = p_project_id;
  if not found or v_project.project_type <> 'OPERATIONS' or v_project.vessel_id is null then
    raise exception 'This is not a boat''s logbook' using errcode = 'P0001';
  end if;
  return v_project;
end;
$$;
revoke execute on function public.operations_project(uuid) from anon, authenticated, public;

-- 5. Actions --------------------------------------------------------------------

-- Opens a boat's logbook. From a project with a vessel (p_from_project_id),
-- or for a new boat by name (p_vessel_name). Returns the operations project.
create or replace function public.action_open_logbook(
  p_from_project_id uuid default null,
  p_vessel_name text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- Adds or updates a crew member. With p_invite and an email, also invites them
-- to the logbook (as CREW, or CAPTAIN when p_member_role says so).
create or replace function public.action_set_crew(
  p_project_id uuid,
  p_crew_id uuid default null,
  p_first_name text default null,
  p_last_name text default null,
  p_position text default null,
  p_department text default null,
  p_email text default null,
  p_phone text default null,
  p_joined_on date default null,
  p_left_on date default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_holidays_allocated numeric default null,
  p_flights_allocated numeric default null,
  p_notes text default null,
  p_invite boolean default false,
  p_member_role text default 'CREW'
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before crew;
  v_after crew;
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_member project_members;
  v_member_role user_role;
  v_invited boolean := false;
begin
  perform require_permission('action_set_crew', v_project_id);
  v_project := operations_project(v_project_id);

  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That is not an email address' using errcode = 'P0001';
  end if;
  if p_left_on is not null and p_joined_on is not null and p_left_on < p_joined_on then
    raise exception 'Left (%) cannot be before joined (%)', p_left_on, p_joined_on using errcode = 'P0001';
  end if;

  if p_crew_id is null then
    if nullif(trim(coalesce(p_first_name, '')), '') is null or nullif(trim(coalesce(p_position, '')), '') is null then
      raise exception 'A crew member needs a first name and a position' using errcode = 'P0001';
    end if;
    insert into crew (
      project_id, vessel_id, first_name, last_name, position, department, email, phone,
      joined_on, left_on, emergency_contact_name, emergency_contact_phone,
      holidays_allocated, flights_allocated, notes, created_by_name
    ) values (
      v_project_id, v_project.vessel_id, trim(p_first_name), coalesce(trim(p_last_name), ''), trim(p_position),
      nullif(trim(coalesce(p_department, '')), ''), v_email, nullif(trim(coalesce(p_phone, '')), ''),
      p_joined_on, p_left_on, nullif(trim(coalesce(p_emergency_contact_name, '')), ''),
      nullif(trim(coalesce(p_emergency_contact_phone, '')), ''),
      p_holidays_allocated, p_flights_allocated, nullif(trim(coalesce(p_notes, '')), ''), v_actor_name
    ) returning * into v_after;
  else
    select * into v_before from crew where id = p_crew_id and project_id = v_project_id;
    if not found then
      raise exception 'No crew member with that id on this boat' using errcode = 'P0001';
    end if;
    -- Omitted keeps; an empty string clears an optional field.
    update crew set
      first_name = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
      last_name = case when p_last_name is null then last_name else trim(p_last_name) end,
      position = coalesce(nullif(trim(coalesce(p_position, '')), ''), position),
      department = case when p_department is null then department else nullif(trim(p_department), '') end,
      email = case when p_email is null then email else v_email end,
      phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
      joined_on = coalesce(p_joined_on, joined_on),
      left_on = coalesce(p_left_on, left_on),
      emergency_contact_name = case when p_emergency_contact_name is null then emergency_contact_name
                                    else nullif(trim(p_emergency_contact_name), '') end,
      emergency_contact_phone = case when p_emergency_contact_phone is null then emergency_contact_phone
                                     else nullif(trim(p_emergency_contact_phone), '') end,
      holidays_allocated = coalesce(p_holidays_allocated, holidays_allocated),
      flights_allocated = coalesce(p_flights_allocated, flights_allocated),
      notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end,
      updated_at = now()
    where id = p_crew_id
    returning * into v_after;
    if v_after.left_on is not null and v_after.joined_on is not null and v_after.left_on < v_after.joined_on then
      raise exception 'Left (%) cannot be before joined (%)', v_after.left_on, v_after.joined_on using errcode = 'P0001';
    end if;
  end if;

  if coalesce(p_invite, false) then
    if v_after.email is null then
      raise exception 'Give % an email address to invite them', v_after.first_name using errcode = 'P0001';
    end if;
    begin
      v_member_role := coalesce(nullif(p_member_role, ''), 'CREW')::user_role;
    exception when invalid_text_representation then
      raise exception 'Unknown role: %', p_member_role using errcode = 'P0001';
    end;
    if v_member_role not in ('CREW', 'CAPTAIN') then
      raise exception 'A logbook invitation is for crew or a captain' using errcode = 'P0001';
    end if;
    select * into v_member from project_members
     where project_id = v_project_id and lower(email) = v_after.email;
    if found and v_member.status <> 'LEFT' then
      null; -- already on the boat: just link the record below
    elsif found then
      -- Back aboard: the old row is reused so their history stays attached.
      update project_members
         set status = 'INVITED', role = v_member_role, invited_at = now(),
             invited_by = v_actor_id, invited_by_name = v_actor_name, left_at = null, left_reason = null
       where id = v_member.id returning * into v_member;
      v_invited := true;
    else
      insert into project_members (project_id, user_id, role, name, email, status, invited_at, invited_by, invited_by_name)
      values (v_project_id, null, v_member_role, trim(v_after.first_name || ' ' || v_after.last_name),
              v_after.email, 'INVITED', now(), v_actor_id, v_actor_name)
      returning * into v_member;
      v_invited := true;
    end if;
    if v_invited then
      insert into world_model_events (
        project_id, event_type, object_type, object_id,
        before_state, after_state, triggered_by, triggered_by_name
      ) values (
        v_project_id, 'MEMBER_INVITED', 'PROJECT_MEMBER', v_member.id, null,
        jsonb_build_object('status', v_member.status, 'role', v_member.role,
                           'name', v_member.name, 'email', v_member.email),
        v_actor_id, v_actor_name
      );
    end if;
    update crew set member_id = v_member.id where id = v_after.id returning * into v_after;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, case when v_before.id is null then 'CREW_ADDED' else 'CREW_UPDATED' end, 'CREW', v_after.id,
    case when v_before.id is null then null else to_jsonb(v_before) - 'created_at' end,
    to_jsonb(v_after) - 'created_at', v_actor_id, v_actor_name
  );

  return json_build_object('crew', row_to_json(v_after));
end;
$$;

-- Records a day: status, position, ports, miles, watchkeeping, notes and who
-- was aboard. Recording a past day again needs a reason.
create or replace function public.action_record_log_day(
  p_project_id uuid,
  p_log_date date,
  p_status text,
  p_position text default null,
  p_port_from text default null,
  p_port_to text default null,
  p_nautical_miles numeric default 0,
  p_watchkeeping boolean default false,
  p_notes text default null,
  p_attendance jsonb default null,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_status log_status;
  v_before log_days;
  v_after log_days;
  v_before_crew jsonb;
  v_after_crew jsonb;
  v_item jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform require_permission('action_record_log_day', v_project_id);
  v_project := operations_project(v_project_id);

  if p_log_date is null then
    raise exception 'Which day?' using errcode = 'P0001';
  end if;
  if p_log_date > current_date + 1 then
    raise exception 'A logbook records what happened: % has not happened yet', p_log_date using errcode = 'P0001';
  end if;
  begin
    v_status := upper(trim(p_status))::log_status;
  exception when invalid_text_representation then
    raise exception 'Status is SEA_SERVICE, STANDBY or YARD' using errcode = 'P0001';
  end;
  if v_status is null then
    raise exception 'Status is SEA_SERVICE, STANDBY or YARD' using errcode = 'P0001';
  end if;
  if coalesce(p_nautical_miles, 0) < 0 or coalesce(p_nautical_miles, 0) > 2000 then
    raise exception 'Nautical miles must be between 0 and 2000 for one day' using errcode = 'P0001';
  end if;

  select * into v_before from log_days where vessel_id = v_project.vessel_id and log_date = p_log_date;
  if found and p_log_date < current_date - 1 and v_reason is null then
    raise exception 'Say why % is being changed: the day has passed', p_log_date using errcode = 'P0001';
  end if;

  if found then
    select coalesce(jsonb_object_agg(crew_id, attendance), '{}') into v_before_crew
      from log_day_crew where log_day_id = v_before.id;
    update log_days set
      status = v_status,
      position = nullif(trim(coalesce(p_position, '')), ''),
      port_from = nullif(trim(coalesce(p_port_from, '')), ''),
      port_to = nullif(trim(coalesce(p_port_to, '')), ''),
      nautical_miles = coalesce(p_nautical_miles, 0),
      watchkeeping = coalesce(p_watchkeeping, false),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now(), updated_by_name = v_actor_name
    where id = v_before.id returning * into v_after;
  else
    insert into log_days (
      project_id, vessel_id, log_date, status, position, port_from, port_to,
      nautical_miles, watchkeeping, notes, created_by_name
    ) values (
      v_project_id, v_project.vessel_id, p_log_date, v_status,
      nullif(trim(coalesce(p_position, '')), ''), nullif(trim(coalesce(p_port_from, '')), ''),
      nullif(trim(coalesce(p_port_to, '')), ''), coalesce(p_nautical_miles, 0),
      coalesce(p_watchkeeping, false), nullif(trim(coalesce(p_notes, '')), ''), v_actor_name
    ) returning * into v_after;
  end if;

  -- Who was aboard: each crew member given is set for the day; anyone not
  -- given keeps what was recorded. Rows are never removed: absent is a value.
  if p_attendance is not null then
    if jsonb_typeof(p_attendance) <> 'array' then
      raise exception 'Attendance is a list of {crew_id, attendance}' using errcode = 'P0001';
    end if;
    for v_item in select * from jsonb_array_elements(p_attendance) loop
      if not exists (select 1 from crew where id = (v_item ->> 'crew_id')::uuid and project_id = v_project_id) then
        raise exception 'A crew member in the attendance list is not on this boat' using errcode = 'P0001';
      end if;
      begin
        insert into log_day_crew (log_day_id, crew_id, attendance)
        values (v_after.id, (v_item ->> 'crew_id')::uuid, upper(v_item ->> 'attendance')::attendance_status)
        on conflict (log_day_id, crew_id) do update set attendance = excluded.attendance;
      exception when invalid_text_representation then
        raise exception 'Attendance is PRESENT, HOLIDAY or ABSENT' using errcode = 'P0001';
      end;
    end loop;
  end if;
  select coalesce(jsonb_object_agg(crew_id, attendance), '{}') into v_after_crew
    from log_day_crew where log_day_id = v_after.id;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, case when v_before.id is null then 'LOG_DAY_RECORDED' else 'LOG_DAY_CHANGED' end,
    'LOG_DAY', v_after.id,
    case when v_before.id is null then null
         else (to_jsonb(v_before) - 'created_at' - 'updated_at') || jsonb_build_object('attendance', v_before_crew) end,
    (to_jsonb(v_after) - 'created_at' - 'updated_at')
      || jsonb_build_object('attendance', v_after_crew, 'reason', v_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('log_day', row_to_json(v_after), 'attendance', v_after_crew);
end;
$$;

-- Writes a timestamped entry. Entries are never edited: see action_void_log_entry.
create or replace function public.action_add_log_entry(
  p_project_id uuid,
  p_body text,
  p_kind text default 'NOTE',
  p_occurred_at timestamptz default null,
  p_part_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_kind log_entry_kind;
  v_part parts;
  v_after log_entries;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  perform require_permission('action_add_log_entry', v_project_id);
  v_project := operations_project(v_project_id);

  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'An entry needs some words' using errcode = 'P0001';
  end if;
  begin
    v_kind := upper(coalesce(nullif(trim(p_kind), ''), 'NOTE'))::log_entry_kind;
  exception when invalid_text_representation then
    raise exception 'Unknown kind of entry: %', p_kind using errcode = 'P0001';
  end;
  if v_when > now() + interval '10 minutes' then
    raise exception 'An entry records what has happened, not what will' using errcode = 'P0001';
  end if;
  if p_part_id is not null then
    select * into v_part from parts where id = p_part_id;
    if not found or v_part.vessel_id is distinct from v_project.vessel_id or v_part.removed_at is not null then
      raise exception 'That part is not on this boat' using errcode = 'P0001';
    end if;
  end if;

  insert into log_entries (project_id, vessel_id, occurred_at, kind, body, part_id, author_id, author_name)
  values (v_project_id, v_project.vessel_id, v_when, v_kind, trim(p_body), p_part_id, v_actor_id, v_actor_name)
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'LOG_ENTRY_WRITTEN', 'LOG_ENTRY', v_after.id, null,
    jsonb_build_object('kind', v_after.kind, 'occurred_at', v_after.occurred_at,
                       'body', v_after.body, 'part_id', v_after.part_id),
    v_actor_id, v_actor_name
  );

  return json_build_object('entry', row_to_json(v_after));
end;
$$;

-- Strikes an entry out with a reason. Its words stay readable; only its
-- author or the boat's captain may do it.
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

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'LOG_ENTRY_VOIDED', 'LOG_ENTRY', v_after.id,
    jsonb_build_object('body', v_before.body, 'kind', v_before.kind),
    jsonb_build_object('voided_at', v_after.voided_at, 'reason', v_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('entry', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_open_logbook(uuid, text) from anon, public;
revoke execute on function public.action_set_crew(uuid, uuid, text, text, text, text, text, text, date, date, text, text, numeric, numeric, text, boolean, text) from anon, public;
revoke execute on function public.action_record_log_day(uuid, date, text, text, text, text, numeric, boolean, text, jsonb, text) from anon, public;
revoke execute on function public.action_add_log_entry(uuid, text, text, timestamptz, uuid) from anon, public;
revoke execute on function public.action_void_log_entry(uuid, uuid, text) from anon, public;
grant execute on function public.action_open_logbook(uuid, text) to authenticated;
grant execute on function public.action_set_crew(uuid, uuid, text, text, text, text, text, text, date, date, text, text, numeric, numeric, text, boolean, text) to authenticated;
grant execute on function public.action_record_log_day(uuid, date, text, text, text, text, numeric, boolean, text, jsonb, text) to authenticated;
grant execute on function public.action_add_log_entry(uuid, text, text, timestamptz, uuid) to authenticated;
grant execute on function public.action_void_log_entry(uuid, uuid, text) to authenticated;

-- 6. Permissions ------------------------------------------------------------------
-- The captain and crew keep the log; the captain, the owner and the owner's
-- rep run the crew list (whoever opens a boat's logbook must be able to invite
-- her captain). Everyone else reads. The functions also refuse anything
-- that is not an operations project, so these grants mean nothing on a refit.
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_record_log_day', 'CAPTAIN'), ('action_record_log_day', 'CREW'),
    ('action_add_log_entry', 'CAPTAIN'), ('action_add_log_entry', 'CREW'),
    ('action_set_crew', 'CAPTAIN'), ('action_set_crew', 'OWNER'), ('action_set_crew', 'OWNERS_REP')
  ) as p(k, r)
on conflict do nothing;

-- 7. Registry ---------------------------------------------------------------------
insert into ontology_object_types (key, label, table_name, description, display_order)
values
  ('CREW', 'Crew member', 'crew', 'Someone who works aboard a vessel: position, department, dates and emergency contact, linked to a member when they have a login. Belongs to the vessel.', 30),
  ('LOG_DAY', 'Log day', 'log_days', 'One day in a vessel''s logbook: sea service, standby or yard; position, ports, miles, watchkeeping, and who was aboard.', 31),
  ('LOG_ENTRY', 'Log entry', 'log_entries', 'A timestamped entry in a vessel''s logbook (note, navigation, engine, defect, safety, bunkering, weather, maintenance), optionally about a part. Never edited: struck out with a reason.', 32)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select f::object_type, t::object_type, l, c, v
  from (values
    ('CREW', 'VESSEL', 'serves aboard', 'MANY_TO_ONE', 'vessel_id'),
    ('LOG_DAY', 'VESSEL', 'is a day of', 'MANY_TO_ONE', 'vessel_id'),
    ('LOG_DAY', 'CREW', 'had aboard', 'ONE_TO_MANY', 'log_day_crew'),
    ('LOG_ENTRY', 'VESSEL', 'is written about', 'MANY_TO_ONE', 'vessel_id'),
    ('LOG_ENTRY', 'PART', 'concerns', 'MANY_TO_ONE', 'part_id')
  ) as x(f, t, l, c, v)
 where not exists (
   select 1 from ontology_links ol where ol.from_type = x.f::object_type and ol.to_type = x.t::object_type and ol.label = x.l
 );

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_record_log_day', 'Record a day in the logbook',
  'Records one day of a vessel''s logbook: status (SEA_SERVICE, STANDBY, YARD), position, ports, nautical miles, watchkeeping, notes and attendance ([{crew_id, attendance: PRESENT|HOLIDAY|ABSENT}]). Recording a past day again needs p_reason.',
  'LOG_DAY',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_log_date', 'type', 'date', 'required', true),
    jsonb_build_object('name', 'p_status', 'type', 'enum', 'required', true, 'values', jsonb_build_array('SEA_SERVICE', 'STANDBY', 'YARD')),
    jsonb_build_object('name', 'p_position', 'type', 'text'),
    jsonb_build_object('name', 'p_port_from', 'type', 'text'),
    jsonb_build_object('name', 'p_port_to', 'type', 'text'),
    jsonb_build_object('name', 'p_nautical_miles', 'type', 'numeric'),
    jsonb_build_object('name', 'p_watchkeeping', 'type', 'boolean'),
    jsonb_build_object('name', 'p_notes', 'type', 'text'),
    jsonb_build_object('name', 'p_attendance', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ), '{}', false
),
(
  'action_add_log_entry', 'Write a logbook entry',
  'Writes a timestamped entry in a vessel''s logbook: NOTE, NAVIGATION, ENGINE, DEFECT, SAFETY, BUNKERING, WEATHER or MAINTENANCE, optionally about one of the vessel''s parts.',
  'LOG_ENTRY',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_body', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_kind', 'type', 'enum', 'values', jsonb_build_array('NOTE', 'NAVIGATION', 'ENGINE', 'DEFECT', 'SAFETY', 'BUNKERING', 'WEATHER', 'MAINTENANCE')),
    jsonb_build_object('name', 'p_occurred_at', 'type', 'timestamptz'),
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid')
  ), '{}', false
),
(
  'action_void_log_entry', 'Strike out a logbook entry',
  'Strikes out a logbook entry with a reason. The words stay readable. Only the entry''s author or the captain.',
  'LOG_ENTRY',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_entry_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
  ), '{}', false
),
(
  'action_set_crew', 'Add or update a crew member',
  'Adds a crew member to a vessel or updates one (omitted keeps, empty clears). With p_invite and an email, also invites them to the logbook as CREW or CAPTAIN.',
  'CREW',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_crew_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_first_name', 'type', 'text'),
    jsonb_build_object('name', 'p_last_name', 'type', 'text'),
    jsonb_build_object('name', 'p_position', 'type', 'text'),
    jsonb_build_object('name', 'p_department', 'type', 'text'),
    jsonb_build_object('name', 'p_email', 'type', 'text'),
    jsonb_build_object('name', 'p_phone', 'type', 'text'),
    jsonb_build_object('name', 'p_joined_on', 'type', 'date'),
    jsonb_build_object('name', 'p_left_on', 'type', 'date'),
    jsonb_build_object('name', 'p_invite', 'type', 'boolean'),
    jsonb_build_object('name', 'p_member_role', 'type', 'enum', 'values', jsonb_build_array('CREW', 'CAPTAIN'))
  ), '{}', false
),
(
  'action_open_logbook', 'Open a boat''s logbook',
  'Creates the standing operations project of a vessel: from a project that has the vessel (owner, owner''s rep or captain), or for a new boat by name (the caller becomes captain). One per vessel.',
  'PROJECT',
  jsonb_build_array(
    jsonb_build_object('name', 'p_from_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_vessel_name', 'type', 'text')
  ), '{}', false
)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, target_type = excluded.target_type,
  parameters = excluded.parameters, cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;

-- 8. Realtime: the log updates on every phone aboard --------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['crew', 'log_days', 'log_day_crew', 'log_entries'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
