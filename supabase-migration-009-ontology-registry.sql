-- =============================================================================
-- YAM Migration 009 — ONTOLOGY REGISTRY
-- Applied to the live project as migration `ontology_registry`.
--
-- The object model described in prose on /ontology, expressed as data the
-- system can read about itself. Two consumers:
--   * a UI that renders the object graph from the live model rather than a
--     hardcoded array that silently goes stale;
--   * an agent, which needs a machine-readable list of what exists and what it
--     is permitted to do, generated from the same source that enforces it.
--
-- Deliberately descriptive, not authoritative: the tables and Actions are the
-- real system. This describes them.
-- =============================================================================

create table ontology_object_types (
  key           object_type primary key,
  label         text not null,
  table_name    text not null,
  description   text not null,
  display_order int  not null
);

create table ontology_links (
  id          uuid primary key default uuid_generate_v4(),
  from_type   object_type not null references ontology_object_types(key) on delete cascade,
  to_type     object_type not null references ontology_object_types(key) on delete cascade,
  label       text not null,
  cardinality text not null check (cardinality in ('ONE_TO_ONE','ONE_TO_MANY','MANY_TO_ONE')),
  via_column  text not null,
  unique (from_type, to_type, via_column)
);

-- The agent's tool manifest. Kept beside the object model so "what exists" and
-- "what can be done to it" are answered from one place.
create table ontology_actions (
  key             text primary key,
  label           text not null,
  description     text not null,
  target_type     object_type not null references ontology_object_types(key) on delete cascade,
  parameters      jsonb not null default '[]'::jsonb,
  cascades        text[] not null default '{}',
  is_agent_usable boolean not null default true
);

alter table ontology_object_types enable row level security;
alter table ontology_links        enable row level security;
alter table ontology_actions      enable row level security;

create policy "read_ontology" on ontology_object_types for select to authenticated using (true);
create policy "read_ontology" on ontology_links        for select to authenticated using (true);
create policy "read_ontology" on ontology_actions      for select to authenticated using (true);

insert into ontology_object_types (key, label, table_name, description, display_order) values
  ('VESSEL','Vessel','vessels','The physical asset. Everything else hangs off it.',1),
  ('PROJECT','Project','projects','A campaign against a vessel — survey, refit or newbuild — with budget and phase.',2),
  ('WORK_PACKAGE','Work Package','work_packages','A scoped unit of work in one discipline, costed and scheduled.',3),
  ('INSPECTION_EVENT','Inspection','inspection_events','A survey attendance and its result. The honest signal: a frame is to spec or it is not.',4),
  ('DEFECT_RECORD','Defect (NCR)','defect_records','A non-conformance. The origin of most cascades.',5),
  ('CHANGE_ORDER','Change Order','change_orders','A costed, scheduled change to the agreed scope.',6),
  ('OWNER_APPROVAL','Owner Approval','owner_approvals','A decision the owner must make, tiered by cost, with a deadline.',7),
  ('DOCUMENT','Document','documents','Evidence attached to any other object.',8),
  ('SUBCONTRACTOR','Stakeholder','project_members','A party to the project and the role they hold.',9);

insert into ontology_links (from_type, to_type, label, cardinality, via_column) values
  ('PROJECT','VESSEL','concerns','MANY_TO_ONE','vessel_id'),
  ('WORK_PACKAGE','PROJECT','belongs to','MANY_TO_ONE','project_id'),
  ('INSPECTION_EVENT','WORK_PACKAGE','inspects','MANY_TO_ONE','work_package_id'),
  ('DEFECT_RECORD','INSPECTION_EVENT','discovered by','MANY_TO_ONE','inspection_event_id'),
  ('DEFECT_RECORD','WORK_PACKAGE','affects','MANY_TO_ONE','work_package_id'),
  ('DEFECT_RECORD','CHANGE_ORDER','resolved by','ONE_TO_ONE','change_order_id'),
  ('CHANGE_ORDER','DEFECT_RECORD','raised from','ONE_TO_ONE','defect_record_id'),
  ('CHANGE_ORDER','OWNER_APPROVAL','gated by','ONE_TO_ONE','approval_id'),
  ('OWNER_APPROVAL','CHANGE_ORDER','authorises','ONE_TO_ONE','change_order_id'),
  ('DOCUMENT','PROJECT','filed under','MANY_TO_ONE','project_id'),
  ('SUBCONTRACTOR','PROJECT','works on','MANY_TO_ONE','project_id');

insert into ontology_actions (key, label, description, target_type, parameters, cascades) values
  ('action_raise_defect','Raise NCR',
   'Records a non-conformance. HIGH or CRITICAL severity carrying a cost impact automatically raises the Change Order and the Owner Approval it requires.',
   'DEFECT_RECORD',
   '[{"name":"p_title","type":"text","required":true},
     {"name":"p_description","type":"text","required":true},
     {"name":"p_location_on_vessel","type":"text","required":true},
     {"name":"p_severity","type":"enum","required":true,"values":["LOW","MEDIUM","HIGH","CRITICAL"]},
     {"name":"p_root_cause","type":"enum","required":true,"values":["WEAR","CORROSION","IMPACT","FATIGUE","INSTALLATION_ERROR","DESIGN_DEFICIENCY","MOISTURE_INGRESS","OTHER"]},
     {"name":"p_disposition","type":"enum","required":true,"values":["REPAIR","REPLACE","MONITOR","ACCEPT_AS_IS","PENDING"]},
     {"name":"p_is_class_defect","type":"boolean","required":false},
     {"name":"p_class_item_ref","type":"text","required":false},
     {"name":"p_cost_impact","type":"numeric","required":false},
     {"name":"p_schedule_impact_days","type":"integer","required":false},
     {"name":"p_work_package_id","type":"uuid","required":false},
     {"name":"p_inspection_event_id","type":"uuid","required":false}]'::jsonb,
   '{CHANGE_ORDER,OWNER_APPROVAL}'),

  ('action_update_defect_status','Change NCR status',
   'Moves an NCR through its lifecycle. A closed NCR cannot be reopened.',
   'DEFECT_RECORD',
   '[{"name":"p_defect_id","type":"uuid","required":true},
     {"name":"p_status","type":"enum","required":true,"values":["OPEN","IN_PROGRESS","PENDING_APPROVAL","CLOSED","DISPUTED"]},
     {"name":"p_closed_date","type":"date","required":false}]'::jsonb,
   '{}'),

  ('action_record_inspection_result','Record inspection result',
   'Records the outcome of a survey attendance and refreshes its defect count.',
   'INSPECTION_EVENT',
   '[{"name":"p_inspection_id","type":"uuid","required":true},
     {"name":"p_result","type":"enum","required":true,"values":["PASS","CONDITIONAL_PASS","FAIL","PENDING"]},
     {"name":"p_notes","type":"text","required":false},
     {"name":"p_actual_date","type":"date","required":false}]'::jsonb,
   '{}'),

  ('action_decide_approval','Decide owner approval',
   'Records the owner decision and propagates it to the Change Order the approval gates. An approval can only be decided once.',
   'OWNER_APPROVAL',
   '[{"name":"p_approval_id","type":"uuid","required":true},
     {"name":"p_decision","type":"enum","required":true,"values":["APPROVED","REJECTED"]},
     {"name":"p_notes","type":"text","required":false}]'::jsonb,
   '{CHANGE_ORDER}'),

  ('action_advance_project_phase','Advance project phase',
   'Moves the project to the next phase. The next phase is derived server-side from the current one.',
   'PROJECT', '[]'::jsonb, '{}'),

  ('action_register_document','Register document',
   'Records an uploaded document and links it to another object.',
   'DOCUMENT',
   '[{"name":"p_title","type":"text","required":true},
     {"name":"p_doc_type","type":"enum","required":true,"values":["SURVEY_REPORT","CLASS_CERTIFICATE","DRAWING","SPECIFICATION","NCR","CHANGE_ORDER","APPROVAL","CORRESPONDENCE","PHOTO","OTHER"]},
     {"name":"p_file_url","type":"text","required":true},
     {"name":"p_file_size","type":"integer","required":false},
     {"name":"p_mime_type","type":"text","required":false},
     {"name":"p_linked_object_type","type":"enum","required":false,"values":["VESSEL","PROJECT","WORK_PACKAGE","CHANGE_ORDER","INSPECTION_EVENT","DEFECT_RECORD","OWNER_APPROVAL","DOCUMENT","SUBCONTRACTOR"]},
     {"name":"p_linked_object_id","type":"uuid","required":false},
     {"name":"p_is_class_document","type":"boolean","required":false}]'::jsonb,
   '{}');
