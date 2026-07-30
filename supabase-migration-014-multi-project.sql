-- =============================================================================
-- YAM Migration 014 — MORE THAN ONE PROJECT
--
-- Applied to the live project as three migrations, in this order:
--   `multi_project_foundations`
--   `project_scoped_actions`      (see the note below — this one did nothing)
--   `project_scoped_actions_fix`
--
-- Until now the app was Project ZERO with the seams painted over. Two habits
-- made that structural rather than cosmetic:
--
-- 1. Every read policy was `USING (true)`. Any signed-in address could read
--    every row of every project. With one demo project that reads as a
--    permissive demo; with a second, real project on the same database it is a
--    data breach. Reads are now scoped to project membership.
--
-- 2. Every Action that created something resolved its project as "the first
--    project that exists" (`select id from projects order by created_at limit
--    1`). Harmless with one project. Silently, invisibly wrong with two — an
--    NCR raised on the Sardinia property would have been filed against the
--    ketch. `resolve_project()` replaces the guess, and raises rather than
--    picking when the caller belongs to more than one project.
--
-- Object-scoped Actions had a third version of the same bug: migration 012's
-- guard checked the role the caller held *somewhere*, not the role they hold on
-- the project that owns the object they are changing.
-- =============================================================================

-- ─── Step 1: foundations ─────────────────────────────────────────────────────

-- A property has no vessel. The column stays for yacht projects and goes null
-- for everything else.
alter table projects alter column vessel_id drop not null;

create or replace function is_project_member(p_project_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from project_members pm
     where pm.project_id = p_project_id
       and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  );
$fn$;

comment on function is_project_member(uuid) is
  'Whether the caller belongs to this project. The basis of every read policy.';

create or replace function current_actor_role(p_project_id uuid)
returns user_role language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select pm.role
    from project_members pm
   where pm.project_id = p_project_id
     and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
   limit 1;
$fn$;

create or replace function require_permission(p_action_key text, p_project_id uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role user_role := current_actor_role(p_project_id);
begin
  if v_role is null then
    raise exception 'You are not a member of this project' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from action_permissions ap
     where ap.action_key = p_action_key and ap.role = v_role
  ) then
    raise exception '% is not permitted for your role (%) on this project', p_action_key, v_role
      using errcode = 'P0001';
  end if;
end;
$fn$;

-- Resolves the object's own project, so a YARD_PM on one project cannot act on
-- another project's objects by virtue of being a member somewhere.
create or replace function require_permission_for_object(
  p_action_key text, p_object_type text, p_object_id uuid
)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare v_project_id uuid;
begin
  v_project_id := case p_object_type
    when 'DEFECT_RECORD'    then (select project_id from defect_records    where id = p_object_id)
    when 'WORK_PACKAGE'     then (select project_id from work_packages     where id = p_object_id)
    when 'INSPECTION_EVENT' then (select project_id from inspection_events where id = p_object_id)
    when 'OWNER_APPROVAL'   then (select project_id from owner_approvals   where id = p_object_id)
    when 'CHANGE_ORDER'     then (select project_id from change_orders     where id = p_object_id)
    when 'PROJECT'          then p_object_id
  end;
  if v_project_id is null then
    raise exception 'No % with that id', lower(replace(p_object_type, '_', ' '))
      using errcode = 'P0001';
  end if;
  perform require_permission(p_action_key, v_project_id);
end;
$fn$;

revoke execute on function
  is_project_member(uuid), current_actor_role(uuid),
  require_permission(text, uuid), require_permission_for_object(text, text, uuid)
from public, anon;
grant execute on function is_project_member(uuid), current_actor_role(uuid) to authenticated;

-- ─── Reads become membership-scoped ──────────────────────────────────────────

do $do$
declare t text;
begin
  foreach t in array array[
    'work_packages','inspection_events','defect_records','change_orders',
    'owner_approvals','documents','project_members','world_model_events','messages'
  ] loop
    execute format('drop policy if exists auth_all on %I', t);
    execute format('drop policy if exists read_messages on %I', t);
    execute format('drop policy if exists member_read on %I', t);
    execute format(
      'create policy member_read on %I for select to authenticated using (is_project_member(project_id))', t);
  end loop;
end $do$;

-- projects keys on `id`, not `project_id`.
drop policy if exists auth_all on projects;
drop policy if exists member_read on projects;
create policy member_read on projects for select to authenticated
  using (is_project_member(id));

-- A vessel is visible through the project that refits it.
drop policy if exists auth_all on vessels;
drop policy if exists member_read on vessels;
create policy member_read on vessels for select to authenticated
  using (exists (select 1 from projects p
                  where p.vessel_id = vessels.id and is_project_member(p.id)));

-- Worth re-checking after any policy change — sign in as a second address that
-- belongs to no project and confirm every one of these is 0:
--
--   select count(*) from defect_records;
--   select count(*) from messages;
--   select count(*) from work_packages;

-- ─── Creating a project ──────────────────────────────────────────────────────

create or replace function action_create_project(
  p_name text,
  p_project_type text default 'REFIT',
  p_yard_name text default null,
  p_yard_location text default null,
  p_planned_start date default null,
  p_planned_delivery date default null,
  p_budget_locked numeric default 0,
  p_class_society text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_actor_id uuid := current_actor_id();
  v_project projects;
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A project needs a name' using errcode = 'P0001';
  end if;

  insert into projects (
    vessel_id, name, project_type, phase, yard_name, yard_location,
    planned_start, planned_delivery, budget_locked, budget_spent,
    budget_contingency, class_society
  ) values (
    null, trim(p_name), p_project_type::project_type, 'PRE_SURVEY'::project_phase,
    nullif(trim(coalesce(p_yard_name, '')), ''),
    nullif(trim(coalesce(p_yard_location, '')), ''),
    p_planned_start, p_planned_delivery, coalesce(p_budget_locked, 0), 0, 0,
    nullif(p_class_society, '')::class_society
  ) returning * into v_project;

  -- The creator is its owner's rep, or nobody could read the project they just
  -- made — the read policies key on membership.
  insert into project_members (project_id, user_id, role, name, email)
  values (v_project.id, v_actor_id, 'OWNERS_REP'::user_role,
          coalesce(current_actor_name(), v_email), v_email);

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project.id, 'PROJECT_CREATED', 'PROJECT', v_project.id, null,
    jsonb_build_object('name', v_project.name, 'project_type', v_project.project_type),
    v_actor_id, coalesce(current_actor_name(), v_email)
  );

  return json_build_object('project', row_to_json(v_project));
end;
$fn$;

revoke execute on function
  action_create_project(text, text, text, text, date, date, numeric, text)
from public, anon;
grant execute on function
  action_create_project(text, text, text, text, date, date, numeric, text)
to authenticated;

-- ─── Step 2: the Actions stop guessing ───────────────────────────────────────

create or replace function resolve_project(p_explicit uuid)
returns uuid language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_ids uuid[];
begin
  if p_explicit is not null then
    return p_explicit;
  end if;
  select array_agg(distinct project_id) into v_ids
    from project_members where lower(email) = v_email;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'You are not a member of any project' using errcode = 'P0001';
  end if;
  -- Refusing beats picking. A silent wrong answer here files a finding on the
  -- wrong project and nobody notices for weeks.
  if array_length(v_ids, 1) > 1 then
    raise exception 'You belong to % projects — say which one this belongs to',
      array_length(v_ids, 1) using errcode = 'P0001';
  end if;
  return v_ids[1];
end;
$fn$;

revoke execute on function resolve_project(uuid) from public, anon;

-- ─── Step 3: rewriting the guards in place ───────────────────────────────────
--
-- The first attempt at this looped over a 2-D array and sliced it as
-- `pairs[i:i][1:3]`, which matches nothing in Postgres. The DO block ran, threw
-- no error, and changed not one function. It was caught only because the result
-- was verified afterwards — which is the argument for verifying afterwards.
-- Replaced with one explicit call per function, each returning what it did.

create or replace function rewrite_action_guard(
  p_action text, p_object_type text, p_id_param text
) returns text language plpgsql
set search_path = public, pg_temp
as $fn$
declare v_oid oid; v_def text; v_old text; v_new text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_action;
  if v_oid is null then return p_action || ': not found'; end if;

  v_def := pg_get_functiondef(v_oid);
  v_old := format('perform require_permission(%L);', p_action);
  v_new := format('perform require_permission_for_object(%L, %L, %s);',
                  p_action, p_object_type, p_id_param);

  if position('require_permission_for_object' in v_def) > 0 then
    return p_action || ': already object-scoped';
  end if;
  if position(v_old in v_def) = 0 then
    return p_action || ': GUARD NOT FOUND';
  end if;

  execute replace(v_def, v_old, v_new);
  return p_action || ': rewritten';
end;
$fn$;

select rewrite_action_guard('action_update_defect_status',        'DEFECT_RECORD',    'p_defect_id');
select rewrite_action_guard('action_record_inspection_result',    'INSPECTION_EVENT', 'p_inspection_id');
select rewrite_action_guard('action_decide_approval',             'OWNER_APPROVAL',   'p_approval_id');
select rewrite_action_guard('action_update_work_package',         'WORK_PACKAGE',     'p_work_package_id');
select rewrite_action_guard('action_link_defect_to_work_package', 'DEFECT_RECORD',    'p_defect_id');

drop function rewrite_action_guard(text, text, text);

-- The three creating Actions that still took "the first project" now resolve it.
do $do$
declare r record; v_def text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('action_create_work_package','action_schedule_inspection','action_post_message')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def,
      'select id into v_project_id from projects order by created_at limit 1;',
      'v_project_id := resolve_project(null);');
    execute v_def;
  end loop;
end $do$;

-- ⚠️ Still hardcoding 'a1b2c3d4-0002-0000-0000-000000000001', and still to do:
--   action_raise_defect, action_register_document, action_advance_project_phase
-- Each needs a p_project_id parameter threaded through resolve_project(), which
-- changes their signatures and therefore the client and the registry with them.
