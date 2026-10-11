-- Migration 038: log entries carry the browser's write id (offline mode).
--
-- Phase 3 of the logbook merge, last part. A phone at sea keeps what is
-- written in an outbox on the device and sends it when it is back in
-- signal. A write can arrive twice: the request went through but its answer
-- was lost, so the phone sends it again. Readings and services already
-- carry client_id (migration 036); log entries now do too, and a repeated
-- entry returns the first one instead of writing a copy.
--
-- Days and hours of rest need no id: each is one record per day (or month)
-- and sending the same day twice records it twice with the same content,
-- the second as a change with nothing changed, which loses nothing.
--
-- action_add_log_entry gains p_client_id. A function cannot gain a
-- parameter in place, and this project's SQL tooling does not run DROP, so
-- the old signature is renamed action_add_log_entry_superseded_038 and its
-- execute right revoked; nothing calls it by that name.
--
-- Applied to project xgpdfefxarllgykjbppn as offline_client_ids.

alter table public.log_entries add column if not exists client_id uuid unique;

alter function public.action_add_log_entry(uuid, text, text, timestamptz, uuid)
  rename to action_add_log_entry_superseded_038;
revoke execute on function public.action_add_log_entry_superseded_038(uuid, text, text, timestamptz, uuid)
  from authenticated, anon, public;

-- Writes a timestamped entry (as migration 032). Entries are never edited:
-- see action_void_log_entry. The same client id twice returns the first.
create or replace function public.action_add_log_entry(
  p_project_id uuid,
  p_body text,
  p_kind text default 'NOTE',
  p_occurred_at timestamptz default null,
  p_part_id uuid default null,
  p_client_id uuid default null
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

  if p_client_id is not null then
    select * into v_after from log_entries where client_id = p_client_id;
    if found then
      if v_after.project_id <> v_project_id then
        raise exception 'That write id belongs to another logbook' using errcode = 'P0001';
      end if;
      return json_build_object('entry', row_to_json(v_after), 'duplicate', true);
    end if;
  end if;

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

  insert into log_entries (project_id, vessel_id, occurred_at, kind, body, part_id, author_id, author_name, client_id)
  values (v_project_id, v_project.vessel_id, v_when, v_kind, trim(p_body), p_part_id, v_actor_id, v_actor_name, p_client_id)
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'LOG_ENTRY_WRITTEN', 'LOG_ENTRY', v_after.id, null,
    jsonb_build_object('kind', v_after.kind, 'occurred_at', v_after.occurred_at,
                       'body', v_after.body, 'part_id', v_after.part_id,
                       -- When it was written on the phone, if it waited offline.
                       'sent_late', v_after.created_at - v_when > interval '1 hour'),
    v_actor_id, v_actor_name
  );

  return json_build_object('entry', row_to_json(v_after), 'duplicate', false);
end;
$$;

revoke execute on function public.action_add_log_entry(uuid, text, text, timestamptz, uuid, uuid) from anon, public;
grant execute on function public.action_add_log_entry(uuid, text, text, timestamptz, uuid, uuid) to authenticated;
