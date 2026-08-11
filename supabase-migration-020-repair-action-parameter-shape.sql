-- =============================================================================
-- YAM Migration 020 — REPAIR THE ACTION PARAMETER SHAPE
--
-- Applied to the live project as one migration:
--   `repair_action_parameter_shape`
--
-- A regression introduced by migration 019, found from a screenshot of the
-- agent console reading "Could not reach the agent" over a browser console
-- full of CORS errors.
--
-- None of it was CORS.
--
-- `ontology_actions.parameters` is an ARRAY of {name, type, required?, values?}
-- in every row the registry shipped with. Migration 019 rewrote four of them as
-- a JSON OBJECT — `{"p_body": "text", …}` — which reads perfectly well and is
-- the wrong shape. The agent builds its tool manifest from this table:
--
--   actions.filter((a) => (a.parameters ?? []).some((p) => p.name === "p_project_id"))
--
-- `{}.some` is not a function. `action_post_message` is agent-usable, so every
-- request loaded it, threw a TypeError outside any try block, and the platform
-- answered a bare 500 with no CORS headers — which the browser reports as a
-- CORS policy failure. Every agent request had failed since 019 went live, and
-- the error named the wrong subsystem the entire time.
--
-- Two lessons, and the second is the one worth keeping:
--
--   1. A registry that doubles as an agent's tool manifest is executable data.
--      Editing it is a code change and deserves the same suspicion.
--   2. The failure was invisible because nothing enforced the shape. Hence the
--      constraint at the bottom: the next migration to get this wrong fails at
--      apply time with the offending row named, instead of days later inside a
--      rewritten browser error.
-- =============================================================================

-- ─── The four rows 019 malformed ─────────────────────────────────────────────
--
-- Enum values are derived from pg_enum rather than typed out, so the registry
-- cannot drift from the database the way the TypeScript unions did in #25.

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

-- ─── Make the bad shape unrepresentable ──────────────────────────────────────

alter table ontology_actions
  drop constraint if exists ontology_actions_parameters_is_array;
alter table ontology_actions
  add constraint ontology_actions_parameters_is_array
  check (jsonb_typeof(parameters) = 'array');

comment on column ontology_actions.parameters is
  'ARRAY of {name, type, required?, values?} -- never an object. The agent builds its tool schemas from this; a JSON object here throws inside the agent and surfaces as an unrelated CORS error. Constrained since migration 020.';

-- =============================================================================
-- Verification
--
--   select count(*) filter (where jsonb_typeof(parameters) <> 'array') from ontology_actions;
--   -- must be 0
--
--   select exists (select 1 from jsonb_array_elements(parameters) p
--                   where p->>'name' = 'p_project_id')
--     from ontology_actions where key = 'action_post_message';
--   -- must be true: this is the exact probe the agent runs
--
-- And the constraint itself:
--
--   update ontology_actions set parameters = '{"a":1}'::jsonb where key = 'action_raise_defect';
--   -- must fail with ontology_actions_parameters_is_array
-- =============================================================================
