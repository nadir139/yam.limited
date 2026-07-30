-- =============================================================================
-- YAM Migration 016 — THE ACTIONS TAKE A PROJECT
--
-- Applied to the live project as four migrations, in this order:
--   `actions_take_an_explicit_project`
--   `project_type_property`                 (must run alone: ALTER TYPE ADD VALUE)
--   `post_message_resolves_role_on_its_project`
--   `helpers_resolve_role_per_project`
--
-- Migration 014 scoped the reads and rewrote the object-scoped Actions, and
-- stopped there. This finishes the job. Two holes it closes, neither visible
-- from the interface:
--
-- 1. `resolve_project(p_explicit)` returned p_explicit UNCHECKED. Unreachable
--    with one project. With two it is an escalation: name any project's uuid
--    and the Action writes into it.
--
-- 2. Six creating Actions called the one-argument `require_permission(key)`,
--    which asks "does this caller hold a permitting role ANYWHERE" rather than
--    "on this project". A YARD_PM on the ketch could have raised NCRs against
--    somebody else's property. It is the same bug 014 fixed for the
--    object-scoped Actions and never applied to the creating ones.
--
-- The lesson from 014's silent no-op DO block is applied throughout: every
-- rewrite returns a status string, and the results were asserted afterwards
-- with a query, not assumed from "migration succeeded".
-- =============================================================================

-- ─── Step 1: the resolver stops trusting its argument ────────────────────────

create or replace function resolve_project(p_explicit uuid)
returns uuid language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_ids uuid[];
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;

  if p_explicit is not null then
    -- The caller names a project; they still have to belong to it.
    if not exists (
      select 1 from project_members
       where project_id = p_explicit and lower(email) = v_email
    ) then
      raise exception 'You are not a member of that project' using errcode = 'P0001';
    end if;
    return p_explicit;
  end if;

  select array_agg(distinct project_id) into v_ids
    from project_members where lower(email) = v_email;

  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'You are not a member of any project' using errcode = 'P0001';
  end if;
  -- Refusing beats picking: a silent wrong answer files a finding on the wrong
  -- project and nobody notices for weeks.
  if array_length(v_ids, 1) > 1 then
    raise exception 'You belong to % projects - say which one this belongs to',
      array_length(v_ids, 1) using errcode = 'P0001';
  end if;
  return v_ids[1];
end;
$fn$;

revoke execute on function resolve_project(uuid) from public, anon;
grant execute on function resolve_project(uuid) to authenticated;

-- ─── Step 2: p_project_id threaded through the six creating Actions ─────────
--
-- Done by rewriting each definition rather than restating ~600 lines of Action
-- bodies. Adding a parameter needs a new signature, so each is recreated and
-- the old one dropped by its exact identity arguments.

create or replace function add_project_param(p_action text)
returns text language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_oid oid; v_ident text; v_def text; v_new text; v_before text;
begin
  select p.oid, pg_get_function_identity_arguments(p.oid)
    into v_oid, v_ident
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_action;
  if v_oid is null then return p_action || ': NOT FOUND'; end if;

  v_def := pg_get_functiondef(v_oid);
  if position('p_project_id' in v_def) > 0 then
    return p_action || ': already takes a project';
  end if;

  v_before := v_def;

  -- 1. Signature. The zero-argument case needs its own form or it produces
  --    "(, p_project_id ...)".
  if v_ident = '' then
    v_new := replace(v_def, '()' || E'\n RETURNS json',
                            '(p_project_id uuid DEFAULT NULL::uuid)' || E'\n RETURNS json');
  else
    v_new := replace(v_def, ')' || E'\n RETURNS json',
                            ', p_project_id uuid DEFAULT NULL::uuid)' || E'\n RETURNS json');
  end if;
  if v_new = v_before then return p_action || ': SIGNATURE NOT MATCHED'; end if;

  -- 2. However it used to decide the project, it now asks.
  v_new := replace(v_new,
    'v_project_id uuid := ''a1b2c3d4-0002-0000-0000-000000000001'';',
    'v_project_id uuid := resolve_project(p_project_id);');
  v_new := replace(v_new,
    'v_project_id := resolve_project(null);',
    'v_project_id := resolve_project(p_project_id);');

  -- 3. The guard asks about the role held on THAT project. resolve_project is
  --    stable and called again here deliberately: in three of these the body
  --    assigns v_project_id after the guard runs.
  v_new := replace(v_new,
    format('perform require_permission(%L);', p_action),
    format('perform require_permission(%L, resolve_project(p_project_id));', p_action));

  if position('a1b2c3d4-0002-0000-0000-000000000001' in v_new) > 0 then
    return p_action || ': STILL HARDCODES PROJECT ZERO';
  end if;
  if position(format('perform require_permission(%L, resolve_project', p_action) in v_new) = 0 then
    return p_action || ': GUARD NOT REWRITTEN';
  end if;

  execute v_new;
  execute format('drop function public.%I(%s)', p_action, v_ident);
  return p_action || ': rewritten';
end;
$fn$;

-- Each of these returned ': rewritten'. Verified afterwards with the query at
-- the bottom of this file — all six take p_project_id, none mentions Project
-- ZERO, every guard is project-scoped, and no old overload survives.
select add_project_param('action_raise_defect');
select add_project_param('action_register_document');
select add_project_param('action_advance_project_phase');
select add_project_param('action_create_work_package');
select add_project_param('action_schedule_inspection');
select add_project_param('action_post_message');

drop function add_project_param(text);

-- Grants follow the new signatures.
do $do$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'action\_%'
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon', r.proname, r.args);
    execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  end loop;
end $do$;

-- The unscoped guard is removed, not merely unused. Leaving
-- require_permission(text) in place would let the next Action written pick the
-- wrong one by autocomplete and reintroduce the hole silently.
drop function if exists require_permission(text);
drop function if exists current_actor_role();

-- ─── Step 3: PROPERTY (own transaction) ─────────────────────────────────────
--
-- A building is not a refit. Filing the Sardinia property as REFIT would put a
-- wrong word on every screen that renders project_type, and the ontology is
-- the product. Additive, so nothing existing moves.
alter type project_type add value if not exists 'PROPERTY';

-- ─── Step 4: two helpers the first scan missed ───────────────────────────────
--
-- Both called the now-dropped current_actor_role(), and neither is an Action so
-- neither matched the `action\_%` scan. require_approval_authority is the
-- Tier-3 owner gate called from action_decide_approval, so between step 2 and
-- this every owner approval failed outright with "function
-- current_actor_role() does not exist". Caught by a probe, not by review — the
-- argument for exercising an Action after changing anything underneath it.

create or replace function action_post_message(
  p_body text,
  p_kind text default 'NOTE',
  p_linked_object_type text default null,
  p_linked_object_id uuid default null,
  p_source text default 'APP',
  p_meeting_ref text default null,
  p_project_id uuid default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role;
  v_project_id uuid;
  v_msg messages;
begin
  v_project_id := resolve_project(p_project_id);
  perform require_permission('action_post_message', v_project_id);

  if coalesce(trim(p_body), '') = '' then
    raise exception 'A message cannot be empty' using errcode = 'P0001';
  end if;
  if length(p_body) > 8000 then
    raise exception 'Message is too long (limit 8000 characters)' using errcode = 'P0001';
  end if;
  if (p_linked_object_type is null) <> (p_linked_object_id is null) then
    raise exception 'Link both an object type and an id, or neither'
      using errcode = 'P0001';
  end if;

  -- After v_project_id, not in DECLARE: a person can hold different roles on
  -- different projects, and the message records the one they wore here.
  v_role := current_actor_role(v_project_id);

  insert into messages (
    project_id, body, kind, source, author_id, author_name, author_role,
    linked_object_type, linked_object_id, meeting_ref
  ) values (
    v_project_id, trim(p_body), p_kind::message_kind, p_source::message_source,
    v_actor_id, v_actor_name, v_role,
    nullif(p_linked_object_type, '')::object_type, p_linked_object_id,
    nullif(trim(coalesce(p_meeting_ref, '')), '')
  ) returning * into v_msg;

  -- Deliberately no world_model_events row. Messages are already append-only
  -- and immutable, so an event would restate the same fact and bury the object
  -- histories under chatter. Nothing is lost either way.

  return json_build_object('message', row_to_json(v_msg));
end;
$fn$;

revoke execute on function
  action_post_message(text, text, text, uuid, text, text, uuid) from public, anon;
grant execute on function
  action_post_message(text, text, text, uuid, text, text, uuid) to authenticated;

create or replace function require_approval_authority(p_approval_id uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_tier approval_tier;
  v_project_id uuid;
  v_role user_role;
begin
  select tier, project_id into v_tier, v_project_id
    from owner_approvals where id = p_approval_id;
  if v_project_id is null then
    raise exception 'No approval with that id' using errcode = 'P0001';
  end if;

  -- OWNER on the ketch is not OWNER on somebody else's property.
  v_role := current_actor_role(v_project_id);

  if v_tier = 'TIER_3' and v_role is distinct from 'OWNER' then
    raise exception
      'Tier 3 approvals (over EUR 50,000) are the owner''s decision; your role is %', v_role
      using errcode = 'P0001';
  end if;
end;
$fn$;

revoke execute on function require_approval_authority(uuid) from public, anon;

drop function if exists can_perform(text);

create or replace function can_perform(p_action_key text, p_project_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from action_permissions ap
     where ap.action_key = p_action_key
       and ap.role = current_actor_role(p_project_id)
  );
$fn$;

revoke execute on function can_perform(text, uuid) from public, anon;
grant execute on function can_perform(text, uuid) to authenticated;

-- ─── Registry ────────────────────────────────────────────────────────────────

update ontology_actions
   set parameters = parameters || '[{"name":"p_project_id","type":"uuid"}]'::jsonb
 where key in ('action_raise_defect','action_register_document',
               'action_advance_project_phase','action_create_work_package',
               'action_schedule_inspection','action_post_message')
   and not (parameters @> '[{"name":"p_project_id"}]'::jsonb);

-- action_create_project is registered but NOT agent-usable. Starting a project
-- is a deliberate human act, and an agent that can create one can also create
-- somewhere to hide work.
insert into ontology_actions
  (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_create_project', 'Create project',
   'Starts a new project. The creator becomes its owner''s representative, which is what makes it readable to them at all. A project needs no vessel - project_type PROPERTY covers buildings, where the vessel link stays empty.',
   'PROJECT',
   '[{"name":"p_name","type":"text","required":true},
     {"name":"p_project_type","type":"enum","values":["FIVE_YEAR_SURVEY","REFIT","NEWBUILD","ANNUAL_SURVEY","DAMAGE_REPAIR","PROPERTY"]},
     {"name":"p_yard_name","type":"text"},
     {"name":"p_yard_location","type":"text"},
     {"name":"p_planned_start","type":"date"},
     {"name":"p_planned_delivery","type":"date"},
     {"name":"p_budget_locked","type":"numeric"},
     {"name":"p_class_society","type":"text"}]'::jsonb,
   '{}'::text[], false)
on conflict (key) do update set
  label = excluded.label, description = excluded.description,
  target_type = excluded.target_type, parameters = excluded.parameters,
  cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;

-- ─── Verify ──────────────────────────────────────────────────────────────────
--
-- Run this after any change to the Actions layer. Every row must read true,
-- true, true, 1 — except action_create_project, which has no project to be
-- scoped to because it makes one.
--
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) like '%p_project_id uuid%'
--            as takes_project,
--          position('a1b2c3d4-0002' in pg_get_functiondef(p.oid)) = 0
--            as no_hardcoded_project,
--          (position('require_permission(''' || p.proname || ''', '
--                    in pg_get_functiondef(p.oid)) > 0
--           or position('require_permission_for_object'
--                    in pg_get_functiondef(p.oid)) > 0) as scoped_guard,
--          (select count(*) from pg_proc q
--             join pg_namespace m on m.oid = q.pronamespace
--            where m.nspname = 'public' and q.proname = p.proname) as overloads
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname like 'action\_%'
--    order by 1;
--
-- And nothing anywhere may still call a dropped signature:
--
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prokind = 'f'
--      and (pg_get_functiondef(p.oid) ~ 'current_actor_role\(\)'
--        or pg_get_functiondef(p.oid) ~ 'require_permission\(''[a-z_]+''\)'
--        or pg_get_functiondef(p.oid) ~ 'can_perform\(''[a-z_]+''\)');
--   -- must return zero rows
