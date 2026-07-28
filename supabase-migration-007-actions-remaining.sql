-- =============================================================================
-- YAM Migration 007 — ACTIONS LAYER (remaining mutations)
-- Applied to the live project as migration `actions_remaining_mutations`.
-- Every direct table write the client used to perform now has an Action.
-- =============================================================================

create or replace function action_update_defect_status(
  p_defect_id uuid, p_status text, p_closed_date date default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before defect_records; v_after defect_records;
  v_new_status defect_status := p_status::defect_status;
begin
  select * into v_before from defect_records where id = p_defect_id;
  if not found then
    raise exception 'Defect not found' using errcode = 'P0001';
  end if;
  if v_before.status = 'CLOSED' and v_new_status <> 'CLOSED' then
    raise exception 'Cannot reopen a closed NCR' using errcode = 'P0001';
  end if;
  if v_before.status = v_new_status then
    raise exception 'NCR is already %', v_new_status using errcode = 'P0001';
  end if;

  update defect_records
     set status = v_new_status,
         closed_date = case when v_new_status = 'CLOSED'
           then coalesce(p_closed_date, current_date) else closed_date end
   where id = p_defect_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'DEFECT_STATUS_CHANGED', 'DEFECT_RECORD', v_after.id,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', v_after.status, 'ncr_number', v_after.ncr_number,
                       'closed_date', v_after.closed_date),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_after);
end;
$$;

create or replace function action_record_inspection_result(
  p_inspection_id uuid, p_result text,
  p_notes text default null, p_actual_date date default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before inspection_events; v_after inspection_events;
  v_new_result inspection_result := p_result::inspection_result;
begin
  select * into v_before from inspection_events where id = p_inspection_id;
  if not found then
    raise exception 'Inspection not found' using errcode = 'P0001';
  end if;

  update inspection_events
     set result = v_new_result,
         notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
         actual_date = coalesce(p_actual_date, actual_date, current_date),
         -- Keep the denormalised count honest rather than trusting the client.
         defect_count = (select count(*) from defect_records d
                          where d.inspection_event_id = p_inspection_id)
   where id = p_inspection_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'INSPECTION_COMPLETED', 'INSPECTION_EVENT', v_after.id,
    jsonb_build_object('result', v_before.result),
    jsonb_build_object('result', v_after.result,
      'inspection_number', v_after.inspection_number,
      'defect_count', v_after.defect_count, 'notes', v_after.notes),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_after);
end;
$$;

-- Cascades the decision onto the linked Change Order. The client never did
-- this, so approving an approval used to leave its CO stuck in PENDING_APPROVAL.
create or replace function action_decide_approval(
  p_approval_id uuid, p_decision text, p_notes text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_before owner_approvals; v_after owner_approvals; v_co change_orders;
  v_decision approval_status := p_decision::approval_status;
  v_approval_event_id uuid; v_co_status change_order_status;
begin
  if v_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'Decision must be APPROVED or REJECTED' using errcode = 'P0001';
  end if;

  select * into v_before from owner_approvals where id = p_approval_id;
  if not found then
    raise exception 'Approval not found' using errcode = 'P0001';
  end if;
  if v_before.status <> 'PENDING' then
    raise exception 'Approval has already been decided (%)', v_before.status
      using errcode = 'P0001';
  end if;

  update owner_approvals
     set status = v_decision, decision_date = current_date,
         decision_notes = nullif(trim(coalesce(p_notes, '')), ''),
         approver_name = v_actor_name
   where id = p_approval_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_after.project_id, 'APPROVAL_DECISION', 'OWNER_APPROVAL', v_after.id,
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', v_after.status,
      'approval_number', v_after.approval_number,
      'approver_name', v_after.approver_name,
      'decision_date', v_after.decision_date,
      'decision_notes', v_after.decision_notes),
    v_actor_id, v_actor_name
  ) returning id into v_approval_event_id;

  -- Propagate to the change order this approval gates.
  if v_after.change_order_id is not null then
    v_co_status := case when v_decision = 'APPROVED'
      then 'APPROVED'::change_order_status else 'REJECTED'::change_order_status end;

    update change_orders set status = v_co_status
     where id = v_after.change_order_id returning * into v_co;

    insert into world_model_events (
      project_id, event_type, object_type, object_id, before_state, after_state,
      triggered_by, triggered_by_name, cascade_from_event_id
    ) values (
      v_co.project_id,
      case when v_decision = 'APPROVED' then 'CHANGE_ORDER_APPROVED' else 'CHANGE_ORDER_REJECTED' end,
      'CHANGE_ORDER', v_co.id,
      jsonb_build_object('status', 'PENDING_APPROVAL'),
      jsonb_build_object('status', v_co.status, 'co_number', v_co.co_number),
      v_actor_id, v_actor_name, v_approval_event_id
    );
  end if;

  return json_build_object('approval', row_to_json(v_after),
    'change_order', case when v_co.id is not null then row_to_json(v_co) else null end);
end;
$$;

create or replace function action_advance_project_phase()
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := 'a1b2c3d4-0002-0000-0000-000000000001';
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_phases project_phase[] := enum_range(null::project_phase);
  v_current project_phase; v_next project_phase; v_idx int; v_after projects;
begin
  select phase into v_current from projects where id = v_project_id;
  if not found then
    raise exception 'Project not found' using errcode = 'P0001';
  end if;

  -- Phase order is the enum's declaration order, so it can't drift from a
  -- separately-maintained list.
  select i into v_idx from generate_subscripts(v_phases, 1) i
   where v_phases[i] = v_current;

  if v_idx >= array_length(v_phases, 1) then
    raise exception 'Project is already at the final phase (%)', v_current
      using errcode = 'P0001';
  end if;

  v_next := v_phases[v_idx + 1];
  update projects set phase = v_next where id = v_project_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PHASE_ADVANCED', 'PROJECT', v_project_id,
    jsonb_build_object('phase', v_current), jsonb_build_object('phase', v_next),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_after);
end;
$$;

-- The binary upload stays client-side against Storage (which has its own RLS);
-- this records the resulting object and its provenance.
create or replace function action_register_document(
  p_title text, p_doc_type text, p_file_url text,
  p_file_size int default null, p_mime_type text default null,
  p_linked_object_type text default null, p_linked_object_id uuid default null,
  p_is_class_document boolean default false
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := 'a1b2c3d4-0002-0000-0000-000000000001';
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_seq int; v_doc_number text; v_doc documents;
begin
  if p_title is null or length(trim(p_title)) < 2 then
    raise exception 'Document title is required' using errcode = 'P0001';
  end if;

  select coalesce(max((substring(doc_number from '\d+$'))::int), 0) + 1
    into v_seq from documents where project_id = v_project_id;
  v_doc_number := 'DOC-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into documents (
    project_id, doc_number, title, doc_type, revision, status,
    file_url, file_size, mime_type, uploaded_by, uploaded_date,
    linked_object_type, linked_object_id, is_class_document
  ) values (
    v_project_id, v_doc_number, trim(p_title), p_doc_type::doc_type,
    'Rev.0', 'APPROVED'::document_status,
    p_file_url, p_file_size, p_mime_type, v_actor_name, current_date,
    nullif(p_linked_object_type, '')::object_type, p_linked_object_id,
    coalesce(p_is_class_document, false)
  ) returning * into v_doc;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'DOCUMENT_UPLOADED', 'DOCUMENT', v_doc.id, null,
    jsonb_build_object('doc_number', v_doc.doc_number, 'title', v_doc.title,
      'doc_type', v_doc.doc_type, 'is_class_document', v_doc.is_class_document,
      'linked_object_type', v_doc.linked_object_type,
      'linked_object_id', v_doc.linked_object_id),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_doc);
end;
$$;
