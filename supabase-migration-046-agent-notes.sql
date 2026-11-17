-- Migration 046: the agent speaks first.
--
-- Until now the agent only answered. This lets it notice:
--
--   * agent_notes: what the agent wrote on its own -- a NOTICE when something
--     happens that someone should look at (an NCR raised, a change order, an
--     approval requested, a failed inspection, a package put on hold, a
--     payment stage coming due), and a daily BRIEF per project. Notes are
--     written only by the agent-watch Edge Function (service role); members
--     read them, and a MONEY note only where payment_can_read() allows.
--   * a trigger on world_model_events: a root event of one of those kinds is
--     posted (pg_net, after commit) to agent-watch, which reads the record
--     around it and writes a short note. Cascaded events are skipped -- the
--     note on the root event covers what followed. The trigger can never
--     block or fail the write that fired it.
--   * pg_cron at 05:30 UTC: the morning run -- briefs, payment stages due,
--     and an email to members who asked for it (agent_brief_email, off by
--     default; set_agent_brief_email() sets one's own).
--   * the shared secret between the database and agent-watch is generated
--     here and kept in Vault; the function reads it with the service role
--     (agent_watch_secret()), so it never leaves the project.

-- Applied to project xgpdfefxarllgykjbppn as agent_notes, then agent_notes_pg_net_schema
-- (pg_net first went into public and was moved).

-- 0. Extensions ---------------------------------------------------------------------------------
-- pg_net in `extensions`, not `public` (Supabase advisor extension_in_public);
-- its functions live in the `net` schema either way.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- 1. Notes ----------------------------------------------------------------------------------------
create table if not exists public.agent_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('NOTICE', 'BRIEF')),
  -- MONEY: only for those who may read payments (payment_can_read).
  audience text not null default 'ALL' check (audience in ('ALL', 'MONEY')),
  title text not null,
  body text not null,
  object_type object_type,
  object_id uuid,
  object_number text,
  -- A question to put to the agent next, offered as one tap.
  suggestion text,
  -- Numbers in the body -> {type, id, label}, so the app turns them into links.
  refs jsonb not null default '{}'::jsonb,
  source_event_id uuid references public.world_model_events(id) on delete set null,
  -- One note per event / per project per day / per stage per day.
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists agent_notes_project_created on public.agent_notes (project_id, created_at desc);

alter table public.agent_notes enable row level security;
drop policy if exists agent_notes_read on public.agent_notes;
create policy agent_notes_read on public.agent_notes for select
  using (is_project_member(project_id) and (audience = 'ALL' or payment_can_read(project_id)));
-- No write policies: only the service role writes notes.
revoke all on public.agent_notes from anon;
grant select on public.agent_notes to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_notes'
  ) then
    alter publication supabase_realtime add table public.agent_notes;
  end if;
end $$;

-- 2. Email opt-in ----------------------------------------------------------------------------------
alter table public.project_members add column if not exists agent_brief_email boolean not null default false;

create or replace function public.set_agent_brief_email(p_project_id uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update project_members
     set agent_brief_email = p_on
   where project_id = p_project_id
     and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
     and status <> 'LEFT';
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'You are not a member of this project.';
  end if;
  return p_on;
end;
$$;
revoke all on function public.set_agent_brief_email(uuid, boolean) from public, anon;
grant execute on function public.set_agent_brief_email(uuid, boolean) to authenticated;

-- 3. The shared secret ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'agent_watch_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'agent_watch_secret',
      'Shared secret: the database (pg_net) -> the agent-watch Edge Function'
    );
  end if;
end $$;

create or replace function public.agent_watch_secret()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'agent_watch_secret' limit 1;
$$;
revoke all on function public.agent_watch_secret() from public, anon, authenticated;
grant execute on function public.agent_watch_secret() to service_role;

-- 4. Calling agent-watch ----------------------------------------------------------------------------
create or replace function public.agent_watch_call(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url := 'https://xgpdfefxarllgykjbppn.supabase.co/functions/v1/agent-watch',
    body := p_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-watch', public.agent_watch_secret()
    ),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.agent_watch_call(jsonb) from public, anon, authenticated;

-- 5. The trigger -----------------------------------------------------------------------------------
create or replace function public.agent_watch_on_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cascade_from_event_id is null and (
       new.event_type in ('DEFECT_CREATED', 'DEFECT_RAISED', 'CHANGE_ORDER_CREATED', 'APPROVAL_REQUESTED', 'DEFECT_IMPACT_AMENDED')
    -- A pass needs no note; agent-watch checks the inspection itself when the event does not say.
    or (new.event_type = 'INSPECTION_COMPLETED' and coalesce(new.after_state ->> 'result', '?') <> 'PASS')
    or (new.event_type = 'WORK_PACKAGE_STATUS_CHANGED' and new.after_state ->> 'status' = 'ON_HOLD')
  ) then
    perform public.agent_watch_call(jsonb_build_object('mode', 'event', 'event_id', new.id));
  end if;
  return new;
exception when others then
  -- A note is never worth failing the write that would have prompted it.
  raise warning 'agent_watch_on_event: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists agent_watch_after_event on public.world_model_events;
create trigger agent_watch_after_event
  after insert on public.world_model_events
  for each row execute function public.agent_watch_on_event();

-- 6. The morning run (05:30 UTC: 06:30 in Italy in winter, 07:30 in summer) --------------------------
select cron.unschedule('agent-watch-morning') where exists (select 1 from cron.job where jobname = 'agent-watch-morning');
select cron.schedule('agent-watch-morning', '30 5 * * *', $$select public.agent_watch_call('{"mode":"morning"}'::jsonb)$$);
