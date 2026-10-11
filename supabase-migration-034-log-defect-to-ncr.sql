-- Migration 034: a defect written in the logbook becomes an NCR in one step.
--
-- The crew notice a fault and write it in the log ("stbd windlass motor
-- tripping under load"). Until now that note stopped there; the yard and the
-- owner's rep track defects as NCRs. This raises the NCR from the entry:
-- the entry's text becomes the description, its part (if any) is linked to
-- the NCR, and the entry points at the NCR so the log shows it was raised.
-- The NCR lives on the boat's logbook project, so it appears on the defects
-- page of that boat and nowhere else.
--
-- Applied to project xgpdfefxarllgykjbppn as log_defect_to_ncr.

alter table public.log_entries
  add column if not exists defect_id uuid references public.defect_records(id);

create or replace function public.action_raise_ncr_from_entry(
  p_project_id uuid,
  p_entry_id uuid,
  p_severity text default 'MEDIUM',
  p_title text default null
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
  v_entry log_entries;
  v_part parts;
  v_title text;
  v_raised json;
  v_defect_id uuid;
begin
  perform require_permission('action_raise_ncr_from_entry', v_project_id);
  perform operations_project(v_project_id);

  select * into v_entry from log_entries where id = p_entry_id and project_id = v_project_id for update;
  if not found then
    raise exception 'No log entry with that id on this boat' using errcode = 'P0001';
  end if;
  if v_entry.kind <> 'DEFECT' then
    raise exception 'Only a defect entry can become an NCR' using errcode = 'P0001';
  end if;
  if v_entry.voided_at is not null then
    raise exception 'That entry was struck out' using errcode = 'P0001';
  end if;
  if v_entry.defect_id is not null then
    raise exception 'An NCR was already raised from that entry' using errcode = 'P0001';
  end if;
  if coalesce(p_severity, '') not in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') then
    raise exception 'Severity is LOW, MEDIUM, HIGH or CRITICAL' using errcode = 'P0001';
  end if;

  if v_entry.part_id is not null then
    select * into v_part from parts where id = v_entry.part_id;
  end if;

  -- The title defaults to the entry's first line, cut to a readable length.
  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    v_title := left(trim(split_part(v_entry.body, E'\n', 1)), 120);
  end if;

  -- Root cause and disposition are not known at sea: OTHER / PENDING until
  -- someone investigates. No cost, so no change order cascades from here.
  v_raised := action_raise_defect(
    v_title,
    v_entry.body || E'\n\nFrom the logbook, ' || to_char(v_entry.occurred_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC, by ' || coalesce(v_entry.author_name, 'unknown') || '.',
    coalesce(v_part.location, v_part.name),
    p_severity, 'OTHER', 'PENDING',
    false, null, null, null, null, null, v_project_id
  );
  v_defect_id := (v_raised -> 'defect' ->> 'id')::uuid;

  update log_entries set defect_id = v_defect_id where id = v_entry.id;

  -- The part the entry named is linked to the NCR, as action_link_part would,
  -- without requiring the separate link permission crew do not hold.
  if v_part.id is not null and v_part.removed_at is null then
    insert into part_links (part_id, project_id, object_type, object_id, created_by, created_by_name)
    values (v_part.id, v_project_id, 'DEFECT_RECORD', v_defect_id, v_actor_id, v_actor_name);
    insert into world_model_events (
      project_id, event_type, object_type, object_id,
      before_state, after_state, triggered_by, triggered_by_name
    ) values (
      v_project_id, 'PART_LINKED', 'PART', v_part.id, null,
      jsonb_build_object('part', v_part.name, 'object_type', 'DEFECT_RECORD', 'object_id', v_defect_id),
      v_actor_id, v_actor_name
    );
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'LOG_ENTRY_NCR_RAISED', 'LOG_ENTRY', v_entry.id,
    jsonb_build_object('defect_id', null),
    jsonb_build_object('defect_id', v_defect_id, 'ncr_number', v_raised -> 'defect' ->> 'ncr_number'),
    v_actor_id, v_actor_name
  );

  return json_build_object('defect', v_raised -> 'defect', 'entry_id', v_entry.id);
end;
$$;

revoke execute on function public.action_raise_ncr_from_entry(uuid, uuid, text, text) from anon, public;
grant execute on function public.action_raise_ncr_from_entry(uuid, uuid, text, text) to authenticated;

-- Whoever writes the log can raise an NCR from it.
insert into action_permissions (action_key, role)
values ('action_raise_ncr_from_entry', 'CAPTAIN'), ('action_raise_ncr_from_entry', 'CREW')
on conflict do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select 'LOG_ENTRY'::object_type, 'DEFECT_RECORD'::object_type, 'was raised as', 'MANY_TO_ONE', 'defect_id'
 where not exists (select 1 from ontology_links where from_type = 'LOG_ENTRY' and to_type = 'DEFECT_RECORD');

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values (
  'action_raise_ncr_from_entry', 'Raise an NCR from a log entry',
  'Turns a DEFECT log entry into an NCR on the same boat: the entry''s text is the description, its part is linked, and the entry records the NCR. Root cause OTHER and disposition PENDING until investigated.',
  'DEFECT_RECORD',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_entry_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_severity', 'type', 'text', 'enum', jsonb_build_array('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    jsonb_build_object('name', 'p_title', 'type', 'text')
  ), '{}', false
)
on conflict (key) do nothing;
