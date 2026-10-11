-- Migration 037: yard days count toward the refit; crew certificates; sea time.
--
-- Phase 3 of the logbook merge, second part.
--
-- 1. Yard days. A day the crew log as YARD is the boat in a yard, and a refit
--    on the same vessel is the work being done there. The day is linked to
--    that refit (log_days.refit_project_id) and the refit's own event log
--    records it, so the refit's people see the real days in the yard against
--    their plan without being members of the boat's logbook. They read the
--    days through yard_days(), which shows the date, ports and how many were
--    aboard, never the crew's notes.
-- 2. Crew certificates. One row per certificate with its expiry, so an
--    expiry can be flagged. Changed with before/after recorded, retired
--    with a reason, never deleted. A crew member keeps their own; the
--    captain and the owner side keep everyone's.
-- 3. Sea time. Worked out from the log (days aboard by status), never typed,
--    so it cannot drift from the record it comes from.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: yard_certs_0_enum,
-- yard_certs_1_yard_days, yard_certs_2_certificates, yard_certs_3_sea_time,
-- yard_certs_4_permissions_registry.

-- 0. Object type --------------------------------------------------------------------
alter type object_type add value if not exists 'CREW_CERTIFICATE';

-- 1. Yard days ---------------------------------------------------------------------
alter table public.log_days
  add column if not exists refit_project_id uuid references public.projects(id);
create index if not exists log_days_refit_idx on public.log_days (refit_project_id) where refit_project_id is not null;

-- The project of work on this vessel that a day in the yard belongs to: one
-- that had started by that day and was not yet delivered. The latest started
-- wins when two overlap. Null when there is none.
create or replace function public.refit_for_day(p_vessel_id uuid, p_day date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id from projects p
   where p.vessel_id = p_vessel_id
     and p.project_type not in ('OPERATIONS', 'PROPERTY')
     and coalesce(p.actual_start, p.planned_start) <= p_day
     and (p.actual_delivery is null or p.actual_delivery >= p_day)
     and (p.phase <> 'DELIVERED' or p.actual_delivery >= p_day)
   order by coalesce(p.actual_start, p.planned_start) desc, p.created_at desc
   limit 1;
$$;
revoke execute on function public.refit_for_day(uuid, date) from anon, public;

-- Records a day (as migration 032), and links a yard day to its refit.
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
  v_refit uuid;
  v_aboard int;
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

  -- A yard day belongs to the refit under way on this vessel that day.
  v_refit := case when v_status = 'YARD' then refit_for_day(v_project.vessel_id, p_log_date) end;

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
      refit_project_id = v_refit,
      updated_at = now(), updated_by_name = v_actor_name
    where id = v_before.id returning * into v_after;
  else
    insert into log_days (
      project_id, vessel_id, log_date, status, position, port_from, port_to,
      nautical_miles, watchkeeping, notes, refit_project_id, created_by_name
    ) values (
      v_project_id, v_project.vessel_id, p_log_date, v_status,
      nullif(trim(coalesce(p_position, '')), ''), nullif(trim(coalesce(p_port_from, '')), ''),
      nullif(trim(coalesce(p_port_to, '')), ''), coalesce(p_nautical_miles, 0),
      coalesce(p_watchkeeping, false), nullif(trim(coalesce(p_notes, '')), ''), v_refit, v_actor_name
    ) returning * into v_after;
  end if;

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

  -- The refit hears about the yard days it gains and loses, in its own
  -- event log: the date, the ports and how many were aboard, no notes.
  select count(*) into v_aboard from log_day_crew where log_day_id = v_after.id and attendance = 'PRESENT';
  if v_before.refit_project_id is distinct from v_refit and v_before.refit_project_id is not null then
    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_before.refit_project_id, 'YARD_DAY_UNLINKED', 'LOG_DAY', v_after.id,
      jsonb_build_object('log_date', v_before.log_date, 'status', v_before.status),
      jsonb_build_object('log_date', v_after.log_date, 'status', v_after.status, 'refit_project_id', v_refit,
                         'logbook_project_id', v_project_id, 'reason', v_reason),
      v_actor_id, v_actor_name
    );
  end if;
  if v_refit is not null and v_before.refit_project_id is distinct from v_refit then
    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_refit, 'YARD_DAY_LOGGED', 'LOG_DAY', v_after.id, null,
      jsonb_build_object('log_date', v_after.log_date, 'port', coalesce(v_after.port_to, v_after.port_from),
                         'crew_aboard', v_aboard, 'logbook_project_id', v_project_id),
      v_actor_id, v_actor_name
    );
  end if;

  return json_build_object('log_day', row_to_json(v_after), 'attendance', v_after_crew);
end;
$$;

-- The days the boat's crew logged in the yard for this refit, for the
-- refit's members: date, ports and how many were aboard. The crew's notes,
-- positions and names stay in the logbook.
create or replace function public.yard_days(p_project_id uuid)
returns table (log_date date, port text, crew_aboard int, recorded_by_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d.log_date, coalesce(d.port_to, d.port_from),
         (select count(*)::int from log_day_crew c where c.log_day_id = d.id and c.attendance = 'PRESENT'),
         coalesce(d.updated_by_name, d.created_by_name)
    from log_days d
   where d.refit_project_id = p_project_id
     and d.status = 'YARD'
     and is_project_member(p_project_id)
   order by d.log_date;
$$;
revoke execute on function public.yard_days(uuid) from anon, public;
grant execute on function public.yard_days(uuid) to authenticated;

-- 2. Crew certificates ----------------------------------------------------------------
create table if not exists public.crew_certificates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  crew_id uuid not null references public.crew(id),
  title text not null check (length(trim(title)) >= 2),
  number text,
  issued_by text,
  issued_on date,
  expires_on date,
  notes text,
  document_id uuid references public.documents(id),
  created_at timestamptz not null default now(),
  created_by_name text,
  updated_at timestamptz,
  updated_by_name text,
  retired_at timestamptz,
  retired_by_name text,
  retired_reason text,
  check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index if not exists crew_certificates_crew_idx on public.crew_certificates (crew_id);
create index if not exists crew_certificates_expiry_idx on public.crew_certificates (project_id, expires_on) where retired_at is null;

alter table public.crew_certificates enable row level security;
create policy crew_certificates_read on public.crew_certificates for select using (is_project_member(project_id));
revoke all on public.crew_certificates from anon, authenticated;
grant select on public.crew_certificates to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.crew_certificates;
exception when duplicate_object then null;
end $$;

-- Whether the caller may keep this crew member's certificates: the crew
-- member themselves, or a role that runs the crew list.
create or replace function public.can_keep_crew_record(p_crew_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(current_actor_role(p_project_id) in ('CAPTAIN', 'OWNER', 'OWNERS_REP'), false)
      or exists (
        select 1 from crew c join project_members pm on pm.id = c.member_id
         where c.id = p_crew_id and c.project_id = p_project_id
           and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
           and pm.status <> 'LEFT'
      );
$$;
revoke execute on function public.can_keep_crew_record(uuid, uuid) from anon, public;

create or replace function public.action_set_crew_certificate(
  p_project_id uuid,
  p_crew_id uuid,
  p_title text,
  p_number text default null,
  p_issued_by text default null,
  p_issued_on date default null,
  p_expires_on date default null,
  p_notes text default null,
  p_certificate_id uuid default null,
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
  v_crew crew;
  v_before crew_certificates;
  v_after crew_certificates;
begin
  perform require_permission('action_set_crew_certificate', v_project_id);
  v_project := operations_project(v_project_id);
  select * into v_crew from crew where id = p_crew_id and project_id = v_project_id;
  if not found then
    raise exception 'No crew member with that id on this boat' using errcode = 'P0001';
  end if;
  if not can_keep_crew_record(p_crew_id, v_project_id) then
    raise exception 'Certificates are kept by the crew member themselves, the captain or the owner''s side' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null or length(trim(p_title)) < 2 then
    raise exception 'Which certificate? (e.g. "STCW Basic Safety Training")' using errcode = 'P0001';
  end if;
  if p_expires_on is not null and p_issued_on is not null and p_expires_on < p_issued_on then
    raise exception 'A certificate cannot expire before it was issued' using errcode = 'P0001';
  end if;
  if p_issued_on is not null and p_issued_on > current_date then
    raise exception 'A certificate cannot be issued in the future' using errcode = 'P0001';
  end if;

  if p_certificate_id is not null then
    select * into v_before from crew_certificates where id = p_certificate_id and crew_id = p_crew_id for update;
    if not found then
      raise exception 'No certificate with that id for this crew member' using errcode = 'P0001';
    end if;
    if v_before.retired_at is not null then
      raise exception 'That certificate was retired; record the new one' using errcode = 'P0001';
    end if;
    update crew_certificates set
      title = trim(p_title),
      number = nullif(trim(coalesce(p_number, '')), ''),
      issued_by = nullif(trim(coalesce(p_issued_by, '')), ''),
      issued_on = p_issued_on,
      expires_on = p_expires_on,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now(), updated_by_name = v_actor_name
    where id = v_before.id returning * into v_after;
  else
    insert into crew_certificates (
      project_id, vessel_id, crew_id, title, number, issued_by, issued_on, expires_on, notes, created_by_name
    ) values (
      v_project_id, v_project.vessel_id, p_crew_id, trim(p_title),
      nullif(trim(coalesce(p_number, '')), ''), nullif(trim(coalesce(p_issued_by, '')), ''),
      p_issued_on, p_expires_on, nullif(trim(coalesce(p_notes, '')), ''), v_actor_name
    ) returning * into v_after;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id,
    case when v_before.id is null then 'CREW_CERTIFICATE_ADDED' else 'CREW_CERTIFICATE_CHANGED' end,
    'CREW_CERTIFICATE', v_after.id,
    case when v_before.id is null then null else to_jsonb(v_before) - 'created_at' - 'updated_at' end,
    (to_jsonb(v_after) - 'created_at' - 'updated_at')
      || jsonb_build_object('crew', trim(v_crew.first_name || ' ' || coalesce(v_crew.last_name, '')),
                            'reason', nullif(trim(coalesce(p_reason, '')), '')),
    v_actor_id, v_actor_name
  );
  return json_build_object('certificate', row_to_json(v_after));
end;
$$;

create or replace function public.action_retire_crew_certificate(p_project_id uuid, p_certificate_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before crew_certificates;
  v_after crew_certificates;
begin
  perform require_permission('action_set_crew_certificate', v_project_id);
  select * into v_before from crew_certificates where id = p_certificate_id and project_id = v_project_id for update;
  if not found then
    raise exception 'No certificate with that id on this boat' using errcode = 'P0001';
  end if;
  if not can_keep_crew_record(v_before.crew_id, v_project_id) then
    raise exception 'Certificates are kept by the crew member themselves, the captain or the owner''s side' using errcode = 'P0001';
  end if;
  if v_before.retired_at is not null then
    raise exception 'That certificate is already retired' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why it is retired (renewed, lapsed, entered in error)' using errcode = 'P0001';
  end if;
  update crew_certificates set retired_at = now(), retired_by_name = v_actor_name, retired_reason = v_reason
   where id = v_before.id returning * into v_after;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'CREW_CERTIFICATE_RETIRED', 'CREW_CERTIFICATE', v_after.id,
    jsonb_build_object('title', v_before.title, 'expires_on', v_before.expires_on),
    jsonb_build_object('retired_at', v_after.retired_at, 'reason', v_reason),
    current_actor_id(), v_actor_name
  );
  return json_build_object('certificate', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_set_crew_certificate(uuid, uuid, text, text, text, date, date, text, uuid, text) from anon, public;
revoke execute on function public.action_retire_crew_certificate(uuid, uuid, text) from anon, public;
grant execute on function public.action_set_crew_certificate(uuid, uuid, text, text, text, date, date, text, uuid, text) to authenticated;
grant execute on function public.action_retire_crew_certificate(uuid, uuid, text) to authenticated;

-- 3. Sea time ---------------------------------------------------------------------------
-- Days each crew member was aboard, by what the boat was doing, from the
-- log itself. Optional date range. SECURITY INVOKER: the log's own read
-- rights apply.
create or replace function public.sea_time(p_project_id uuid, p_from date default null, p_to date default null)
returns table (
  crew_id uuid,
  days_aboard int,
  sea_service_days int,
  standby_days int,
  yard_days int,
  watchkeeping_days int,
  nautical_miles numeric,
  first_day date,
  last_day date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.crew_id,
         count(*)::int,
         count(*) filter (where d.status = 'SEA_SERVICE')::int,
         count(*) filter (where d.status = 'STANDBY')::int,
         count(*) filter (where d.status = 'YARD')::int,
         count(*) filter (where d.watchkeeping)::int,
         coalesce(sum(d.nautical_miles), 0),
         min(d.log_date),
         max(d.log_date)
    from log_day_crew c
    join log_days d on d.id = c.log_day_id
   where d.project_id = p_project_id
     and c.attendance = 'PRESENT'
     and (p_from is null or d.log_date >= p_from)
     and (p_to is null or d.log_date <= p_to)
   group by c.crew_id;
$$;
revoke execute on function public.sea_time(uuid, date, date) from anon, public;
grant execute on function public.sea_time(uuid, date, date) to authenticated;

-- 4. Permissions and registry -------------------------------------------------------------
-- The roles; can_keep_crew_record narrows CREW to their own certificates.
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_set_crew_certificate', 'CAPTAIN'), ('action_set_crew_certificate', 'CREW'),
    ('action_set_crew_certificate', 'OWNER'), ('action_set_crew_certificate', 'OWNERS_REP')
  ) as p(k, r)
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('CREW_CERTIFICATE', 'Crew certificate', 'crew_certificates',
        'A certificate a crew member holds (STCW, medical, licence) with its number, issuer and expiry. Changed with before/after recorded, retired with a reason (renewed, lapsed), never deleted.', 37)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select f::object_type, t::object_type, l, c, v
  from (values
    ('CREW_CERTIFICATE', 'CREW', 'is held by', 'MANY_TO_ONE', 'crew_id'),
    ('LOG_DAY', 'PROJECT', 'counts as a yard day of', 'MANY_TO_ONE', 'refit_project_id')
  ) as x(f, t, l, c, v)
 where not exists (select 1 from ontology_links ol where ol.from_type::text = x.f and ol.to_type::text = x.t and ol.via_column = x.v);

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_set_crew_certificate', 'Record a crew certificate',
   'Records a certificate a crew member holds, or corrects one (p_certificate_id): title, number, issuer, issued and expiry dates. A crew member keeps their own; the captain and the owner''s side keep everyone''s.',
   'CREW_CERTIFICATE',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_crew_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_title', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_number', 'type', 'text'),
     jsonb_build_object('name', 'p_issued_by', 'type', 'text'),
     jsonb_build_object('name', 'p_issued_on', 'type', 'date'),
     jsonb_build_object('name', 'p_expires_on', 'type', 'date'),
     jsonb_build_object('name', 'p_notes', 'type', 'text'),
     jsonb_build_object('name', 'p_certificate_id', 'type', 'uuid'),
     jsonb_build_object('name', 'p_reason', 'type', 'text')
   ), '{}', true),
  ('action_retire_crew_certificate', 'Retire a crew certificate',
   'A certificate renewed, lapsed or entered in error: kept, with the reason.',
   'CREW_CERTIFICATE',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_certificate_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false)
on conflict (key) do nothing;
