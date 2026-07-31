-- =============================================================================
-- YAM Migration 017 — MEMBERSHIP BECOMES A LIFECYCLE
--
-- Applied to the live project as five migrations, in this order:
--   `add_project_member_object_type`   (must run alone: ALTER TYPE ADD VALUE)
--   `membership_lifecycle_columns`
--   `left_members_lose_access`
--   `membership_actions`
--   `membership_registry`
--
-- The gap this closes: there was no Action that added anyone to a project. The
-- only function that wrote to project_members was action_create_project, and it
-- enrolled the creator alone. So every project made through the app was
-- permanently a room of one, which put the roles, the permission matrix and the
-- whole conversation feature out of reach on any project but the seeded demo.
--
-- Shipping "New project" in migration 016 without this made it worse: the
-- button produced projects nobody else could ever join.
--
-- The design decision worth recording: an invited person appears on the team
-- IMMEDIATELY, before they have ever signed in. That is not a shortcut, it is
-- the point. The distance between invited_at and first_seen_at is a fact an
-- owner's rep wants -- "I sent you the link a week ago and you still have not
-- opened it" -- and it cannot be reconstructed after the fact.
-- =============================================================================

-- ─── Step 1 (own transaction) ────────────────────────────────────────────────

alter type object_type add value if not exists 'PROJECT_MEMBER';

-- ─── Step 2: the lifecycle columns ───────────────────────────────────────────

do $$ begin
  create type membership_status as enum ('INVITED', 'ACTIVE', 'LEFT');
exception when duplicate_object then null; end $$;

alter table project_members
  add column if not exists status membership_status not null default 'ACTIVE',
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by uuid,
  add column if not exists invited_by_name text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists left_at timestamptz,
  add column if not exists left_reason text;

create index if not exists project_members_status_idx
  on project_members (project_id, status);
create index if not exists project_members_email_idx
  on project_members (lower(email));

comment on column project_members.first_seen_at is
  'When this person first reached the project. NULL means they never have -- which, against invited_at, is the "you have not opened the link" measure.';
comment on column project_members.last_seen_at is
  'Heartbeat, refreshed at most every 30s by action_record_project_access. Recent means "here now"; it is not presence and does not need a socket.';
comment on column project_members.status is
  'INVITED until they first arrive, then ACTIVE. LEFT is how someone is removed -- rows are never deleted, so what they said and did stays attributable.';

-- The eight seeded members predate the invite flow. They are ACTIVE by the
-- column default, and first_seen_at deliberately stays NULL rather than being
-- backfilled with a guess: the UI shows "—" for their response time instead of
-- a number nobody measured. Live rows self-heal on the next page load.
update project_members
   set invited_at = coalesce(invited_at, created_at)
 where invited_at is null;

-- ─── Step 3: LEFT means gone ─────────────────────────────────────────────────
--
-- This is the part that makes removal mean something. is_project_member is the
-- predicate behind every read policy on every table; if it kept returning true
-- for a LEFT member, "remove from project" would be a label change and the
-- person would keep reading everything.
--
-- INVITED deliberately still counts. Someone invited who signs in has to be
-- able to see the project -- that first read is the whole point of the
-- invitation, and it is what flips them to ACTIVE.

create or replace function is_project_member(p_project_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from project_members pm
     where pm.project_id = p_project_id
       and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and pm.status <> 'LEFT'
  );
$fn$;

comment on function is_project_member(uuid) is
  'Whether the caller currently belongs to this project. The basis of every read policy. INVITED counts; LEFT does not.';

create or replace function current_actor_role(p_project_id uuid)
returns user_role language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select pm.role
    from project_members pm
   where pm.project_id = p_project_id
     and lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
     and pm.status <> 'LEFT'
   limit 1;
$fn$;

create or replace function current_actor_name()
returns text language sql stable security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select pm.name
       from project_members pm
      where lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
        and pm.status <> 'LEFT'
      order by pm.last_seen_at desc nulls last
      limit 1),
    nullif(auth.jwt() ->> 'email', ''),
    'Unknown'
  );
$fn$;

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
    if not exists (
      select 1 from project_members
       where project_id = p_explicit and lower(email) = v_email and status <> 'LEFT'
    ) then
      raise exception 'You are not a member of that project' using errcode = 'P0001';
    end if;
    return p_explicit;
  end if;

  select array_agg(distinct project_id) into v_ids
    from project_members where lower(email) = v_email and status <> 'LEFT';

  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'You are not a member of any project' using errcode = 'P0001';
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'You belong to % projects - say which one this belongs to',
      array_length(v_ids, 1) using errcode = 'P0001';
  end if;
  return v_ids[1];
end;
$fn$;

-- Two Actions read the role directly to stamp a message's author_role. Not an
-- authorization path, but it should not resurrect a LEFT row's role either.
do $do$
declare r record; v_def text;
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('action_update_defect_status', 'action_amend_defect_impact')
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('and lower(email) = lower(nullif(auth.jwt() ->> ''email'', '''')) limit 1;' in v_def) > 0
       and position('status <> ''LEFT''' in v_def) = 0 then
      execute replace(v_def,
        'and lower(email) = lower(nullif(auth.jwt() ->> ''email'', '''')) limit 1;',
        'and lower(email) = lower(nullif(auth.jwt() ->> ''email'', '''')) and status <> ''LEFT'' limit 1;');
    end if;
  end loop;
end $do$;

-- Verify the string replacement above actually landed, rather than trusting
-- "migration succeeded" (see migration 014's silent no-op):
--
--   select p.proname, position('status <> ''LEFT''' in pg_get_functiondef(p.oid)) > 0
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('is_project_member','current_actor_role','current_actor_name',
--                        'resolve_project','action_update_defect_status',
--                        'action_amend_defect_impact');
--   -- all six must be true

-- ─── Step 4: the Actions ─────────────────────────────────────────────────────

create or replace function action_invite_member(
  p_project_id uuid,
  p_email text,
  p_role text,
  p_name text default null,
  p_company text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_role user_role;
  v_before project_members;
  v_after project_members;
begin
  perform require_permission('action_invite_member', v_project_id);

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That is not an email address' using errcode = 'P0001';
  end if;

  begin
    v_role := p_role::user_role;
  exception when invalid_text_representation then
    raise exception 'Unknown role: %', p_role using errcode = 'P0001';
  end;

  select * into v_before from project_members
   where project_id = v_project_id and lower(email) = v_email;

  if found and v_before.status <> 'LEFT' then
    raise exception '% is already on this project', v_before.name
      using errcode = 'P0001';
  end if;

  if found then
    -- Re-inviting someone who left. The row is reused so their history, and
    -- everything attributed to them, stays attached to one identity.
    update project_members
       set status = 'INVITED', role = v_role,
           name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
           company = coalesce(nullif(trim(coalesce(p_company, '')), ''), company),
           invited_at = now(), invited_by = v_actor_id, invited_by_name = v_actor_name,
           left_at = null, left_reason = null
     where id = v_before.id
    returning * into v_after;
  else
    insert into project_members (
      project_id, user_id, role, name, email, company,
      status, invited_at, invited_by, invited_by_name
    ) values (
      v_project_id, null, v_role,
      coalesce(nullif(trim(coalesce(p_name, '')), ''), split_part(v_email, '@', 1)),
      v_email,
      nullif(trim(coalesce(p_company, '')), ''),
      'INVITED', now(), v_actor_id, v_actor_name
    ) returning * into v_after;
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'MEMBER_INVITED', 'PROJECT_MEMBER', v_after.id,
    case when v_before.id is null then null
         else jsonb_build_object('status', v_before.status, 'role', v_before.role) end,
    jsonb_build_object('status', v_after.status, 'role', v_after.role,
                       'name', v_after.name, 'email', v_after.email),
    v_actor_id, v_actor_name
  );

  return json_build_object('member', row_to_json(v_after));
end;
$fn$;

comment on function action_invite_member is
  'Adds someone to a project as INVITED. They appear on the team immediately; the gap to first_seen_at is how long they took to turn up. Re-invites a LEFT member onto their original row so nothing detaches from them.';

-- Called by the client on load. Writes no event except the first time, when
-- INVITED becomes ACTIVE -- a heartbeat every minute in the audit trail would
-- bury the history it is supposed to preserve.
create or replace function action_record_project_access(p_project_id uuid)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_before project_members;
  v_after project_members;
  v_first boolean;
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;

  select * into v_before from project_members
   where project_id = p_project_id and lower(email) = v_email and status <> 'LEFT';
  if not found then
    raise exception 'You are not a member of that project' using errcode = 'P0001';
  end if;

  v_first := v_before.first_seen_at is null;

  -- Throttled server-side: a client that calls this on every render costs one
  -- no-op statement rather than a write per keystroke.
  if not v_first and v_before.last_seen_at > now() - interval '30 seconds' then
    return json_build_object('member', row_to_json(v_before), 'first_visit', false);
  end if;

  update project_members
     set first_seen_at = coalesce(first_seen_at, now()),
         last_seen_at = now(),
         status = case when status = 'INVITED' then 'ACTIVE'::membership_status else status end,
         user_id = coalesce(user_id, auth.uid())
   where id = v_before.id
  returning * into v_after;

  if v_first then
    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      p_project_id, 'MEMBER_JOINED', 'PROJECT_MEMBER', v_after.id,
      jsonb_build_object('status', v_before.status, 'invited_at', v_before.invited_at),
      jsonb_build_object('status', v_after.status, 'first_seen_at', v_after.first_seen_at,
                         'took', case when v_before.invited_at is null then null
                                 else extract(epoch from (v_after.first_seen_at - v_before.invited_at))::bigint end),
      current_actor_id(), v_after.name
    );
  end if;

  return json_build_object('member', row_to_json(v_after), 'first_visit', v_first);
end;
$fn$;

comment on function action_record_project_access is
  'Heartbeat. Stamps first_seen_at once, refreshes last_seen_at at most every 30 seconds, and flips INVITED to ACTIVE on first arrival. Only that first transition writes an event.';

create or replace function action_change_member_role(
  p_project_id uuid,
  p_member_id uuid,
  p_role text,
  p_reason text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role;
  v_before project_members;
  v_after project_members;
begin
  perform require_permission('action_change_member_role', v_project_id);

  select * into v_before from project_members
   where id = p_member_id and project_id = v_project_id;
  if not found then
    raise exception 'No member with that id on this project' using errcode = 'P0001';
  end if;

  begin
    v_role := p_role::user_role;
  exception when invalid_text_representation then
    raise exception 'Unknown role: %', p_role using errcode = 'P0001';
  end;

  if v_role = v_before.role then
    raise exception '% already holds that role', v_before.name using errcode = 'P0001';
  end if;

  update project_members set role = v_role where id = p_member_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'MEMBER_ROLE_CHANGED', 'PROJECT_MEMBER', v_after.id,
    jsonb_build_object('role', v_before.role),
    jsonb_build_object('role', v_after.role, 'name', v_after.name,
                       'reason', nullif(trim(coalesce(p_reason, '')), '')),
    v_actor_id, v_actor_name
  );

  return json_build_object('member', row_to_json(v_after));
end;
$fn$;

create or replace function action_remove_member(
  p_project_id uuid,
  p_member_id uuid,
  p_reason text
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before project_members;
  v_after project_members;
  v_remaining int;
begin
  perform require_permission('action_remove_member', v_project_id);

  select * into v_before from project_members
   where id = p_member_id and project_id = v_project_id;
  if not found then
    raise exception 'No member with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.status = 'LEFT' then
    raise exception '% has already left this project', v_before.name using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why % is leaving', v_before.name using errcode = 'P0001';
  end if;

  -- Removing the last member would make the project unreachable by anyone, for
  -- good: nothing can be deleted and nobody would be left who could invite.
  select count(*) into v_remaining from project_members
   where project_id = v_project_id and status <> 'LEFT' and id <> p_member_id;
  if v_remaining = 0 then
    raise exception 'This is the last member -- removing them would lock the project permanently'
      using errcode = 'P0001';
  end if;

  update project_members
     set status = 'LEFT', left_at = now(), left_reason = v_reason
   where id = p_member_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'MEMBER_REMOVED', 'PROJECT_MEMBER', v_after.id,
    jsonb_build_object('status', v_before.status, 'role', v_before.role),
    jsonb_build_object('status', v_after.status, 'name', v_after.name,
                       'left_at', v_after.left_at, 'reason', v_reason),
    v_actor_id, v_actor_name
  );

  -- The row stays, so every message, NCR and approval they authored keeps a
  -- name attached to it. Removing access is not the same as unhappening them.
  return json_build_object('member', row_to_json(v_after));
end;
$fn$;

comment on function action_remove_member is
  'Ends someone''s access by setting LEFT. The row is never deleted, so everything they authored keeps its author. Refuses to remove the last remaining member.';

revoke execute on function action_invite_member(uuid, text, text, text, text) from public, anon;
grant  execute on function action_invite_member(uuid, text, text, text, text) to authenticated;
revoke execute on function action_record_project_access(uuid) from public, anon;
grant  execute on function action_record_project_access(uuid) to authenticated;
revoke execute on function action_change_member_role(uuid, uuid, text, text) from public, anon;
grant  execute on function action_change_member_role(uuid, uuid, text, text) to authenticated;
revoke execute on function action_remove_member(uuid, uuid, text) from public, anon;
grant  execute on function action_remove_member(uuid, uuid, text) to authenticated;

-- Who may staff a project. Deliberately narrow: a subcontractor being able to
-- add people to someone else's job is how a supply chain becomes a guest list.
insert into action_permissions (action_key, role) values
  ('action_invite_member', 'OWNER'),
  ('action_invite_member', 'OWNERS_REP'),
  ('action_invite_member', 'YARD_PM'),
  ('action_change_member_role', 'OWNER'),
  ('action_change_member_role', 'OWNERS_REP'),
  ('action_remove_member', 'OWNER'),
  ('action_remove_member', 'OWNERS_REP')
on conflict do nothing;

-- ─── Step 5: registry ────────────────────────────────────────────────────────

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('PROJECT_MEMBER', 'Project member', 'project_members',
        'Someone on the project, and their whole arc: invited by whom and when, when they first turned up, what role they hold, and when they left. Rows are never deleted, so everything a person authored keeps its author.', 11)
on conflict (key) do update set
  label = excluded.label, table_name = excluded.table_name,
  description = excluded.description, display_order = excluded.display_order;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
values ('PROJECT_MEMBER', 'PROJECT', 'works on', 'MANY_TO_ONE', 'project_id')
on conflict do nothing;

insert into ontology_actions
  (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_invite_member', 'Invite to project',
   'Adds someone to the project by email address. They appear on the team straight away as INVITED and become ACTIVE the first time they actually open it, so the delay between the two is recorded. No account is created - membership is keyed on the address, so signing in with it is what grants access. Re-inviting someone who left reuses their original row.',
   'PROJECT_MEMBER',
   '[{"name":"p_project_id","type":"uuid"},
     {"name":"p_email","type":"text","required":true},
     {"name":"p_role","type":"enum","required":true,"values":["OWNER","OWNERS_REP","CAPTAIN","YARD_PM","CLASS_SURVEYOR","NAVAL_ARCHITECT","SUBCONTRACTOR"]},
     {"name":"p_name","type":"text"},
     {"name":"p_company","type":"text"}]'::jsonb,
   '{}'::text[], true),

  ('action_change_member_role', 'Change a member''s role',
   'Changes what someone on this project is allowed to do. The previous role is kept in the event log.',
   'PROJECT_MEMBER',
   '[{"name":"p_project_id","type":"uuid"},
     {"name":"p_member_id","type":"uuid","required":true},
     {"name":"p_role","type":"enum","required":true,"values":["OWNER","OWNERS_REP","CAPTAIN","YARD_PM","CLASS_SURVEYOR","NAVAL_ARCHITECT","SUBCONTRACTOR"]},
     {"name":"p_reason","type":"text"}]'::jsonb,
   '{}'::text[], true),

  -- Deliberately NOT agent-usable. Ending someone's access to a live job should
  -- be a person clicking a button, not a model acting on a sentence it read.
  ('action_remove_member', 'Remove from project',
   'Ends someone''s access. Their row is kept with status LEFT, so every message, finding and approval they authored still has an author. A reason is required. Refuses to remove the last remaining member, which would lock the project permanently.',
   'PROJECT_MEMBER',
   '[{"name":"p_project_id","type":"uuid"},
     {"name":"p_member_id","type":"uuid","required":true},
     {"name":"p_reason","type":"text","required":true}]'::jsonb,
   '{}'::text[], false)
on conflict (key) do update set
  label = excluded.label, description = excluded.description,
  target_type = excluded.target_type, parameters = excluded.parameters,
  cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;

-- ─── Verified against the live database ──────────────────────────────────────
--
-- Twelve probes, all inside rolled-back transactions:
--
--   invite a new person                  → INVITED, invited_by recorded, first_seen never
--   invite the same person twice         → refused
--   invite a malformed address           → refused
--   INVITED person reads the project     → sees it (this is what the invite is for)
--   first access                         → flips to ACTIVE, first_visit=true
--   second access within 30s             → no-op
--   time from invite to arrival          → recorded
--   MEMBER_JOINED event                  → written once, attributed to the arriver
--   remove without a reason              → refused
--   remove with a reason                 → LEFT, row kept
--   LEFT member reads projects/NCRs/msgs → 0, 0, 0
--   LEFT member posts a message          → refused
--   re-invite                            → reuses the original row id
--   remove the last member               → refused
--   subcontractor invites or removes     → refused
--   invite into a project I am not on    → refused
