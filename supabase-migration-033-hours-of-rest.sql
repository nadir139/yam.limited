-- =============================================================================
-- YAM Migration 033 — HOURS OF REST (logbook phase 2)
--
-- Each crew member's monthly record of work and rest in half-hours, judged
-- against STCW A-VIII/1 and MLC 2006 A2.3 (the rules are written out in
-- src/lib/rest-hours.ts; rest_breaches below is the same logic, so the record
-- stored is judged by the server, not by the browser that sent it).
--
-- Private by rule (owner's decision, 11 Oct 2026): a record is readable only
-- by the crew member it belongs to and the boat's captain. Everyone else on
-- the logbook sees rest_summary: how many people are recorded and how many
-- have breaches, with no names and no hours. For the same reason the event
-- written on each save carries the month and nothing else, and earlier
-- versions of a record are kept in rest_record_versions under the same rule
-- rather than in the project-wide event log.
-- =============================================================================

-- 0. Enum value (applied first, on its own) -----------------------------------
alter type public.object_type add value if not exists 'REST_RECORD';

-- 1. The rules ------------------------------------------------------------------
-- p_schedule: {"1": [48 booleans, true = working], ...}; missing days are
-- unrecorded and no window touching one is judged. Returns
-- {"breaches": [{"day", "rule"}], "breach_days": [...]}.
create or replace function public.rest_breaches(p_schedule jsonb, p_days int)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  n int := p_days * 48;
  s smallint[] := array_fill(-1::smallint, array[greatest(n, 1)]);  -- 1 work, 0 rest, -1 unknown
  rest_pre int[] := array_fill(0, array[n + 1]);                     -- rest slots before index i (0-based)
  unk_pre int[] := array_fill(0, array[n + 1]);
  v_row jsonb;
  d int; i int; j int; a int; b int;
  starting int; has6 boolean;
  stretch int := 0;
  v_out jsonb := '[]'::jsonb;
  seen text[] := '{}';
  v_k text;
  pa int[] := '{}'; pb int[] := '{}';   -- rest periods [pa, pb) of an hour or more
begin
  for d in 1..p_days loop
    v_row := p_schedule -> d::text;
    if v_row is not null and jsonb_typeof(v_row) = 'array' and jsonb_array_length(v_row) = 48 then
      for i in 0..47 loop
        s[(d - 1) * 48 + i + 1] := case when (v_row ->> i)::boolean then 1 else 0 end;
      end loop;
    end if;
  end loop;
  for i in 0..n - 1 loop
    rest_pre[i + 2] := rest_pre[i + 1] + case when s[i + 1] = 0 then 1 else 0 end;
    unk_pre[i + 2] := unk_pre[i + 1] + case when s[i + 1] = -1 then 1 else 0 end;
  end loop;

  -- 1. 10 hours of rest in every 24-hour window, starting on each half-hour.
  for i in 0..n - 48 loop
    if unk_pre[i + 49] - unk_pre[i + 1] = 0 and rest_pre[i + 49] - rest_pre[i + 1] < 20 then
      v_k := (i / 48 + 1)::text || ':REST_24H';
      if not v_k = any(seen) then seen := seen || v_k; end if;
    end if;
  end loop;

  -- 2. 77 hours of rest in every 7-day window, starting on each day.
  for d in 0..p_days - 7 loop
    i := d * 48;
    if unk_pre[i + 336 + 1] - unk_pre[i + 1] = 0 and rest_pre[i + 336 + 1] - rest_pre[i + 1] < 154 then
      v_k := (d + 1)::text || ':REST_7D';
      if not v_k = any(seen) then seen := seen || v_k; end if;
    end if;
  end loop;

  -- 3. Rest periods of an hour or more, unbroken across midnight.
  i := 0;
  while i < n loop
    if s[i + 1] <> 0 then
      i := i + 1;
      continue;
    end if;
    j := i;
    while j < n and s[j + 1] = 0 loop j := j + 1; end loop;
    if j - i >= 2 then pa := pa || i; pb := pb || j; end if;
    i := j;
  end loop;
  for d in 1..p_days loop
    if s[(d - 1) * 48 + 1] = -1 then continue; end if;  -- unrecorded day
    a := (d - 1) * 48; b := a + 48;
    starting := 0; has6 := false;
    for i in 1..coalesce(array_length(pa, 1), 0) loop
      -- A period at the start of the record or after an unrecorded day began
      -- at an unknown earlier time: not counted as starting that day.
      if pa[i] >= a and pa[i] < b and not (pa[i] = 0 or s[pa[i]] = -1) then
        starting := starting + 1;
      end if;
      if pa[i] < b and pb[i] > a and pb[i] - pa[i] >= 12 then has6 := true; end if;
    end loop;
    if starting > 2 or not has6 then
      v_k := d::text || ':TWO_PERIODS';
      if not v_k = any(seen) then seen := seen || v_k; end if;
    end if;
  end loop;

  -- 4. No stretch of work over 14 hours; an unrecorded day breaks a stretch.
  for i in 0..n - 1 loop
    if s[i + 1] = 1 then
      stretch := stretch + 1;
      if stretch > 28 then
        v_k := (i / 48 + 1)::text || ':MAX_WORK_14H';
        if not v_k = any(seen) then seen := seen || v_k; end if;
      end if;
    else
      stretch := 0;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('day', split_part(k, ':', 1)::int, 'rule', split_part(k, ':', 2))
                            order by split_part(k, ':', 1)::int, split_part(k, ':', 2)), '[]')
    into v_out from unnest(seen) k;
  return jsonb_build_object(
    'breaches', v_out,
    'breach_days', coalesce((select jsonb_agg(dd order by dd)
                               from (select distinct (x ->> 'day')::int dd from jsonb_array_elements(v_out) x) q), '[]')
  );
end;
$$;

-- 2. Tables -----------------------------------------------------------------------
create table if not exists public.rest_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  crew_id uuid not null references public.crew(id),
  year int not null check (year between 2000 and 2100),
  month int not null check (month between 1 and 12),
  schedule jsonb not null default '{}',
  breaches jsonb not null default '[]',
  breach_days int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by_name text,
  unique (crew_id, year, month)
);
create index if not exists rest_records_project_month_idx on public.rest_records (project_id, year, month);

-- What a record said before each change, kept under the same privacy rule.
create table if not exists public.rest_record_versions (
  id uuid primary key default gen_random_uuid(),
  rest_record_id uuid not null references public.rest_records(id),
  schedule jsonb not null,
  breaches jsonb not null,
  replaced_at timestamptz not null default now(),
  replaced_by_name text,
  reason text
);
create index if not exists rest_record_versions_record_idx on public.rest_record_versions (rest_record_id);

-- The crew member themselves, or the boat's captain.
create or replace function public.can_read_rest(p_crew_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(current_actor_role(p_project_id) = 'CAPTAIN', false)
      or exists (
        select 1 from crew c join project_members pm on pm.id = c.member_id
         where c.id = p_crew_id and c.project_id = p_project_id
           and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
           and pm.status <> 'LEFT'
      );
$$;
revoke execute on function public.can_read_rest(uuid, uuid) from anon, public;
grant execute on function public.can_read_rest(uuid, uuid) to authenticated;

alter table public.rest_records enable row level security;
alter table public.rest_record_versions enable row level security;
create policy rest_records_read on public.rest_records for select using (can_read_rest(crew_id, project_id));
create policy rest_record_versions_read on public.rest_record_versions for select using (
  exists (select 1 from rest_records r where r.id = rest_record_id and can_read_rest(r.crew_id, r.project_id))
);
revoke all on public.rest_records, public.rest_record_versions from anon, authenticated;
grant select on public.rest_records, public.rest_record_versions to authenticated;

-- 3. Actions and the summary ---------------------------------------------------------
-- Saves a month for one crew member: the member themselves or the captain.
create or replace function public.action_record_rest(
  p_project_id uuid,
  p_crew_id uuid,
  p_year int,
  p_month int,
  p_schedule jsonb,
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
  v_actor_name text := current_actor_name();
  v_crew crew;
  v_days int;
  v_key text;
  v_val jsonb;
  v_judged jsonb;
  v_before rest_records;
  v_after rest_records;
begin
  perform require_permission('action_record_rest', v_project_id);
  v_project := operations_project(v_project_id);

  select * into v_crew from crew where id = p_crew_id and project_id = v_project_id;
  if not found then
    raise exception 'No crew member with that id on this boat' using errcode = 'P0001';
  end if;
  if not can_read_rest(p_crew_id, v_project_id) then
    raise exception 'Hours of rest are kept by the crew member themselves or the captain' using errcode = 'P0001';
  end if;
  if p_year is null or p_month is null or p_month not between 1 and 12 or p_year not between 2000 and 2100 then
    raise exception 'Which month?' using errcode = 'P0001';
  end if;
  if make_date(p_year, p_month, 1) > date_trunc('month', current_date)::date then
    raise exception 'Hours of rest are recorded for months that have begun' using errcode = 'P0001';
  end if;

  v_days := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int;
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    raise exception 'A schedule is {day: [48 half-hours, true = working]}' using errcode = 'P0001';
  end if;
  for v_key, v_val in select * from jsonb_each(p_schedule) loop
    if v_key !~ '^[0-9]{1,2}$' or v_key::int not between 1 and v_days then
      raise exception 'Day % is not in %-%', v_key, p_year, p_month using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_val) <> 'array' or jsonb_array_length(v_val) <> 48
       or exists (select 1 from jsonb_array_elements(v_val) x where jsonb_typeof(x) <> 'boolean') then
      raise exception 'Day % needs 48 half-hours, each true (working) or false (rest)', v_key using errcode = 'P0001';
    end if;
  end loop;

  v_judged := rest_breaches(p_schedule, v_days);

  select * into v_before from rest_records where crew_id = p_crew_id and year = p_year and month = p_month;
  if found then
    insert into rest_record_versions (rest_record_id, schedule, breaches, replaced_by_name, reason)
    values (v_before.id, v_before.schedule, v_before.breaches, v_actor_name, nullif(trim(coalesce(p_reason, '')), ''));
    update rest_records set
      schedule = p_schedule, breaches = v_judged -> 'breaches',
      breach_days = jsonb_array_length(v_judged -> 'breach_days'),
      updated_at = now(), updated_by_name = v_actor_name
    where id = v_before.id returning * into v_after;
  else
    insert into rest_records (project_id, vessel_id, crew_id, year, month, schedule, breaches, breach_days, updated_by_name)
    values (v_project_id, v_project.vessel_id, p_crew_id, p_year, p_month, p_schedule, v_judged -> 'breaches',
            jsonb_array_length(v_judged -> 'breach_days'), v_actor_name)
    returning * into v_after;
  end if;

  -- The month only: the event log is read by everyone on the boat.
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'REST_RECORDED', 'REST_RECORD', v_after.id, null,
    jsonb_build_object('year', p_year, 'month', p_month),
    current_actor_id(), v_actor_name
  );

  return json_build_object('rest_record', row_to_json(v_after));
end;
$$;

-- For everyone on the boat: is the crew's rest recorded and within the rules?
-- Counts only, never names or hours.
create or replace function public.rest_summary(p_project_id uuid, p_year int, p_month int)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_from date := make_date(p_year, p_month, 1);
  v_to date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_aboard int;
  v_recorded int;
  v_breaching int;
begin
  perform operations_project(v_project_id);
  select count(*) into v_aboard from crew
   where project_id = v_project_id
     and (joined_on is null or joined_on <= v_to) and (left_on is null or left_on >= v_from);
  select count(*), count(*) filter (where breach_days > 0) into v_recorded, v_breaching
    from rest_records where project_id = v_project_id and year = p_year and month = p_month;
  return json_build_object('crew_aboard', v_aboard, 'crew_recorded', v_recorded, 'crew_with_breaches', v_breaching);
end;
$$;

revoke execute on function public.action_record_rest(uuid, uuid, int, int, jsonb, text) from anon, public;
revoke execute on function public.rest_summary(uuid, int, int) from anon, public;
revoke execute on function public.rest_breaches(jsonb, int) from anon, public;
grant execute on function public.action_record_rest(uuid, uuid, int, int, jsonb, text) to authenticated;
grant execute on function public.rest_summary(uuid, int, int) to authenticated;
grant execute on function public.rest_breaches(jsonb, int) to authenticated;

-- 4. Permissions and registry --------------------------------------------------------
insert into action_permissions (action_key, role)
values ('action_record_rest', 'CAPTAIN'), ('action_record_rest', 'CREW')
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('REST_RECORD', 'Hours of rest', 'rest_records',
        'One crew member''s month of work and rest in half-hours, judged against STCW and MLC. Readable only by that crew member and the captain; others see counts through rest_summary.', 33)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select 'REST_RECORD'::object_type, 'CREW'::object_type, 'records the rest of', 'MANY_TO_ONE', 'crew_id'
 where not exists (select 1 from ontology_links where from_type = 'REST_RECORD' and to_type = 'CREW');

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values (
  'action_record_rest', 'Record hours of rest',
  'Saves one crew member''s month of work and rest ({day: [48 half-hours, true = working]}). Only the crew member or the captain. The server judges it against STCW/MLC; earlier versions are kept privately.',
  'REST_RECORD',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_crew_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_year', 'type', 'integer', 'required', true),
    jsonb_build_object('name', 'p_month', 'type', 'integer', 'required', true),
    jsonb_build_object('name', 'p_schedule', 'type', 'jsonb', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ), '{}', false
)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, target_type = excluded.target_type,
  parameters = excluded.parameters, cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;
