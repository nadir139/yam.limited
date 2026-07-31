-- =============================================================================
-- YAM Migration 018 — THE VOCABULARY IS PER PROJECT TYPE
--
-- Applied to the live project as two migrations, in this order:
--   `property_vocabulary_values`   (must run ALONE: ALTER TYPE ... ADD VALUE
--                                   cannot be used in the transaction that
--                                   adds it, and step 2 uses these values)
--   `ontology_vocabulary`
--
-- Every enum in this system was named by someone looking at a boat. Migration
-- 016 added PROPERTY as a project type, which made that visible: a farmhouse
-- outside Olbia walked Pre-Survey → HAUL OUT → … → SEA TRIALS, was offered
-- RIGGING and PAINT as disciplines, and had nowhere to file a visura catastale
-- except OTHER. All of it worked, and all of it was wrong about the thing it
-- described — the one thing an ontology cannot afford to be.
--
-- The approach: the enums become the UNION of every vertical's values, and a
-- registry table decides which ones each project type may actually use. That
-- keeps the type safety of enums — a bad value is still rejected by Postgres —
-- while making a new vertical a set of INSERTs rather than a schema change.
--
-- Converting the columns to text was the obvious alternative and was rejected:
-- it trades a compile-time guarantee for a convention, on the very columns the
-- cascade rules read.
-- =============================================================================

-- ─── Step 1 (own transaction): the values ────────────────────────────────────

-- Phases a building goes through. The Italian process is the model: find out
-- what is actually there, gather what the state thinks is there, compare them,
-- regularise the difference, certify the result.
alter type project_phase add value if not exists 'DOCUMENT_GATHERING';
alter type project_phase add value if not exists 'SURVEY';
alter type project_phase add value if not exists 'COMPLIANCE_REVIEW';
alter type project_phase add value if not exists 'REMEDIATION';
alter type project_phase add value if not exists 'CERTIFICATION';

-- Disciplines. STRUCTURAL, ELECTRICAL, MECHANICAL, INTERIOR and SAFETY already
-- mean the same thing on a building; these are the ones with no marine analogue.
alter type discipline add value if not exists 'PLANNING';
alter type discipline add value if not exists 'CADASTRAL';
alter type discipline add value if not exists 'ENERGY';
alter type discipline add value if not exists 'LANDSCAPE';

-- Documents, named in the Italian originals rather than translated: a geometra
-- asked for a "visura catastale" will not recognise "land registry extract",
-- and the label shown in each language comes from the i18n dictionary anyway.
alter type doc_type add value if not exists 'VISURA_CATASTALE';
alter type doc_type add value if not exists 'PLANIMETRIA_CATASTALE';
alter type doc_type add value if not exists 'BUILDING_PERMIT';
alter type doc_type add value if not exists 'AMNESTY';
alter type doc_type add value if not exists 'HABITABILITY';
alter type doc_type add value if not exists 'ENERGY_CERTIFICATE';
alter type doc_type add value if not exists 'DEED';
alter type doc_type add value if not exists 'COMPLIANCE_DECLARATION';
alter type doc_type add value if not exists 'LANDSCAPE_CLEARANCE';

-- Why a finding exists on a building. "Corrosion" is rarely the answer;
-- "there is a balcony that no permit mentions" usually is.
alter type root_cause add value if not exists 'UNPERMITTED_WORKS';
alter type root_cause add value if not exists 'CADASTRAL_MISMATCH';
alter type root_cause add value if not exists 'MISSING_CERTIFICATE';
alter type root_cause add value if not exists 'EXPIRED_PERMIT';

-- ─── Step 2: the registry table ──────────────────────────────────────────────
--
-- Sits alongside ontology_object_types / _links / _actions and is read the same
-- way: the registry describes the model, the app renders the registry.
--
-- `applies_to = null` means "every project type" — the shared spine. A row with
-- a project_type narrows to that type.

create table if not exists ontology_vocabulary (
  id uuid primary key default uuid_generate_v4(),
  -- PHASE | DISCIPLINE | DOC_TYPE | ROOT_CAUSE
  kind text not null,
  -- The enum value as stored in the domain tables.
  value text not null,
  -- Null = shared by every project type.
  applies_to project_type,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (kind, value, applies_to)
);

create index if not exists ontology_vocabulary_lookup_idx
  on ontology_vocabulary (kind, applies_to, display_order);

alter table ontology_vocabulary enable row level security;

-- Readable by anon, like the rest of the registry: it publishes the shape of
-- the model and no project data.
do $$ begin
  create policy "read_vocabulary" on ontology_vocabulary for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on ontology_vocabulary to anon, authenticated;
revoke insert, update, delete, truncate on ontology_vocabulary from anon, authenticated;

comment on table ontology_vocabulary is
  'Which enum values each project type may use. applies_to null means shared. Adding a vertical is rows here, not a schema change.';

-- ─── Phases ──────────────────────────────────────────────────────────────────
--
-- Deliberately NOT shared. A phase ladder is the one vocabulary where the order
-- is the meaning, so each type gets its own complete sequence.

insert into ontology_vocabulary (kind, value, applies_to, display_order) values
  -- Vessels: the existing ladder, unchanged.
  ('PHASE', 'PRE_SURVEY',         'FIVE_YEAR_SURVEY', 1),
  ('PHASE', 'HAUL_OUT',           'FIVE_YEAR_SURVEY', 2),
  ('PHASE', 'STRUCTURAL',         'FIVE_YEAR_SURVEY', 3),
  ('PHASE', 'SYSTEMS',            'FIVE_YEAR_SURVEY', 4),
  ('PHASE', 'INTERIOR',           'FIVE_YEAR_SURVEY', 5),
  ('PHASE', 'SEA_TRIALS',         'FIVE_YEAR_SURVEY', 6),
  ('PHASE', 'DELIVERED',          'FIVE_YEAR_SURVEY', 7),

  ('PHASE', 'PRE_SURVEY',         'REFIT', 1),
  ('PHASE', 'HAUL_OUT',           'REFIT', 2),
  ('PHASE', 'STRUCTURAL',         'REFIT', 3),
  ('PHASE', 'SYSTEMS',            'REFIT', 4),
  ('PHASE', 'INTERIOR',           'REFIT', 5),
  ('PHASE', 'SEA_TRIALS',         'REFIT', 6),
  ('PHASE', 'DELIVERED',          'REFIT', 7),

  ('PHASE', 'PRE_SURVEY',         'NEWBUILD', 1),
  ('PHASE', 'STRUCTURAL',         'NEWBUILD', 2),
  ('PHASE', 'SYSTEMS',            'NEWBUILD', 3),
  ('PHASE', 'INTERIOR',           'NEWBUILD', 4),
  ('PHASE', 'SEA_TRIALS',         'NEWBUILD', 5),
  ('PHASE', 'DELIVERED',          'NEWBUILD', 6),

  ('PHASE', 'PRE_SURVEY',         'ANNUAL_SURVEY', 1),
  ('PHASE', 'HAUL_OUT',           'ANNUAL_SURVEY', 2),
  ('PHASE', 'STRUCTURAL',         'ANNUAL_SURVEY', 3),
  ('PHASE', 'DELIVERED',          'ANNUAL_SURVEY', 4),

  ('PHASE', 'PRE_SURVEY',         'DAMAGE_REPAIR', 1),
  ('PHASE', 'HAUL_OUT',           'DAMAGE_REPAIR', 2),
  ('PHASE', 'STRUCTURAL',         'DAMAGE_REPAIR', 3),
  ('PHASE', 'SYSTEMS',            'DAMAGE_REPAIR', 4),
  ('PHASE', 'SEA_TRIALS',         'DAMAGE_REPAIR', 5),
  ('PHASE', 'DELIVERED',          'DAMAGE_REPAIR', 6),

  -- Buildings.
  ('PHASE', 'PRE_SURVEY',         'PROPERTY', 1),
  ('PHASE', 'DOCUMENT_GATHERING', 'PROPERTY', 2),
  ('PHASE', 'SURVEY',             'PROPERTY', 3),
  ('PHASE', 'COMPLIANCE_REVIEW',  'PROPERTY', 4),
  ('PHASE', 'REMEDIATION',        'PROPERTY', 5),
  ('PHASE', 'CERTIFICATION',      'PROPERTY', 6),
  ('PHASE', 'DELIVERED',          'PROPERTY', 7)
on conflict do nothing;

-- ─── Disciplines ─────────────────────────────────────────────────────────────

insert into ontology_vocabulary (kind, value, applies_to, display_order) values
  ('DISCIPLINE', 'STRUCTURAL', null, 1),
  ('DISCIPLINE', 'MECHANICAL', null, 2),
  ('DISCIPLINE', 'ELECTRICAL', null, 3),
  ('DISCIPLINE', 'INTERIOR',   null, 4),
  ('DISCIPLINE', 'SAFETY',     null, 5),

  ('DISCIPLINE', 'HULL',      'FIVE_YEAR_SURVEY', 10),
  ('DISCIPLINE', 'RIGGING',   'FIVE_YEAR_SURVEY', 11),
  ('DISCIPLINE', 'PAINT',     'FIVE_YEAR_SURVEY', 12),
  ('DISCIPLINE', 'CLASS',     'FIVE_YEAR_SURVEY', 13),
  ('DISCIPLINE', 'HULL',      'REFIT', 10),
  ('DISCIPLINE', 'RIGGING',   'REFIT', 11),
  ('DISCIPLINE', 'PAINT',     'REFIT', 12),
  ('DISCIPLINE', 'CLASS',     'REFIT', 13),
  ('DISCIPLINE', 'HULL',      'NEWBUILD', 10),
  ('DISCIPLINE', 'RIGGING',   'NEWBUILD', 11),
  ('DISCIPLINE', 'PAINT',     'NEWBUILD', 12),
  ('DISCIPLINE', 'CLASS',     'NEWBUILD', 13),
  ('DISCIPLINE', 'HULL',      'ANNUAL_SURVEY', 10),
  ('DISCIPLINE', 'CLASS',     'ANNUAL_SURVEY', 11),
  ('DISCIPLINE', 'HULL',      'DAMAGE_REPAIR', 10),
  ('DISCIPLINE', 'PAINT',     'DAMAGE_REPAIR', 11),
  ('DISCIPLINE', 'CLASS',     'DAMAGE_REPAIR', 12),

  ('DISCIPLINE', 'PLANNING',  'PROPERTY', 10),
  ('DISCIPLINE', 'CADASTRAL', 'PROPERTY', 11),
  ('DISCIPLINE', 'ENERGY',    'PROPERTY', 12),
  ('DISCIPLINE', 'LANDSCAPE', 'PROPERTY', 13)
on conflict do nothing;

-- ─── Document types ──────────────────────────────────────────────────────────

insert into ontology_vocabulary (kind, value, applies_to, display_order) values
  ('DOC_TYPE', 'SURVEY_REPORT',   null, 1),
  ('DOC_TYPE', 'DRAWING',         null, 2),
  ('DOC_TYPE', 'SPECIFICATION',   null, 3),
  ('DOC_TYPE', 'NCR',             null, 4),
  ('DOC_TYPE', 'CHANGE_ORDER',    null, 5),
  ('DOC_TYPE', 'APPROVAL',        null, 6),
  ('DOC_TYPE', 'CORRESPONDENCE',  null, 7),
  ('DOC_TYPE', 'PHOTO',           null, 8),
  ('DOC_TYPE', 'OTHER',           null, 99),

  ('DOC_TYPE', 'CLASS_CERTIFICATE', 'FIVE_YEAR_SURVEY', 10),
  ('DOC_TYPE', 'CLASS_CERTIFICATE', 'REFIT', 10),
  ('DOC_TYPE', 'CLASS_CERTIFICATE', 'NEWBUILD', 10),
  ('DOC_TYPE', 'CLASS_CERTIFICATE', 'ANNUAL_SURVEY', 10),
  ('DOC_TYPE', 'CLASS_CERTIFICATE', 'DAMAGE_REPAIR', 10),

  ('DOC_TYPE', 'VISURA_CATASTALE',      'PROPERTY', 10),
  ('DOC_TYPE', 'PLANIMETRIA_CATASTALE', 'PROPERTY', 11),
  ('DOC_TYPE', 'DEED',                  'PROPERTY', 12),
  ('DOC_TYPE', 'BUILDING_PERMIT',       'PROPERTY', 13),
  ('DOC_TYPE', 'AMNESTY',               'PROPERTY', 14),
  ('DOC_TYPE', 'LANDSCAPE_CLEARANCE',   'PROPERTY', 15),
  ('DOC_TYPE', 'COMPLIANCE_DECLARATION','PROPERTY', 16),
  ('DOC_TYPE', 'HABITABILITY',          'PROPERTY', 17),
  ('DOC_TYPE', 'ENERGY_CERTIFICATE',    'PROPERTY', 18)
on conflict do nothing;

-- ─── Root causes ─────────────────────────────────────────────────────────────

insert into ontology_vocabulary (kind, value, applies_to, display_order) values
  ('ROOT_CAUSE', 'DESIGN_DEFICIENCY',  null, 1),
  ('ROOT_CAUSE', 'INSTALLATION_ERROR', null, 2),
  ('ROOT_CAUSE', 'WEAR',               null, 3),
  ('ROOT_CAUSE', 'MOISTURE_INGRESS',   null, 4),
  ('ROOT_CAUSE', 'IMPACT',             null, 5),
  ('ROOT_CAUSE', 'OTHER',              null, 99),

  ('ROOT_CAUSE', 'CORROSION', 'FIVE_YEAR_SURVEY', 10),
  ('ROOT_CAUSE', 'FATIGUE',   'FIVE_YEAR_SURVEY', 11),
  ('ROOT_CAUSE', 'CORROSION', 'REFIT', 10),
  ('ROOT_CAUSE', 'FATIGUE',   'REFIT', 11),
  ('ROOT_CAUSE', 'CORROSION', 'NEWBUILD', 10),
  ('ROOT_CAUSE', 'FATIGUE',   'NEWBUILD', 11),
  ('ROOT_CAUSE', 'CORROSION', 'ANNUAL_SURVEY', 10),
  ('ROOT_CAUSE', 'FATIGUE',   'ANNUAL_SURVEY', 11),
  ('ROOT_CAUSE', 'CORROSION', 'DAMAGE_REPAIR', 10),
  ('ROOT_CAUSE', 'FATIGUE',   'DAMAGE_REPAIR', 11),

  ('ROOT_CAUSE', 'UNPERMITTED_WORKS',   'PROPERTY', 10),
  ('ROOT_CAUSE', 'CADASTRAL_MISMATCH',  'PROPERTY', 11),
  ('ROOT_CAUSE', 'MISSING_CERTIFICATE', 'PROPERTY', 12),
  ('ROOT_CAUSE', 'EXPIRED_PERMIT',      'PROPERTY', 13)
on conflict do nothing;

-- ─── The phase ladder is now per type ────────────────────────────────────────
--
-- Was: enum_range(null::project_phase), which is exactly why a farmhouse was
-- offered "Advance to Haul Out". Now it walks this project's own sequence.

create or replace function project_phases(p_project_type project_type)
returns text[] language sql stable
set search_path = public, pg_temp
as $fn$
  select coalesce(
    array_agg(value order by display_order)
      filter (where applies_to = p_project_type),
    -- A project type with no ladder defined falls back to the enum's own order
    -- rather than leaving the project unable to advance at all.
    (select array_agg(e.enumlabel::text order by e.enumsortorder)
       from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname = 'project_phase')
  )
  from ontology_vocabulary where kind = 'PHASE';
$fn$;

grant execute on function project_phases(project_type) to anon, authenticated;

create or replace function action_advance_project_phase(p_project_id uuid default null)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_type project_type;
  v_phases text[];
  v_current project_phase;
  v_next project_phase;
  v_idx int;
  v_after projects;
begin
  perform require_permission('action_advance_project_phase', v_project_id);

  select phase, project_type into v_current, v_type
    from projects where id = v_project_id;
  if not found then
    raise exception 'Project not found' using errcode = 'P0001';
  end if;

  v_phases := project_phases(v_type);

  select i into v_idx
    from generate_subscripts(v_phases, 1) i
   where v_phases[i] = v_current::text;

  if v_idx is null then
    raise exception 'Phase % is not part of a % project''s sequence', v_current, v_type
      using errcode = 'P0001';
  end if;
  if v_idx >= array_length(v_phases, 1) then
    raise exception 'Project is already at the final phase (%)', v_current
      using errcode = 'P0001';
  end if;

  v_next := v_phases[v_idx + 1]::project_phase;

  update projects set phase = v_next where id = v_project_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PHASE_ADVANCED', 'PROJECT', v_project_id,
    jsonb_build_object('phase', v_current),
    jsonb_build_object('phase', v_next),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_after);
end;
$fn$;

revoke execute on function action_advance_project_phase(uuid) from public, anon;
grant execute on function action_advance_project_phase(uuid) to authenticated;

-- A new project starts at its own first phase, not at a hardcoded PRE_SURVEY.
-- Also enrols its creator as already-arrived, so the invite lifecycle added in
-- 017 does not show the person who made the project as "never opened it".
create or replace function action_create_project(
  p_name text,
  p_project_type text default 'REFIT',
  p_yard_name text default null,
  p_yard_location text default null,
  p_planned_start date default null,
  p_planned_delivery date default null,
  p_budget_locked numeric default 0,
  p_class_society text default null
)
returns json language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_actor_id uuid := current_actor_id();
  v_type project_type;
  v_first_phase project_phase;
  v_project projects;
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A project needs a name' using errcode = 'P0001';
  end if;

  begin
    v_type := p_project_type::project_type;
  exception when invalid_text_representation then
    raise exception 'Unknown project type: %', p_project_type using errcode = 'P0001';
  end;

  v_first_phase := (project_phases(v_type))[1]::project_phase;

  insert into projects (
    vessel_id, name, project_type, phase, yard_name, yard_location,
    planned_start, planned_delivery, budget_locked, budget_spent,
    budget_contingency, class_society
  ) values (
    null, trim(p_name), v_type, v_first_phase,
    nullif(trim(coalesce(p_yard_name, '')), ''),
    nullif(trim(coalesce(p_yard_location, '')), ''),
    p_planned_start, p_planned_delivery, coalesce(p_budget_locked, 0), 0, 0,
    nullif(p_class_society, '')::class_society
  ) returning * into v_project;

  insert into project_members (project_id, user_id, role, name, email, status, first_seen_at, last_seen_at)
  values (v_project.id, v_actor_id, 'OWNERS_REP'::user_role,
          coalesce(current_actor_name(), v_email), v_email, 'ACTIVE', now(), now());

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project.id, 'PROJECT_CREATED', 'PROJECT', v_project.id, null,
    jsonb_build_object('name', v_project.name, 'project_type', v_project.project_type,
                       'phase', v_project.phase),
    v_actor_id, coalesce(current_actor_name(), v_email)
  );

  return json_build_object('project', row_to_json(v_project));
end;
$fn$;

revoke execute on function
  action_create_project(text, text, text, text, date, date, numeric, text) from public, anon;
grant execute on function
  action_create_project(text, text, text, text, date, date, numeric, text) to authenticated;

-- ─── Verified against the live database ──────────────────────────────────────
--
--   select array_to_string(project_phases('PROPERTY'), ' → ');
--   -- PRE_SURVEY → DOCUMENT_GATHERING → SURVEY → COMPLIANCE_REVIEW
--   --            → REMEDIATION → CERTIFICATION → DELIVERED
--
--   select array_to_string(project_phases('FIVE_YEAR_SURVEY'), ' → ');
--   -- PRE_SURVEY → HAUL_OUT → STRUCTURAL → SYSTEMS → INTERIOR
--   --            → SEA_TRIALS → DELIVERED
--
-- Advancing a PROPERTY project stepped PRE_SURVEY → DOCUMENT_GATHERING →
-- SURVEY; a new PROPERTY project starts at its own first phase. Rendered in a
-- browser: no "Haul Out" or "Sea Trials" anywhere on a building, and the
-- Italian timeline reads Pre-visita → Raccolta documenti → Rilievo → Verifica
-- di conformità → Sanatoria e opere → Certificazione → Consegnato.
