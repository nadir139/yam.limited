-- =============================================================================
-- YAM Migration 019 — A MENTION IS AN OBLIGATION
--
-- Applied to the live project as five migrations, in this order:
--   `add_action_item_object_type`   (must run alone: ALTER TYPE ADD VALUE)
--   `action_items_table`
--   `mentions_create_action_items`
--   `add_crew_role`                 (must run alone: ALTER TYPE ADD VALUE)
--   `crew_permissions`
--
-- The problem this solves, in the words it arrived in: somebody wrote on
-- WP-PAINT-002 — "Will need to have the chef prepare food for the varnishers -
-- 1 of the 3 is vegetarian so let's make a vegetarian option @chef". Three
-- things were wrong with that sentence as stored.
--
--   1. "@chef" was text. It named nobody. There was no chef on the project and
--      no way to put one there without calling her the captain.
--   2. Nothing happened. The request lived in a paragraph on a page she had no
--      reason to open, and would be discovered on the 5th of August or not.
--   3. The only fix available was a second system — her own list — which means
--      typing the same fact twice and letting the two versions drift.
--
-- So: naming a project member in a message creates an ACTION_ITEM for them in
-- the same transaction. It is assigned to who was named, it carries the object
-- the thread hangs off, and its due date is that object's own planned start.
-- The chef's job list is `select * from action_items where assignee = me`. She
-- never types anything into it, and neither does anyone else -- there is no
-- Action that takes an assignee and a date, deliberately.
--
-- And it does not go away by being ignored. An item stays OPEN until the person
-- named answers in their own words, and the answer is posted back into the
-- thread the request came from. That is the difference between having been told
-- and having agreed, and it is the whole reason to model this as an object
-- rather than as a notification.
-- =============================================================================

-- ─── Step 1 (own transaction) ────────────────────────────────────────────────

alter type object_type add value if not exists 'ACTION_ITEM';

-- ─── Step 2: the object ──────────────────────────────────────────────────────

do $$ begin
  create type action_item_status as enum ('OPEN', 'ACKNOWLEDGED', 'DONE', 'DECLINED');
exception when duplicate_object then null; end $$;

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,

  -- The message that asked. An action item never exists without one: the
  -- request and the record of the request are the same fact.
  message_id uuid not null references messages(id),

  -- Inherited from that message, so the item carries the work package (or NCR,
  -- or inspection) it was asked about rather than arriving context-free.
  linked_object_type object_type,
  linked_object_id uuid,
  context_label text,

  assignee_member_id uuid not null references project_members(id),
  assignee_name text not null,
  assignee_email text not null,

  raised_by uuid,
  raised_by_name text not null,

  body text not null,

  -- Taken from the linked object's own dates, not typed in by anybody. The
  -- point of the feature is that being mentioned is the entire data entry.
  due_date date,
  due_date_source text,

  status action_item_status not null default 'OPEN',

  acknowledged_at timestamptz,
  response text,
  response_message_id uuid references messages(id),

  completed_at timestamptz,
  completion_note text,

  created_at timestamptz not null default now(),

  constraint action_items_one_per_mention unique (message_id, assignee_member_id)
);

comment on table action_items is
  'An obligation created by naming someone in a message. Nobody files these -- they are a consequence of being mentioned, and they answer back into the same thread.';
comment on column action_items.due_date is
  'Inherited from the linked object (a work package''s planned_start), never entered. NULL when the message was not attached to anything dated.';
comment on column action_items.due_date_source is
  'Which field the due date came from, so a date nobody typed can still be explained.';
comment on column action_items.response is
  'The answer. An item is not ACKNOWLEDGED until its assignee has said something -- that is what makes a mention different from a notification.';

create index if not exists action_items_project_idx on action_items (project_id, status);
create index if not exists action_items_assignee_idx on action_items (assignee_member_id, status);
create index if not exists action_items_email_idx on action_items (lower(assignee_email), status);
create index if not exists action_items_linked_idx on action_items (linked_object_type, linked_object_id);
create index if not exists action_items_message_idx on action_items (message_id);

alter table action_items enable row level security;

drop policy if exists action_items_read on action_items;
create policy action_items_read on action_items
  for select using (is_project_member(project_id));

-- Supabase grants ALL on new public tables by default privilege. Take it back:
-- the only write path is an Action, same as every other table since 008. This
-- line is easy to forget and silently undoes migration 008 for the new table.
revoke all on action_items from anon, authenticated;
grant select on action_items to anon, authenticated;

-- Who was named, on the message itself. Messages are immutable and append-only,
-- so an array on the row beats a join table nothing will ever update.
alter table messages
  add column if not exists mentions uuid[] not null default '{}'::uuid[];

comment on column messages.mentions is
  'project_members.id of everyone named in this message. Drives action_items; kept on the message so the text can be re-rendered with the right names years later.';

create index if not exists messages_mentions_idx on messages using gin (mentions);

-- ─── Step 3: what a mention inherits ─────────────────────────────────────────
--
-- The chef is told "food for the varnishers" on a work package that starts on
-- 5 August. She should not have to look up which day that is, and she should
-- certainly not have to type it into a list of her own.

create or replace function mention_context(
  p_type object_type,
  p_id uuid,
  out label text,
  out due date,
  out due_source text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  label := null; due := null; due_source := null;
  if p_type is null or p_id is null then
    return;
  end if;

  case p_type
    when 'WORK_PACKAGE' then
      select wp.wp_number || ' — ' || wp.title, wp.planned_start
        into label, due
        from work_packages wp where wp.id = p_id;
      if due is not null then due_source := 'WORK_PACKAGE_PLANNED_START'; end if;

    when 'INSPECTION_EVENT' then
      select ie.inspection_number || ' — ' || ie.title, ie.scheduled_date
        into label, due
        from inspection_events ie where ie.id = p_id;
      if due is not null then due_source := 'INSPECTION_SCHEDULED_DATE'; end if;

    when 'OWNER_APPROVAL' then
      select oa.approval_number || ' — ' || oa.title, oa.deadline
        into label, due
        from owner_approvals oa where oa.id = p_id;
      if due is not null then due_source := 'APPROVAL_DEADLINE'; end if;

    when 'DEFECT_RECORD' then
      select dr.ncr_number || ' — ' || dr.title into label
        from defect_records dr where dr.id = p_id;

    when 'CHANGE_ORDER' then
      select co.co_number || ' — ' || co.title into label
        from change_orders co where co.id = p_id;

    when 'DOCUMENT' then
      select d.doc_number || ' — ' || d.title into label
        from documents d where d.id = p_id;

    else
      label := null;
  end case;
end;
$$;

-- Dropped rather than overloaded: two functions with all-default parameters are
-- ambiguous to PostgREST, and the older one would silently keep answering.

drop function if exists action_post_message(text, text, text, uuid, text, text, uuid);

create or replace function action_post_message(
  p_body text,
  p_kind text default 'NOTE',
  p_linked_object_type text default null,
  p_linked_object_id uuid default null,
  p_source text default 'APP',
  p_meeting_ref text default null,
  p_project_id uuid default null,
  p_mentions uuid[] default null
)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role;
  v_project_id uuid;
  v_msg messages;
  v_mentions uuid[];
  v_member_id uuid;
  v_member project_members;
  v_ctx record;
  v_item action_items;
  v_items json[] := '{}';
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

  select coalesce(array_agg(distinct m), '{}'::uuid[])
    into v_mentions
    from unnest(coalesce(p_mentions, '{}'::uuid[])) as m
   where m is not null;

  v_role := current_actor_role(v_project_id);

  insert into messages (
    project_id, body, kind, source, author_id, author_name, author_role,
    linked_object_type, linked_object_id, meeting_ref, mentions
  ) values (
    v_project_id, trim(p_body), p_kind::message_kind, p_source::message_source,
    v_actor_id, v_actor_name, v_role,
    nullif(p_linked_object_type, '')::object_type, p_linked_object_id,
    nullif(trim(coalesce(p_meeting_ref, '')), ''),
    v_mentions
  ) returning * into v_msg;

  -- Deliberately no world_model_events row for the message itself. Messages are
  -- already append-only and immutable, so an event would restate the same fact
  -- and bury the object histories under chatter. The action items below DO get
  -- events: those are obligations, and an obligation has a history.

  foreach v_member_id in array v_mentions loop
    select * into v_member from project_members
     where id = v_member_id and project_id = v_project_id and status <> 'LEFT';
    if not found then
      raise exception 'You can only mention people who are on this project'
        using errcode = 'P0001';
    end if;

    select * into v_ctx from mention_context(v_msg.linked_object_type, v_msg.linked_object_id);

    insert into action_items (
      project_id, message_id,
      linked_object_type, linked_object_id, context_label,
      assignee_member_id, assignee_name, assignee_email,
      raised_by, raised_by_name, body,
      due_date, due_date_source
    ) values (
      v_project_id, v_msg.id,
      v_msg.linked_object_type, v_msg.linked_object_id, v_ctx.label,
      v_member.id, v_member.name, v_member.email,
      v_actor_id, v_actor_name, v_msg.body,
      v_ctx.due, v_ctx.due_source
    ) returning * into v_item;

    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_project_id, 'ACTION_ITEM_RAISED', 'ACTION_ITEM', v_item.id,
      null,
      jsonb_build_object(
        'assignee', v_item.assignee_name,
        'raised_by', v_item.raised_by_name,
        'due_date', v_item.due_date,
        'due_date_source', v_item.due_date_source,
        'context', v_item.context_label,
        'body', v_item.body
      ),
      v_actor_id, v_actor_name
    );

    v_items := v_items || row_to_json(v_item)::json;
  end loop;

  return json_build_object(
    'message', row_to_json(v_msg),
    'action_items', array_to_json(v_items)
  );
end;
$$;

-- A mention that can be ignored is a notification. This one cannot: it stays
-- OPEN until the person named says something back, and what they say is posted
-- into the same thread, so the answer lands where the question was asked.

create or replace function action_acknowledge_item(
  p_project_id uuid,
  p_item_id uuid,
  p_response text
)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_item action_items;
  v_reply messages;
  v_response text := nullif(trim(coalesce(p_response, '')), '');
begin
  select * into v_item from action_items
   where id = p_item_id and project_id = v_project_id;
  if not found then
    raise exception 'No such action item on this project' using errcode = 'P0001';
  end if;
  if lower(v_item.assignee_email) is distinct from v_email then
    raise exception 'Only % can answer this — it was asked of them', v_item.assignee_name
      using errcode = 'P0001';
  end if;
  if v_item.status <> 'OPEN' then
    raise exception 'This has already been answered (%)', v_item.status
      using errcode = 'P0001';
  end if;
  if v_response is null then
    raise exception 'Acknowledging means answering — say something'
      using errcode = 'P0001';
  end if;

  insert into messages (
    project_id, body, kind, source, author_id, author_name, author_role,
    linked_object_type, linked_object_id
  ) values (
    v_project_id, v_response, 'NOTE', 'APP',
    v_actor_id, v_actor_name, current_actor_role(v_project_id),
    v_item.linked_object_type, v_item.linked_object_id
  ) returning * into v_reply;

  update action_items
     set status = 'ACKNOWLEDGED',
         acknowledged_at = now(),
         response = v_response,
         response_message_id = v_reply.id
   where id = v_item.id
  returning * into v_item;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ACTION_ITEM_ACKNOWLEDGED', 'ACTION_ITEM', v_item.id,
    jsonb_build_object('status', 'OPEN'),
    jsonb_build_object('status', 'ACKNOWLEDGED', 'response', v_response),
    v_actor_id, v_actor_name
  );

  return json_build_object('item', row_to_json(v_item), 'reply', row_to_json(v_reply));
end;
$$;

create or replace function action_decline_item(
  p_project_id uuid,
  p_item_id uuid,
  p_reason text
)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_item action_items;
  v_reply messages;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into v_item from action_items
   where id = p_item_id and project_id = v_project_id;
  if not found then
    raise exception 'No such action item on this project' using errcode = 'P0001';
  end if;
  if lower(v_item.assignee_email) is distinct from v_email then
    raise exception 'Only % can answer this — it was asked of them', v_item.assignee_name
      using errcode = 'P0001';
  end if;
  if v_item.status not in ('OPEN', 'ACKNOWLEDGED') then
    raise exception 'This is already %', v_item.status using errcode = 'P0001';
  end if;
  -- "No" is an answer, but an unexplained no is not one.
  if v_reason is null then
    raise exception 'Say why you cannot do this' using errcode = 'P0001';
  end if;

  insert into messages (
    project_id, body, kind, source, author_id, author_name, author_role,
    linked_object_type, linked_object_id
  ) values (
    v_project_id, v_reason, 'DECISION', 'APP',
    v_actor_id, v_actor_name, current_actor_role(v_project_id),
    v_item.linked_object_type, v_item.linked_object_id
  ) returning * into v_reply;

  update action_items
     set status = 'DECLINED',
         acknowledged_at = coalesce(acknowledged_at, now()),
         response = v_reason,
         response_message_id = v_reply.id
   where id = v_item.id
  returning * into v_item;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ACTION_ITEM_DECLINED', 'ACTION_ITEM', v_item.id,
    jsonb_build_object('status', 'OPEN'),
    jsonb_build_object('status', 'DECLINED', 'reason', v_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('item', row_to_json(v_item), 'reply', row_to_json(v_reply));
end;
$$;

create or replace function action_complete_item(
  p_project_id uuid,
  p_item_id uuid,
  p_note text default null
)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_before action_items;
  v_item action_items;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into v_before from action_items
   where id = p_item_id and project_id = v_project_id;
  if not found then
    raise exception 'No such action item on this project' using errcode = 'P0001';
  end if;
  if lower(v_before.assignee_email) is distinct from v_email then
    raise exception 'Only % can close this off', v_before.assignee_name
      using errcode = 'P0001';
  end if;
  if v_before.status not in ('OPEN', 'ACKNOWLEDGED') then
    raise exception 'This is already %', v_before.status using errcode = 'P0001';
  end if;

  -- Doing the thing implies having accepted it. Someone who does the work
  -- without answering first should not be blocked on the paperwork.
  update action_items
     set status = 'DONE',
         acknowledged_at = coalesce(acknowledged_at, now()),
         completed_at = now(),
         completion_note = v_note
   where id = v_before.id
  returning * into v_item;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ACTION_ITEM_COMPLETED', 'ACTION_ITEM', v_item.id,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'DONE', 'note', v_note),
    v_actor_id, v_actor_name
  );

  return json_build_object('item', row_to_json(v_item));
end;
$$;

revoke all on function action_post_message(text, text, text, uuid, text, text, uuid, uuid[]) from public;
grant execute on function action_post_message(text, text, text, uuid, text, text, uuid, uuid[]) to authenticated;

revoke all on function action_acknowledge_item(uuid, uuid, text) from public;
grant execute on function action_acknowledge_item(uuid, uuid, text) to authenticated;

revoke all on function action_decline_item(uuid, uuid, text) from public;
grant execute on function action_decline_item(uuid, uuid, text) to authenticated;

revoke all on function action_complete_item(uuid, uuid, text) from public;
grant execute on function action_complete_item(uuid, uuid, text) to authenticated;

revoke all on function mention_context(object_type, uuid) from public;
grant execute on function mention_context(object_type, uuid) to authenticated;

-- ─── Step 4 (own transaction): somebody to mention ───────────────────────────
--
-- The chef is not the captain. Until now the only way to put a stewardess, an
-- engineer or a cook on a project was to give them one of the seven decision-
-- making roles, which is both wrong on the org chart and wrong on permissions --
-- and crew are exactly the people you most want to be able to name.

alter type user_role add value if not exists 'CREW';

-- ─── Step 5: what crew may do ────────────────────────────────────────────────
--
-- Speak, report what they find, and file paperwork. They do not approve money,
-- move phases, plan work or staff the project. Answering their own action items
-- needs no row here -- see below.

insert into action_permissions (action_key, role) values
  ('action_post_message',     'CREW'),
  ('action_raise_defect',     'CREW'),
  ('action_register_document','CREW')
on conflict do nothing;

-- ─── The registry ────────────────────────────────────────────────────────────

insert into ontology_object_types (key, label, table_name, description, display_order)
values (
  'ACTION_ITEM', 'Action Item', 'action_items',
  'Something one named person owes the project, created by mentioning them in a message. It carries the object the conversation was attached to and the date that object starts, so nobody has to restate either. It stays open until the person named answers.',
  12
)
on conflict (key) do update
  set label = excluded.label,
      table_name = excluded.table_name,
      description = excluded.description,
      display_order = excluded.display_order;

insert into ontology_links (from_type, to_type, label, cardinality, via_column) values
  ('ACTION_ITEM', 'MESSAGE',        'asked in',    'MANY_TO_ONE', 'message_id'),
  ('ACTION_ITEM', 'PROJECT_MEMBER', 'owed by',     'MANY_TO_ONE', 'assignee_member_id'),
  ('ACTION_ITEM', 'PROJECT',        'raised on',   'MANY_TO_ONE', 'project_id'),
  ('MESSAGE',     'PROJECT_MEMBER', 'mentions',    'ONE_TO_MANY', 'mentions')
on conflict do nothing;

update ontology_actions
   set description = 'Post a message. Naming project members in p_mentions turns the message into an obligation for each of them: an action item, due on the linked object''s own start date, that stays open until they answer.',
       parameters = '{"p_body":"text","p_kind":"NOTE|DECISION|UNPLANNED_WORK|MEETING_NOTE|HANDOVER","p_linked_object_type":"object_type","p_linked_object_id":"uuid","p_source":"APP|AGENT|EMAIL|MEETING","p_meeting_ref":"text","p_project_id":"uuid","p_mentions":"uuid[] of project_members.id"}'::jsonb,
       cascades = array['Creates one ACTION_ITEM per mention', 'Inherits the due date from the linked work package or inspection']
 where key = 'action_post_message';

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable) values
  ('action_acknowledge_item', 'Acknowledge an action item',
   'Answer something you were asked. Only the person the item was raised against can call it, and the answer is required — an item nobody replied to stays open. The reply is posted back into the thread the request came from.',
   'ACTION_ITEM',
   '{"p_project_id":"uuid","p_item_id":"uuid","p_response":"text (required)"}'::jsonb,
   array['Posts the answer as a MESSAGE on the same linked object'],
   false),
  ('action_decline_item', 'Decline an action item',
   'Say you cannot do it, and why. The reason is required, and it is posted into the thread as a DECISION. Declining is an answer, so the item stops being open — it does not disappear.',
   'ACTION_ITEM',
   '{"p_project_id":"uuid","p_item_id":"uuid","p_reason":"text (required)"}'::jsonb,
   array['Posts the reason as a DECISION message on the same linked object'],
   false),
  ('action_complete_item', 'Complete an action item',
   'Mark something you owed as done. Completing implies acknowledging, so work done without a reply is not blocked on the reply.',
   'ACTION_ITEM',
   '{"p_project_id":"uuid","p_item_id":"uuid","p_note":"text"}'::jsonb,
   array['Acknowledges the item if it was never answered'],
   false)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      target_type = excluded.target_type,
      parameters = excluded.parameters,
      cascades = excluded.cascades,
      is_agent_usable = excluded.is_agent_usable;

-- Deliberately no action_permissions rows for the three above.
--
-- Every other Action is gated by the role you hold on the project. These are
-- gated by identity instead: the only person who can answer "the chef needs to
-- prepare food for the varnishers" is the chef. A role cannot express that, and
-- a permissive role matrix would let an owner's rep tick off somebody else's
-- obligation, which would make the whole record worthless.
--
-- is_agent_usable is false for the same reason. The agent must not be able to
-- answer on a human's behalf; it can raise items by posting a message with
-- mentions, and then it has to wait like everyone else.

comment on function action_acknowledge_item(uuid, uuid, text) is
  'Gated by identity, not by role: only the assignee can answer. See migration 019.';

-- =============================================================================
-- Verification (run inside a transaction and roll back)
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"…","email":"…","role":"authenticated"}';
--
--   select action_invite_member(:project, 'chef@…', 'CREW', 'Elena Rossi');
--   select action_post_message(
--     p_body := 'Food for the varnishers on the 5th, one vegetarian @Elena Rossi',
--     p_linked_object_type := 'WORK_PACKAGE', p_linked_object_id := :wp,
--     p_project_id := :project, p_mentions := array[:chef]);
--
-- Expect: one action_items row, due 2026-08-05, due_date_source
-- WORK_PACKAGE_PLANNED_START, context 'WP-PAINT-002 — New Varnish on the
-- capping rail', status OPEN, one ACTION_ITEM_RAISED event. Then, as the person
-- who asked, action_acknowledge_item must be refused; as the chef, an empty
-- response must be refused, a real one must flip the item to ACKNOWLEDGED and
-- post a message linked to the same work package, and a second answer must be
-- refused. Mentioning a member of a different project must be refused.
-- =============================================================================
