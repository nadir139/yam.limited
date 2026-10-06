-- =============================================================================
-- YAM Migration 020 — REPAIR ACTION PARAMETER SHAPE
--
-- Applied to the live project on 2026-08-11 as `repair_action_parameter_shape`,
-- but never committed here -- this file restores it from
-- supabase_migrations.schema_migrations so the repository matches the database.
-- =============================================================================

-- Migration 019 wrote ontology_actions.parameters as a JSON *object* for four
-- rows. Every other row is an array of {name, type, required}, which is the
-- shape the agent reads:
--
--   actions.filter((a) => (a.parameters ?? []).some((p) => p.name === "p_project_id"))
--
-- `{}.some` is not a function. action_post_message is agent-usable, so the
-- agent loaded it, threw a TypeError outside any handler, and the platform
-- answered 500 with no CORS headers -- which the browser reports as a CORS
-- failure. The console said "blocked by CORS policy"; the cause was a JSON
-- shape in a registry table. Every agent request had been failing since 019.

with enums as (
  select t.typname, jsonb_agg(e.enumlabel::text order by e.enumsortorder) as vals
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
   where t.typname in ('message_kind', 'message_source', 'object_type')
   group by t.typname
)
update ontology_actions set parameters = jsonb_build_array(
  jsonb_build_object('name', 'p_body', 'type', 'text', 'required', true),
  jsonb_build_object('name', 'p_kind', 'type', 'enum',
                     'values', (select vals from enums where typname = 'message_kind'),
                     'required', false),
  jsonb_build_object('name', 'p_linked_object_type', 'type', 'enum',
                     'values', (select vals from enums where typname = 'object_type'),
                     'required', false),
  jsonb_build_object('name', 'p_linked_object_id', 'type', 'uuid', 'required', false),
  jsonb_build_object('name', 'p_source', 'type', 'enum',
                     'values', (select vals from enums where typname = 'message_source'),
                     'required', false),
  jsonb_build_object('name', 'p_meeting_ref', 'type', 'text', 'required', false),
  jsonb_build_object('name', 'p_mentions', 'type', 'uuid[]', 'required', false),
  jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
)
where key = 'action_post_message';

update ontology_actions set parameters = jsonb_build_array(
  jsonb_build_object('name', 'p_item_id', 'type', 'uuid', 'required', true),
  jsonb_build_object('name', 'p_response', 'type', 'text', 'required', true),
  jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
) where key = 'action_acknowledge_item';

update ontology_actions set parameters = jsonb_build_array(
  jsonb_build_object('name', 'p_item_id', 'type', 'uuid', 'required', true),
  jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true),
  jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
) where key = 'action_decline_item';

update ontology_actions set parameters = jsonb_build_array(
  jsonb_build_object('name', 'p_item_id', 'type', 'uuid', 'required', true),
  jsonb_build_object('name', 'p_note', 'type', 'text', 'required', false),
  jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
) where key = 'action_complete_item';

-- The actual fix. A registry row is the agent's tool manifest, so a malformed
-- one takes the agent down entirely -- and does it at request time, in a
-- rewritten error, days after the migration that caused it. This makes the bad
-- shape unrepresentable: the next migration to get it wrong fails immediately,
-- with the row in the error message.
alter table ontology_actions
  drop constraint if exists ontology_actions_parameters_is_array;
alter table ontology_actions
  add constraint ontology_actions_parameters_is_array
  check (jsonb_typeof(parameters) = 'array');

comment on column ontology_actions.parameters is
  'ARRAY of {name, type, required?, values?} -- never an object. The agent builds its tool schemas from this; a JSON object here throws inside the agent and surfaces as an unrelated CORS error. Constrained since migration 020.';
