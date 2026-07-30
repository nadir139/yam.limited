-- =============================================================================
-- YAM Migration 013 — CONVERSATION, AND NOTHING GETS DELETED
--
-- Applied to the live project as three migrations, in this order:
--   `add_message_object_type`   (must run alone: ALTER TYPE ADD VALUE cannot be
--                                used in the same transaction that uses it)
--   `nothing_can_be_deleted`
--   `project_messages`
--
-- Two things:
--
-- 1. TRUNCATE was granted to anon and authenticated on all 15 tables. TRUNCATE
--    bypasses row-level security entirely, so a holder of the public anon key
--    could have emptied defect_records in one statement and no policy would
--    have looked at it. Migration 008 revoked INSERT/UPDATE/DELETE and missed
--    this. Closed here, along with the default privileges that let migration
--    009's tables silently pick write grants back up.
--
-- 2. Communication becomes part of the world model rather than sitting beside
--    it. A message hangs off the object it is about, using the same polymorphic
--    link documents already use, so "what did the yard say about the chiller"
--    is answerable — the conversation is attached to the chiller's work
--    package, not filed in a room called #general. Registering MESSAGE in the
--    ontology means the agent's tools for it are generated, not written.
-- =============================================================================

-- ─── Step 1 (own transaction) ────────────────────────────────────────────────

alter type object_type add value if not exists 'MESSAGE';

-- ─── Step 2: nothing can be deleted ─────────────────────────────────────────

revoke truncate on all tables in schema public from anon, authenticated;
revoke trigger, references on all tables in schema public from anon, authenticated;

-- Tables created after this must not quietly pick the grants back up, which is
-- exactly how the ontology_* tables ended up writable in 009.
alter default privileges in schema public
  revoke insert, update, delete, truncate, trigger, references
  on tables from anon, authenticated;

-- After this, `anon` and `authenticated` hold SELECT and nothing else, on every
-- table. Worth re-checking after any schema change:
--
--   select grantee, string_agg(distinct privilege_type, ',') from
--     information_schema.role_table_grants
--    where grantee in ('anon','authenticated') and table_schema='public'
--    group by grantee;   -- must be exactly: SELECT

-- ─── Step 3: messages ────────────────────────────────────────────────────────

do $$ begin
  create type message_kind as enum ('NOTE', 'DECISION', 'UNPLANNED_WORK', 'MEETING_NOTE', 'HANDOVER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_source as enum ('APP', 'MEETING', 'EMAIL');
exception when duplicate_object then null; end $$;

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null,
  body text not null,
  kind message_kind not null default 'NOTE',
  source message_source not null default 'APP',
  author_id uuid,
  author_name text not null,
  author_role user_role,
  -- Null on both means the project-wide channel.
  linked_object_type object_type,
  linked_object_id uuid,
  -- Groups an imported transcript so a meeting reads as one thing. The hook for
  -- video: a transcript arrives as messages with source = MEETING sharing a ref,
  -- and lands in the same thread as what people typed.
  meeting_ref text,
  created_at timestamptz not null default now()
);

create index if not exists messages_linked_idx
  on messages (linked_object_type, linked_object_id, created_at);
create index if not exists messages_project_idx on messages (project_id, created_at desc);
create index if not exists messages_kind_idx on messages (kind, created_at desc);

alter table messages enable row level security;

do $$ begin
  create policy "read_messages" on messages for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on messages to authenticated;
revoke insert, update, delete, truncate on messages from anon, authenticated;

comment on table messages is
  'Project conversation. Append-only: there is no Action that edits or deletes a message, and no role holds UPDATE or DELETE. What was said stays said.';

create or replace function action_post_message(
  p_body text,
  p_kind text default 'NOTE',
  p_linked_object_type text default null,
  p_linked_object_id uuid default null,
  p_source text default 'APP',
  p_meeting_ref text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role := current_actor_role();
  v_project_id uuid;
  v_msg messages;
begin
  perform require_permission('action_post_message');

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

  select id into v_project_id from projects order by created_at limit 1;

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

comment on function action_post_message is
  'Posts a message, optionally attached to an object. UNPLANNED_WORK is how work done outside the agreed scope gets recorded.';

revoke execute on function
  action_post_message(text, text, text, uuid, text, text) from public, anon;
grant execute on function
  action_post_message(text, text, text, uuid, text, text) to authenticated;

-- Everyone on the project can talk. Excluding anyone would leave the world
-- model with a hole exactly where the site knowledge lives.
insert into action_permissions (action_key, role) values
  ('action_post_message', 'OWNER'),
  ('action_post_message', 'OWNERS_REP'),
  ('action_post_message', 'CAPTAIN'),
  ('action_post_message', 'YARD_PM'),
  ('action_post_message', 'CLASS_SURVEYOR'),
  ('action_post_message', 'NAVAL_ARCHITECT'),
  ('action_post_message', 'SUBCONTRACTOR')
on conflict do nothing;

-- ─── Registry ────────────────────────────────────────────────────────────────

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('MESSAGE', 'Message', 'messages',
        'What people said, attached to the object they said it about. Site knowledge, decisions, and work done outside the plan.', 10)
on conflict (key) do update set
  label = excluded.label, table_name = excluded.table_name,
  description = excluded.description, display_order = excluded.display_order;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
values ('MESSAGE', 'PROJECT', 'posted in', 'MANY_TO_ONE', 'project_id')
on conflict do nothing;

insert into ontology_actions
  (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_post_message', 'Post message',
   'Adds a message to the project conversation, optionally attached to an object. Use kind UNPLANNED_WORK to record work done outside the agreed scope, DECISION for something settled, MEETING_NOTE for what came out of a meeting.',
   'MESSAGE',
   '[{"name":"p_body","type":"text","required":true},
     {"name":"p_kind","type":"enum","values":["NOTE","DECISION","UNPLANNED_WORK","MEETING_NOTE","HANDOVER"]},
     {"name":"p_linked_object_type","type":"enum","values":["VESSEL","PROJECT","WORK_PACKAGE","CHANGE_ORDER","INSPECTION_EVENT","DEFECT_RECORD","OWNER_APPROVAL","DOCUMENT","SUBCONTRACTOR"]},
     {"name":"p_linked_object_id","type":"uuid"},
     {"name":"p_source","type":"enum","values":["APP","MEETING","EMAIL"]},
     {"name":"p_meeting_ref","type":"text"}]'::jsonb,
   '{}'::text[], true)
on conflict (key) do update set
  label = excluded.label, description = excluded.description,
  target_type = excluded.target_type, parameters = excluded.parameters,
  cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;
