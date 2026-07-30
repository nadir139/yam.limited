-- =============================================================================
-- YAM Migration 015 — THE REASON, AND THE CORRECTION
--
-- Applied to the live project as two migrations, in this order:
--   `closure_notes_are_never_lost`
--   `amend_defect_impact`
--
-- Reported from use, not found by review. Someone raised an NCR for a light in
-- the master cabin, closed it, and typed "forget about the light, it was the
-- switch actually" into the closure notes box. The sentence was never sent
-- anywhere. Asked about the NCR afterwards, the agent read the record
-- faithfully and reported €30, one day, closed, no comment — every word of
-- which was true of the row and none of which was true of the job.
--
-- Two separate failures, and the second is the more interesting one:
--
-- 1. The close dialog collected `closeNotes` into React state and the mutate
--    call omitted it. `action_update_defect_status` had no notes parameter to
--    send it to. In a system whose entire claim is that nothing is lost, the
--    single most important fact about a closure was discarded at the browser —
--    invisibly, because the field looked like it worked. That text is gone; it
--    was never written anywhere. Step 1 makes the reason part of the Action and
--    required for the two transitions that end an argument.
--
-- 2. Even with the note, there was no way to fix the numbers. The figures on an
--    NCR are an estimate made in its first five minutes, and closing was
--    terminal. €30 and one day stayed €30 and one day forever, so the project
--    totals were built on guesses that nobody could correct. Step 2 adds the
--    correction, allowed on closed NCRs, with the old values preserved.
-- =============================================================================

-- ─── Step 1: closing an NCR requires saying why ──────────────────────────────

drop function if exists action_update_defect_status(uuid, text, date);

create or replace function action_update_defect_status(
  p_defect_id uuid,
  p_status text,
  p_closed_date date default null,
  p_notes text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role;
  v_before defect_records;
  v_after defect_records;
  v_status defect_status;
  v_note text := nullif(trim(coalesce(p_notes, '')), '');
begin
  perform require_permission_for_object('action_update_defect_status', 'DEFECT_RECORD', p_defect_id);

  select * into v_before from defect_records where id = p_defect_id;
  if not found then
    raise exception 'Defect does not exist' using errcode = 'P0001';
  end if;
  if v_before.status = 'CLOSED' then
    raise exception 'Cannot change %: it is closed', v_before.ncr_number using errcode = 'P0001';
  end if;

  begin
    v_status := p_status::defect_status;
  exception when invalid_text_representation then
    raise exception 'Unknown status: %', p_status using errcode = 'P0001';
  end;

  -- Closing without saying why is how the reason gets lost. It is the one
  -- moment the record most needs a sentence, so it is required.
  if v_status in ('CLOSED', 'DISPUTED') and v_note is null then
    raise exception 'Say why before marking % as %', v_before.ncr_number, v_status
      using errcode = 'P0001';
  end if;

  update defect_records
     set status = v_status,
         closed_date = case when v_status = 'CLOSED'
                            then coalesce(p_closed_date, current_date)
                            else closed_date end
   where id = p_defect_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'DEFECT_STATUS_CHANGED', 'DEFECT_RECORD', v_after.id,
    jsonb_build_object('status', v_before.status, 'closed_date', v_before.closed_date),
    jsonb_build_object('status', v_after.status, 'closed_date', v_after.closed_date,
                       'reason', v_note),
    v_actor_id, v_actor_name
  );

  -- Also posted to the NCR's thread, so it reads as part of the conversation
  -- and the agent picks it up with the rest of the record rather than only when
  -- it thinks to read the audit log.
  if v_note is not null then
    select role into v_role from project_members
     where project_id = v_after.project_id
       and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')) limit 1;

    insert into messages (project_id, body, kind, source, author_id, author_name,
                          author_role, linked_object_type, linked_object_id)
    values (v_after.project_id,
            format('%s → %s: %s', v_before.status, v_after.status, v_note),
            case when v_status = 'CLOSED' then 'DECISION'::message_kind
                 else 'NOTE'::message_kind end,
            'APP'::message_source, v_actor_id, v_actor_name, v_role,
            'DEFECT_RECORD'::object_type, v_after.id);
  end if;

  return row_to_json(v_after);
end;
$fn$;

revoke execute on function action_update_defect_status(uuid, text, date, text) from public, anon;
grant execute on function action_update_defect_status(uuid, text, date, text) to authenticated;

update ontology_actions set
  description = 'Moves an NCR through its lifecycle. A reason is required to close or dispute one, and is recorded both in the audit trail and on the NCR''s thread. A closed NCR cannot be reopened.',
  parameters = '[{"name":"p_defect_id","type":"uuid","required":true},
     {"name":"p_status","type":"enum","required":true,"values":["OPEN","IN_PROGRESS","PENDING_APPROVAL","CLOSED","DISPUTED"]},
     {"name":"p_closed_date","type":"date"},
     {"name":"p_notes","type":"text"}]'::jsonb
where key = 'action_update_defect_status';

-- ─── Step 2: correcting what a job actually cost ─────────────────────────────
--
-- This is not an edit. The old figures go into the event's before_state, the
-- reason is required, and the change is posted to the NCR's thread — so what
-- was first believed stays recoverable alongside what turned out to be true.
-- That distinction is the difference between an ontology and a spreadsheet.

create or replace function action_amend_defect_impact(
  p_defect_id uuid,
  p_reason text,
  p_cost_impact numeric default null,
  p_schedule_impact_days integer default null,
  p_root_cause text default null,
  p_description text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_role user_role;
  v_before defect_records;
  v_after defect_records;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_root_cause root_cause;
begin
  perform require_permission_for_object('action_amend_defect_impact', 'DEFECT_RECORD', p_defect_id);

  select * into v_before from defect_records where id = p_defect_id;
  if not found then
    raise exception 'Defect does not exist' using errcode = 'P0001';
  end if;

  if v_reason is null then
    raise exception 'Say what you learned before correcting %', v_before.ncr_number
      using errcode = 'P0001';
  end if;

  if p_cost_impact is null
     and p_schedule_impact_days is null
     and nullif(trim(coalesce(p_root_cause, '')), '') is null
     and nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'Nothing to correct - give a cost, a duration, a root cause, or a description'
      using errcode = 'P0001';
  end if;

  if p_cost_impact is not null and p_cost_impact < 0 then
    raise exception 'Cost cannot be negative' using errcode = 'P0001';
  end if;
  if p_schedule_impact_days is not null and p_schedule_impact_days < 0 then
    raise exception 'Schedule impact cannot be negative' using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(p_root_cause, '')), '') is not null then
    begin
      v_root_cause := p_root_cause::root_cause;
    exception when invalid_text_representation then
      raise exception 'Unknown root cause: %', p_root_cause using errcode = 'P0001';
    end;
  end if;

  -- coalesce, not assignment: an omitted field is "leave it alone", so this can
  -- overwrite a value but never clear one.
  update defect_records
     set cost_impact = coalesce(p_cost_impact, cost_impact),
         schedule_impact_days = coalesce(p_schedule_impact_days, schedule_impact_days),
         root_cause = coalesce(v_root_cause, root_cause),
         description = coalesce(nullif(trim(coalesce(p_description, '')), ''), description)
   where id = p_defect_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'DEFECT_IMPACT_AMENDED', 'DEFECT_RECORD', v_after.id,
    jsonb_build_object('cost_impact', v_before.cost_impact,
                       'schedule_impact_days', v_before.schedule_impact_days,
                       'root_cause', v_before.root_cause,
                       'description', v_before.description),
    jsonb_build_object('cost_impact', v_after.cost_impact,
                       'schedule_impact_days', v_after.schedule_impact_days,
                       'root_cause', v_after.root_cause,
                       'description', v_after.description,
                       'reason', v_reason),
    v_actor_id, v_actor_name
  );

  select role into v_role from project_members
   where project_id = v_after.project_id
     and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')) limit 1;

  insert into messages (project_id, body, kind, source, author_id, author_name,
                        author_role, linked_object_type, linked_object_id)
  values (v_after.project_id,
          format('Corrected %s - cost %s to %s, schedule %s to %s days. %s',
                 v_after.ncr_number,
                 coalesce(v_before.cost_impact::text, 'none'),
                 coalesce(v_after.cost_impact::text, 'none'),
                 coalesce(v_before.schedule_impact_days::text, '0'),
                 coalesce(v_after.schedule_impact_days::text, '0'),
                 v_reason),
          'DECISION'::message_kind, 'APP'::message_source,
          v_actor_id, v_actor_name, v_role,
          'DEFECT_RECORD'::object_type, v_after.id);

  return json_build_object('defect', row_to_json(v_after));
end;
$fn$;

comment on function action_amend_defect_impact is
  'Corrects the recorded cost, duration, root cause or description of an NCR once the real figures are known - including after it is closed. The previous values are kept in the event, and the reason is required.';

revoke execute on function
  action_amend_defect_impact(uuid, text, numeric, integer, text, text) from public, anon;
grant execute on function
  action_amend_defect_impact(uuid, text, numeric, integer, text, text) to authenticated;

-- Anyone who can move an NCR through its lifecycle can correct its numbers.
-- Withholding this from the people doing the work is what produced the wrong
-- figure in the first place.
insert into action_permissions (action_key, role) values
  ('action_amend_defect_impact', 'OWNERS_REP'),
  ('action_amend_defect_impact', 'CAPTAIN'),
  ('action_amend_defect_impact', 'YARD_PM'),
  ('action_amend_defect_impact', 'CLASS_SURVEYOR'),
  ('action_amend_defect_impact', 'NAVAL_ARCHITECT'),
  ('action_amend_defect_impact', 'SUBCONTRACTOR')
on conflict do nothing;

insert into ontology_actions
  (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_amend_defect_impact', 'Correct NCR impact',
   'Corrects an NCR''s recorded cost, schedule impact, root cause or description once the real figures are known. Works on closed NCRs - closing an NCR ends its status, not its record. The previous values are preserved in the event log and a reason is required. Use this when someone reports what a job actually cost or actually took, or that the real cause was something other than what was first written down.',
   'DEFECT_RECORD',
   '[{"name":"p_defect_id","type":"uuid","required":true},
     {"name":"p_reason","type":"text","required":true},
     {"name":"p_cost_impact","type":"numeric"},
     {"name":"p_schedule_impact_days","type":"integer"},
     {"name":"p_root_cause","type":"enum","values":["WEAR","CORROSION","IMPACT","FATIGUE","INSTALLATION_ERROR","DESIGN_DEFICIENCY","MOISTURE_INGRESS","OTHER"]},
     {"name":"p_description","type":"text"}]'::jsonb,
   '{}'::text[], true)
on conflict (key) do update set
  label = excluded.label, description = excluded.description,
  target_type = excluded.target_type, parameters = excluded.parameters,
  cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;
