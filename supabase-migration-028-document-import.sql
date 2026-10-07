-- =============================================================================
-- YAM Migration 028 — THE BOAT FROM ITS DRAWINGS
--
-- Applied to the live project as `space_object_type` (section 0) and
-- `document_import` (everything else). As in 027, the enum value must commit
-- before anything uses it.
--
-- A boat arrives with a manual and a set of schematics. Typing her parts in
-- by hand is the reason nobody does it, so this migration gives the record
-- what a drawing set describes, and a safe way to accept it in one go:
--
-- 1. Spaces. Where things are: aft peak, engine room, wet cell, owner's
--    cabin. A second tree beside the systems tree, because every part has
--    both a function (Electrical > DC > Distribution) and a place (Aft peak SB).
--    Like parts, spaces belong to the vessel.
--
-- 2. Parts gain a kind (SYSTEM / ASSEMBLY / COMPONENT), a space, the
--    designation the drawings use for them (11.1Q21) and a safety-critical
--    flag (a seacock below the waterline is not a bulb).
--
-- 3. Connections. The drawings are graphs: the bilge pump E/R is fed through
--    breaker 11.1Q21 and pumps overboard at the aft peak. A connection says
--    which part powers, protects, controls, signals or flows into which, so
--    "this breaker tripped, what stopped?" has an answer in the record.
--
-- 4. References. Where a part is drawn: document, page, sheet, grid cell and
--    an approximate box on the page, so the app can open the drawing on it.
--
-- 5. Imports. Extraction proposes; a person decides. The proposal is stored as
--    a draft, edited in review, and applied by action_apply_part_import in one
--    transaction (creating the vessel first if the project has none). A
--    re-applied or half-applied import cannot happen: the draft is locked and
--    its status moves once.
-- =============================================================================

-- 0. The object type (applied first, on its own) --------------------------------
alter type public.object_type add value if not exists 'SPACE';

-- 1. Spaces ---------------------------------------------------------------------
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid references public.vessels(id),
  project_id uuid references public.projects(id),
  parent_id uuid references public.spaces(id),
  name text not null check (length(trim(name)) between 1 and 200),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text,
  check (num_nonnulls(vessel_id, project_id) = 1),
  check (parent_id is null or parent_id <> id)
);

create unique index if not exists spaces_live_name
  on public.spaces (
    coalesce(vessel_id, project_id),
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  where removed_at is null;
create index if not exists spaces_vessel_idx on public.spaces (vessel_id);
create index if not exists spaces_project_idx on public.spaces (project_id);
create index if not exists spaces_parent_idx on public.spaces (parent_id);

alter table public.spaces enable row level security;
create policy spaces_read on public.spaces
  for select using (can_read_part(vessel_id, project_id));
revoke all on public.spaces from anon, authenticated;
grant select on public.spaces to authenticated;

-- 2. More about a part ------------------------------------------------------------
alter table public.parts add column if not exists kind text
  check (kind in ('SYSTEM', 'ASSEMBLY', 'COMPONENT'));
alter table public.parts add column if not exists space_id uuid references public.spaces(id);
alter table public.parts add column if not exists designation text;
alter table public.parts add column if not exists safety_critical boolean not null default false;
create index if not exists parts_space_idx on public.parts (space_id);

-- 3. Connections -------------------------------------------------------------------
create table if not exists public.part_connections (
  id uuid primary key default gen_random_uuid(),
  -- The asset both parts belong to, for reading.
  vessel_id uuid references public.vessels(id),
  project_id uuid references public.projects(id),
  from_part_id uuid not null references public.parts(id),
  to_part_id uuid not null references public.parts(id),
  kind text not null
    check (kind in ('POWERS', 'PROTECTS', 'CONTROLS', 'SIGNALS', 'FLOWS_TO', 'CONNECTED')),
  label text,
  source_document_id uuid references public.documents(id),
  source_page integer,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text,
  check (num_nonnulls(vessel_id, project_id) = 1),
  check (from_part_id <> to_part_id)
);

create unique index if not exists part_connections_live
  on public.part_connections (from_part_id, to_part_id, kind)
  where removed_at is null;
create index if not exists part_connections_to_idx on public.part_connections (to_part_id);
create index if not exists part_connections_vessel_idx on public.part_connections (vessel_id);
create index if not exists part_connections_project_idx on public.part_connections (project_id);
create index if not exists part_connections_document_idx on public.part_connections (source_document_id);

alter table public.part_connections enable row level security;
create policy part_connections_read on public.part_connections
  for select using (can_read_part(vessel_id, project_id));
revoke all on public.part_connections from anon, authenticated;
grant select on public.part_connections to authenticated;

-- 4. References: where a part is drawn ------------------------------------------------
create table if not exists public.part_references (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id),
  document_id uuid not null references public.documents(id),
  -- The document's project: reading a reference needs to be able to read it.
  project_id uuid not null references public.projects(id),
  page integer not null check (page >= 1),
  sheet text,
  grid text,
  -- Approximate box on the page as displayed, normalised 0..1: x0, y0, x1, y1.
  bbox numeric[] check (bbox is null or array_length(bbox, 1) = 4),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text
);

create unique index if not exists part_references_unique
  on public.part_references (part_id, document_id, page, coalesce(grid, ''));
create index if not exists part_references_document_idx on public.part_references (document_id);
create index if not exists part_references_project_idx on public.part_references (project_id);

alter table public.part_references enable row level security;
create policy part_references_read on public.part_references
  for select using (is_project_member(project_id));
revoke all on public.part_references from anon, authenticated;
grant select on public.part_references to authenticated;

-- 5. Imports --------------------------------------------------------------------------
create table if not exists public.part_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  document_ids uuid[] not null default '{}',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPLIED', 'DISCARDED')),
  proposal jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz,
  decided_at timestamptz,
  decided_by_name text
);
create index if not exists part_imports_project_idx on public.part_imports (project_id);

alter table public.part_imports enable row level security;
create policy part_imports_read on public.part_imports
  for select using (is_project_member(project_id));
revoke all on public.part_imports from anon, authenticated;
grant select on public.part_imports to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'spaces') then
    alter publication supabase_realtime add table public.spaces;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'part_connections') then
    alter publication supabase_realtime add table public.part_connections;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'part_references') then
    alter publication supabase_realtime add table public.part_references;
  end if;
end $$;

-- 6. Helpers (called only from Actions) -------------------------------------------------

create or replace function public.space_is_on_project(p_space public.spaces, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    p_space.project_id = p_project_id
      or p_space.vessel_id = (select vessel_id from projects where id = p_project_id),
    false
  );
$$;
revoke execute on function public.space_is_on_project(public.spaces, uuid) from anon, authenticated, public;

-- 7. Actions ------------------------------------------------------------------------------

-- Records a space (compartment, cabin, locker) on the asset. Returns the
-- existing one when the same name already sits under the same parent.
create or replace function public.action_create_space(
  p_project_id uuid default null,
  p_name text default null,
  p_parent_id uuid default null,
  p_notes text default null
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
  v_project projects;
  v_parent spaces;
  v_space spaces;
  v_name text := clean_text(p_name);
begin
  perform require_permission('action_create_space', v_project_id);
  select * into v_project from projects where id = v_project_id;
  if v_project.project_type <> 'PROPERTY' and v_project.vessel_id is null then
    raise exception 'This project has no vessel yet. Record the boat first (action_set_project_vessel).'
      using errcode = 'P0001';
  end if;
  if v_name is null then
    raise exception 'A space needs a name' using errcode = 'P0001';
  end if;
  if p_parent_id is not null then
    select * into v_parent from spaces where id = p_parent_id;
    if not found or not space_is_on_project(v_parent, v_project_id) or v_parent.removed_at is not null then
      raise exception 'No current space with that id on this project' using errcode = 'P0001';
    end if;
  end if;

  select * into v_space from spaces
   where coalesce(vessel_id, project_id) = coalesce(v_project.vessel_id, v_project_id)
     and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and lower(trim(name)) = lower(v_name)
     and removed_at is null;
  if found then
    return json_build_object('space', row_to_json(v_space), 'existing', true);
  end if;

  insert into spaces (vessel_id, project_id, parent_id, name, notes, created_by, created_by_name)
  values (
    v_project.vessel_id,
    case when v_project.vessel_id is null then v_project_id end,
    p_parent_id, v_name, clean_text(p_notes), v_actor_id, v_actor_name
  ) returning * into v_space;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SPACE_CREATED', 'SPACE', v_space.id,
    null, to_jsonb(v_space) - 'created_at', v_actor_id, v_actor_name
  );

  return json_build_object('space', row_to_json(v_space), 'existing', false);
end;
$$;

-- Sets what a part is and where it sits: kind, the designation the drawings
-- use, its space and whether it is safety-critical. Omitted keeps; p_clear
-- empties 'kind', 'designation' or 'space'.
create or replace function public.action_set_part_details(
  p_part_id uuid,
  p_project_id uuid default null,
  p_kind text default null,
  p_designation text default null,
  p_space_id uuid default null,
  p_safety_critical boolean default null,
  p_clear text[] default null,
  p_reason text default null
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
  v_before parts;
  v_after parts;
  v_space spaces;
  v_clear text[] := coalesce(p_clear, '{}');
  v_kind text := upper(clean_text(p_kind));
begin
  perform require_permission('action_update_part', v_project_id);
  select * into v_before from parts where id = p_part_id;
  if not found or not part_is_on_project(v_before, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    raise exception '"%" was removed and cannot be changed', v_before.name using errcode = 'P0001';
  end if;
  if v_kind is not null and v_kind not in ('SYSTEM', 'ASSEMBLY', 'COMPONENT') then
    raise exception 'Kind is SYSTEM, ASSEMBLY or COMPONENT, not %', p_kind using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_clear) f where f not in ('kind', 'designation', 'space')) then
    raise exception 'Only kind, designation and space can be cleared here' using errcode = 'P0001';
  end if;
  if p_space_id is not null then
    select * into v_space from spaces where id = p_space_id;
    if not found or not space_is_on_project(v_space, v_project_id) or v_space.removed_at is not null then
      raise exception 'No current space with that id on this project' using errcode = 'P0001';
    end if;
  end if;

  update parts set
    kind            = case when 'kind' = any(v_clear) then null else coalesce(v_kind, kind) end,
    designation     = case when 'designation' = any(v_clear) then null
                           else coalesce(clean_text(p_designation), designation) end,
    space_id        = case when 'space' = any(v_clear) then null else coalesce(p_space_id, space_id) end,
    safety_critical = coalesce(p_safety_critical, safety_critical),
    updated_at      = now()
  where id = p_part_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_UPDATED', 'PART', v_after.id,
    jsonb_build_object('kind', v_before.kind, 'designation', v_before.designation,
                       'space_id', v_before.space_id, 'safety_critical', v_before.safety_critical),
    jsonb_build_object('kind', v_after.kind, 'designation', v_after.designation,
                       'space_id', v_after.space_id, 'safety_critical', v_after.safety_critical,
                       'reason', clean_text(p_reason)),
    v_actor_id, v_actor_name
  );

  return json_build_object('part', row_to_json(v_after));
end;
$$;

-- Says that one part powers, protects, controls, signals or flows into another.
create or replace function public.action_connect_parts(
  p_from_part_id uuid,
  p_to_part_id uuid,
  p_kind text,
  p_label text default null,
  p_project_id uuid default null
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
  v_from parts;
  v_to parts;
  v_kind text := upper(clean_text(p_kind));
  v_conn part_connections;
begin
  perform require_permission('action_connect_parts', v_project_id);
  if v_kind is null or v_kind not in ('POWERS', 'PROTECTS', 'CONTROLS', 'SIGNALS', 'FLOWS_TO', 'CONNECTED') then
    raise exception 'Kind is POWERS, PROTECTS, CONTROLS, SIGNALS, FLOWS_TO or CONNECTED' using errcode = 'P0001';
  end if;
  select * into v_from from parts where id = p_from_part_id;
  select * into v_to from parts where id = p_to_part_id;
  if v_from.id is null or v_to.id is null
     or not part_is_on_project(v_from, v_project_id) or not part_is_on_project(v_to, v_project_id) then
    raise exception 'Both parts must be on this asset' using errcode = 'P0001';
  end if;
  if v_from.id = v_to.id then
    raise exception 'A part cannot connect to itself' using errcode = 'P0001';
  end if;
  if v_from.removed_at is not null or v_to.removed_at is not null then
    raise exception 'Connect current parts only' using errcode = 'P0001';
  end if;

  select * into v_conn from part_connections
   where from_part_id = v_from.id and to_part_id = v_to.id and kind = v_kind and removed_at is null;
  if found then
    return json_build_object('connection', row_to_json(v_conn), 'existing', true);
  end if;

  insert into part_connections (vessel_id, project_id, from_part_id, to_part_id, kind, label, created_by, created_by_name)
  values (v_from.vessel_id, v_from.project_id, v_from.id, v_to.id, v_kind, clean_text(p_label), v_actor_id, v_actor_name)
  returning * into v_conn;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_CONNECTED', 'PART', v_from.id, null,
    jsonb_build_object('from', v_from.name, 'to', v_to.name, 'kind', v_kind, 'label', v_conn.label),
    v_actor_id, v_actor_name
  );

  return json_build_object('connection', row_to_json(v_conn), 'existing', false);
end;
$$;

create or replace function public.action_disconnect_parts(
  p_connection_id uuid,
  p_reason text default null,
  p_project_id uuid default null
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
  v_conn part_connections;
  v_from parts;
begin
  perform require_permission('action_connect_parts', v_project_id);
  select * into v_conn from part_connections where id = p_connection_id;
  select * into v_from from parts where id = v_conn.from_part_id;
  if v_conn.id is null or not part_is_on_project(v_from, v_project_id) then
    raise exception 'No connection with that id on this asset' using errcode = 'P0001';
  end if;
  if v_conn.removed_at is not null then
    return json_build_object('connection', row_to_json(v_conn), 'already_removed', true);
  end if;

  update part_connections set
    removed_at = now(), removed_by_name = v_actor_name, removed_reason = clean_text(p_reason)
  where id = p_connection_id
  returning * into v_conn;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_DISCONNECTED', 'PART', v_conn.from_part_id,
    jsonb_build_object('to_part_id', v_conn.to_part_id, 'kind', v_conn.kind),
    jsonb_build_object('reason', v_conn.removed_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('connection', row_to_json(v_conn));
end;
$$;

-- Stores (or replaces) an import draft: the proposal extraction produced,
-- as edited in review. Nothing on the asset changes until it is applied.
create or replace function public.action_save_part_import(
  p_project_id uuid default null,
  p_proposal jsonb default null,
  p_document_ids uuid[] default null,
  p_import_id uuid default null
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
  v_import part_imports;
begin
  perform require_permission('action_create_part', v_project_id);
  if p_proposal is null or jsonb_typeof(p_proposal) <> 'object' then
    raise exception 'The proposal must be a JSON object' using errcode = 'P0001';
  end if;
  if octet_length(p_proposal::text) > 8 * 1024 * 1024 then
    raise exception 'The proposal is too large (over 8 MB)' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_document_ids, '{}')) d
     where not exists (select 1 from documents x where x.id = d and x.project_id = v_project_id)
  ) then
    raise exception 'Every document must belong to this project' using errcode = 'P0001';
  end if;

  if p_import_id is null then
    insert into part_imports (project_id, document_ids, proposal, created_by, created_by_name)
    values (v_project_id, coalesce(p_document_ids, '{}'), p_proposal, v_actor_id, v_actor_name)
    returning * into v_import;
  else
    update part_imports set
      proposal = p_proposal,
      document_ids = coalesce(p_document_ids, document_ids),
      updated_at = now()
    where id = p_import_id and project_id = v_project_id and status = 'DRAFT'
    returning * into v_import;
    if not found then
      raise exception 'No draft import with that id on this project' using errcode = 'P0001';
    end if;
  end if;

  return json_build_object('import', json_build_object(
    'id', v_import.id, 'status', v_import.status, 'created_at', v_import.created_at,
    'updated_at', v_import.updated_at));
end;
$$;

create or replace function public.action_discard_part_import(
  p_import_id uuid,
  p_project_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
begin
  perform require_permission('action_create_part', v_project_id);
  update part_imports set status = 'DISCARDED', decided_at = now(), decided_by_name = current_actor_name()
   where id = p_import_id and project_id = v_project_id and status = 'DRAFT';
  if not found then
    raise exception 'No draft import with that id on this project' using errcode = 'P0001';
  end if;
  return json_build_object('discarded', p_import_id);
end;
$$;

-- Applies an import draft to the asset, in one transaction.
--
-- The proposal shape (see supabase/functions/extract-parts/proposal.ts):
--   vessel?      { name, vessel_type, build_yard, year_built }
--   spaces[]     { key, name, parent_key, existing_id, include }
--   parts[]      { key, name, kind, category, parent_key, space_key, designation,
--                  manufacturer, model, serial_number, location, notes,
--                  safety_critical, existing_id, include,
--                  refs[] { document_id, page, sheet, grid, bbox, note } }
--   connections[] { from_key, to_key, kind, label, include, document_id, page }
--
-- Keys are the proposal's own; ids are created here. An existing part or space
-- (matched in review, or found by name under the same parent) is reused and
-- only its empty fields are filled -- an import never overwrites what a person
-- typed. Anything whose parent was left out lands at the top level rather than
-- being dropped.
create or replace function public.action_apply_part_import(
  p_import_id uuid,
  p_proposal jsonb default null,
  p_project_id uuid default null
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
  v_import part_imports;
  v_project projects;
  v_prop jsonb;
  v_vessel_id uuid;
  v_home_project uuid;
  v_space_ids jsonb := '{}';
  v_part_ids jsonb := '{}';
  v_included_spaces text[];
  v_included_parts text[];
  r jsonb;
  ref jsonb;
  v_progress boolean;
  v_force_top boolean := false;
  v_parent uuid;
  v_space uuid;
  v_id uuid;
  v_existing parts;
  v_existing_space spaces;
  v_name text;
  v_kind text;
  v_category discipline;
  v_bbox numeric[];
  v_page integer;
  v_from uuid;
  v_to uuid;
  v_ckind text;
  v_spaces_created integer := 0;
  v_spaces_reused integer := 0;
  v_parts_created integer := 0;
  v_parts_reused integer := 0;
  v_connections integer := 0;
  v_refs integer := 0;
  v_skipped jsonb := '[]';
  v_summary jsonb;
begin
  perform require_permission('action_create_part', v_project_id);

  select * into v_import from part_imports where id = p_import_id and project_id = v_project_id for update;
  if not found then
    raise exception 'No import with that id on this project' using errcode = 'P0001';
  end if;
  if v_import.status <> 'DRAFT' then
    raise exception 'This import was already %', lower(v_import.status) using errcode = 'P0001';
  end if;

  v_prop := coalesce(p_proposal, v_import.proposal);
  if jsonb_typeof(coalesce(v_prop->'parts', '[]')) <> 'array'
     or jsonb_typeof(coalesce(v_prop->'spaces', '[]')) <> 'array'
     or jsonb_typeof(coalesce(v_prop->'connections', '[]')) <> 'array' then
    raise exception 'The proposal is malformed' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(v_prop->'parts', '[]')) > 3000
     or jsonb_array_length(coalesce(v_prop->'spaces', '[]')) > 500
     or jsonb_array_length(coalesce(v_prop->'connections', '[]')) > 6000 then
    raise exception 'The proposal is too large to apply at once' using errcode = 'P0001';
  end if;

  -- The boat first: parts belong to her.
  select * into v_project from projects where id = v_project_id;
  if v_project.project_type <> 'PROPERTY' and v_project.vessel_id is null then
    if clean_text(v_prop->'vessel'->>'name') is null then
      raise exception 'This project has no vessel and the import does not name one' using errcode = 'P0001';
    end if;
    perform action_set_project_vessel(
      p_project_id => v_project_id,
      p_name => clean_text(v_prop->'vessel'->>'name'),
      p_vessel_type => clean_text(v_prop->'vessel'->>'vessel_type'),
      p_build_yard => clean_text(v_prop->'vessel'->>'build_yard'),
      p_year_built => case when (v_prop->'vessel'->>'year_built') ~ '^\d{4}$'
                           then (v_prop->'vessel'->>'year_built')::int end
    );
    select * into v_project from projects where id = v_project_id;
  end if;
  v_vessel_id := v_project.vessel_id;
  if v_vessel_id is null then v_home_project := v_project_id; end if;

  select coalesce(array_agg(e->>'key'), '{}') into v_included_spaces
    from jsonb_array_elements(coalesce(v_prop->'spaces', '[]')) e
   where coalesce(e->>'include', 'true') <> 'false' and clean_text(e->>'key') is not null;
  select coalesce(array_agg(e->>'key'), '{}') into v_included_parts
    from jsonb_array_elements(coalesce(v_prop->'parts', '[]')) e
   where coalesce(e->>'include', 'true') <> 'false' and clean_text(e->>'key') is not null;

  -- Spaces, parents before children.
  loop
    v_progress := false;
    for r in
      select e from jsonb_array_elements(coalesce(v_prop->'spaces', '[]')) e
       where (e->>'key') = any(v_included_spaces) and not (v_space_ids ? (e->>'key'))
    loop
      if clean_text(r->>'parent_key') is not null and (r->>'parent_key') = any(v_included_spaces) then
        if not (v_space_ids ? (r->>'parent_key')) then
          if not v_force_top then continue; end if;
          v_parent := null;
        else
          v_parent := (v_space_ids->>(r->>'parent_key'))::uuid;
        end if;
      else
        v_parent := null;
      end if;

      v_id := null;
      if clean_text(r->>'existing_id') ~ '^[0-9a-f-]{36}$' then
        select * into v_existing_space from spaces where id = (r->>'existing_id')::uuid;
        if found and space_is_on_project(v_existing_space, v_project_id) and v_existing_space.removed_at is null then
          v_id := v_existing_space.id;
        end if;
      end if;
      v_name := left(clean_text(r->>'name'), 200);
      if v_id is null and v_name is null then
        v_skipped := v_skipped || jsonb_build_object('space', r->>'key', 'why', 'no name');
        v_space_ids := v_space_ids || jsonb_build_object(r->>'key', null);
        v_progress := true;
        continue;
      end if;
      if v_id is null then
        select id into v_id from spaces
         where coalesce(vessel_id, project_id) = coalesce(v_vessel_id, v_home_project)
           and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = coalesce(v_parent, '00000000-0000-0000-0000-000000000000'::uuid)
           and lower(trim(name)) = lower(v_name)
           and removed_at is null;
      end if;
      if v_id is null then
        insert into spaces (vessel_id, project_id, parent_id, name, created_by, created_by_name)
        values (v_vessel_id, v_home_project, v_parent, v_name, v_actor_id, v_actor_name)
        returning id into v_id;
        v_spaces_created := v_spaces_created + 1;
      else
        v_spaces_reused := v_spaces_reused + 1;
      end if;
      v_space_ids := v_space_ids || jsonb_build_object(r->>'key', v_id);
      v_progress := true;
    end loop;
    exit when not exists (
      select 1 from unnest(v_included_spaces) k where not (v_space_ids ? k)
    );
    if not v_progress then
      -- A loop of parents: place what is left at the top level.
      v_force_top := true;
    end if;
  end loop;

  -- Parts, parents before children.
  v_force_top := false;
  loop
    v_progress := false;
    for r in
      select e from jsonb_array_elements(coalesce(v_prop->'parts', '[]')) e
       where (e->>'key') = any(v_included_parts) and not (v_part_ids ? (e->>'key'))
    loop
      if clean_text(r->>'parent_key') is not null and (r->>'parent_key') = any(v_included_parts) then
        if not (v_part_ids ? (r->>'parent_key')) or (v_part_ids->>(r->>'parent_key')) is null then
          if not v_force_top and not (v_part_ids ? (r->>'parent_key')) then continue; end if;
          v_parent := null;
        else
          v_parent := (v_part_ids->>(r->>'parent_key'))::uuid;
        end if;
      else
        v_parent := null;
      end if;

      v_space := case when clean_text(r->>'space_key') is not null and (v_space_ids ? (r->>'space_key'))
                      then (v_space_ids->>(r->>'space_key'))::uuid end;
      v_kind := upper(clean_text(r->>'kind'));
      if v_kind is not null and v_kind not in ('SYSTEM', 'ASSEMBLY', 'COMPONENT') then v_kind := null; end if;
      begin
        v_category := parse_discipline(r->>'category');
      exception when others then
        v_category := null;
      end;
      v_name := left(clean_text(r->>'name'), 200);

      v_id := null;
      if clean_text(r->>'existing_id') ~ '^[0-9a-f-]{36}$' then
        select * into v_existing from parts where id = (r->>'existing_id')::uuid;
        if found and part_is_on_project(v_existing, v_project_id) and v_existing.removed_at is null then
          v_id := v_existing.id;
        end if;
      end if;
      if v_id is null and v_name is null then
        v_skipped := v_skipped || jsonb_build_object('part', r->>'key', 'why', 'no name');
        v_part_ids := v_part_ids || jsonb_build_object(r->>'key', null);
        v_progress := true;
        continue;
      end if;
      if v_id is null then
        select id into v_id from parts
         where coalesce(vessel_id, project_id) = coalesce(v_vessel_id, v_home_project)
           and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = coalesce(v_parent, '00000000-0000-0000-0000-000000000000'::uuid)
           and lower(trim(name)) = lower(v_name)
           and removed_at is null;
      end if;

      if v_id is null then
        insert into parts (
          vessel_id, project_id, parent_id, name, category, kind, space_id, designation,
          location, manufacturer, model, serial_number, notes, safety_critical,
          created_by, created_by_name
        ) values (
          v_vessel_id, v_home_project, v_parent, v_name, v_category, v_kind, v_space,
          left(clean_text(r->>'designation'), 100),
          left(clean_text(r->>'location'), 500),
          left(clean_text(r->>'manufacturer'), 200),
          left(clean_text(r->>'model'), 200),
          left(clean_text(r->>'serial_number'), 200),
          left(clean_text(r->>'notes'), 2000),
          coalesce(r->>'safety_critical', 'false') = 'true',
          v_actor_id, v_actor_name
        ) returning id into v_id;
        v_parts_created := v_parts_created + 1;

        insert into world_model_events (
          project_id, event_type, object_type, object_id,
          before_state, after_state, triggered_by, triggered_by_name
        ) select v_project_id, 'PART_CREATED', 'PART', p.id, null,
                 (to_jsonb(p) - 'created_at') || jsonb_build_object('import_id', p_import_id),
                 v_actor_id, v_actor_name
            from parts p where p.id = v_id;
      else
        -- Fill what is empty; never overwrite what is there.
        update parts set
          category      = coalesce(category, v_category),
          kind          = coalesce(kind, v_kind),
          space_id      = coalesce(space_id, v_space),
          designation   = coalesce(designation, left(clean_text(r->>'designation'), 100)),
          location      = coalesce(location, left(clean_text(r->>'location'), 500)),
          manufacturer  = coalesce(manufacturer, left(clean_text(r->>'manufacturer'), 200)),
          model         = coalesce(model, left(clean_text(r->>'model'), 200)),
          serial_number = coalesce(serial_number, left(clean_text(r->>'serial_number'), 200)),
          safety_critical = safety_critical or coalesce(r->>'safety_critical', 'false') = 'true',
          updated_at    = now()
        where id = v_id;
        v_parts_reused := v_parts_reused + 1;
      end if;
      v_part_ids := v_part_ids || jsonb_build_object(r->>'key', v_id);
      v_progress := true;

      -- Where it is drawn.
      for ref in select x from jsonb_array_elements(coalesce(r->'refs', '[]')) x loop
        v_page := case when (ref->>'page') ~ '^\d{1,5}$' then (ref->>'page')::int end;
        if v_page is null or v_page < 1
           or clean_text(ref->>'document_id') is null
           or (ref->>'document_id') !~ '^[0-9a-f-]{36}$'
           or not exists (select 1 from documents d where d.id = (ref->>'document_id')::uuid and d.project_id = v_project_id) then
          continue;
        end if;
        v_bbox := null;
        if jsonb_typeof(ref->'bbox') = 'array' and jsonb_array_length(ref->'bbox') = 4 then
          select array_agg(least(greatest(x::numeric, 0), 1) order by ord) into v_bbox
            from jsonb_array_elements_text(ref->'bbox') with ordinality as t(x, ord)
           where x ~ '^-?\d+(\.\d+)?$';
          if array_length(v_bbox, 1) is distinct from 4 then v_bbox := null; end if;
        end if;
        insert into part_references (part_id, document_id, project_id, page, sheet, grid, bbox, note, created_by, created_by_name)
        values (v_id, (ref->>'document_id')::uuid, v_project_id, v_page,
                left(clean_text(ref->>'sheet'), 50), left(clean_text(ref->>'grid'), 20), v_bbox,
                left(clean_text(ref->>'note'), 500), v_actor_id, v_actor_name)
        on conflict do nothing;
        if found then v_refs := v_refs + 1; end if;
      end loop;
    end loop;
    exit when not exists (
      select 1 from unnest(v_included_parts) k where not (v_part_ids ? k)
    );
    if not v_progress then v_force_top := true; end if;
  end loop;

  -- Connections between parts that now exist.
  for r in
    select e from jsonb_array_elements(coalesce(v_prop->'connections', '[]')) e
     where coalesce(e->>'include', 'true') <> 'false'
  loop
    v_from := case when v_part_ids ? (r->>'from_key') then (v_part_ids->>(r->>'from_key'))::uuid end;
    v_to := case when v_part_ids ? (r->>'to_key') then (v_part_ids->>(r->>'to_key'))::uuid end;
    v_ckind := upper(clean_text(r->>'kind'));
    if v_ckind is null or v_ckind not in ('POWERS', 'PROTECTS', 'CONTROLS', 'SIGNALS', 'FLOWS_TO', 'CONNECTED') then
      v_ckind := 'CONNECTED';
    end if;
    if v_from is null or v_to is null or v_from = v_to then
      continue;
    end if;
    insert into part_connections (
      vessel_id, project_id, from_part_id, to_part_id, kind, label,
      source_document_id, source_page, created_by, created_by_name
    ) values (
      v_vessel_id, v_home_project, v_from, v_to, v_ckind, left(clean_text(r->>'label'), 200),
      case when (r->>'document_id') ~ '^[0-9a-f-]{36}$'
                and exists (select 1 from documents d where d.id = (r->>'document_id')::uuid and d.project_id = v_project_id)
           then (r->>'document_id')::uuid end,
      case when (r->>'page') ~ '^\d{1,5}$' then (r->>'page')::int end,
      v_actor_id, v_actor_name
    )
    on conflict do nothing;
    if found then v_connections := v_connections + 1; end if;
  end loop;

  v_summary := jsonb_build_object(
    'spaces_created', v_spaces_created, 'spaces_reused', v_spaces_reused,
    'parts_created', v_parts_created, 'parts_reused', v_parts_reused,
    'connections', v_connections, 'references', v_refs, 'skipped', v_skipped
  );

  update part_imports set
    status = 'APPLIED', proposal = v_prop, result = v_summary,
    decided_at = now(), decided_by_name = v_actor_name
  where id = p_import_id;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PARTS_IMPORTED', 'PROJECT', v_project_id, null,
    v_summary || jsonb_build_object('import_id', p_import_id, 'document_ids', to_jsonb(v_import.document_ids)),
    v_actor_id, v_actor_name
  );

  return json_build_object('import_id', p_import_id, 'result', v_summary);
end;
$$;

revoke execute on function public.action_create_space(uuid, text, uuid, text) from anon, public;
revoke execute on function public.action_set_part_details(uuid, uuid, text, text, uuid, boolean, text[], text) from anon, public;
revoke execute on function public.action_connect_parts(uuid, uuid, text, text, uuid) from anon, public;
revoke execute on function public.action_disconnect_parts(uuid, text, uuid) from anon, public;
revoke execute on function public.action_save_part_import(uuid, jsonb, uuid[], uuid) from anon, public;
revoke execute on function public.action_discard_part_import(uuid, uuid) from anon, public;
revoke execute on function public.action_apply_part_import(uuid, jsonb, uuid) from anon, public;
grant execute on function public.action_create_space(uuid, text, uuid, text) to authenticated;
grant execute on function public.action_set_part_details(uuid, uuid, text, text, uuid, boolean, text[], text) to authenticated;
grant execute on function public.action_connect_parts(uuid, uuid, text, text, uuid) to authenticated;
grant execute on function public.action_disconnect_parts(uuid, text, uuid) to authenticated;
grant execute on function public.action_save_part_import(uuid, jsonb, uuid[], uuid) to authenticated;
grant execute on function public.action_discard_part_import(uuid, uuid) to authenticated;
grant execute on function public.action_apply_part_import(uuid, jsonb, uuid) to authenticated;

-- 8. Permissions --------------------------------------------------------------------------
insert into action_permissions (action_key, role)
select k, r::user_role
  from unnest(array['action_create_space', 'action_connect_parts']) as k,
       unnest(array['OWNERS_REP', 'OWNER', 'CAPTAIN', 'YARD_PM', 'NAVAL_ARCHITECT']) as r
on conflict do nothing;

-- 9. The ontology ---------------------------------------------------------------------------
insert into ontology_object_types (key, label, table_name, description, display_order)
values (
  'SPACE', 'Space', 'spaces',
  'A place on the asset -- a compartment, cabin, locker or deck area (aft peak SB, engine room, wet cell). Spaces form their own tree beside the parts tree: a part has a function (its system) and a place (its space). Like parts, spaces belong to the vessel.',
  14
)
on conflict (key) do update set
  label = excluded.label, table_name = excluded.table_name,
  description = excluded.description, display_order = excluded.display_order;

update ontology_object_types
   set description = 'A physical piece of the asset -- a system, an assembly or a component (deck > winches > port primary) -- with its kind, the designation the drawings use for it (11.1Q21), the space it sits in, make, model and serial number. It belongs to the vessel, not the project, so its history runs across every project on the same boat. Parts connect to each other (one powers, protects, controls, signals or flows into another), and are drawn on pages of the documents that describe them.'
 where key = 'PART';

insert into ontology_links (from_type, to_type, label, cardinality, via_column) values
  ('PART', 'SPACE', 'sits in', 'MANY_TO_ONE', 'space_id'),
  ('SPACE', 'SPACE', 'is inside', 'MANY_TO_ONE', 'parent_id'),
  ('PART', 'PART', 'connects to', 'ONE_TO_MANY', 'part_connections'),
  ('PART', 'DOCUMENT', 'is drawn in', 'ONE_TO_MANY', 'part_references')
on conflict (from_type, to_type, via_column) do update set
  label = excluded.label, cardinality = excluded.cardinality;

-- 10. Registry, so the agent can place and connect parts --------------------------------------
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_create_space',
  'Record a space',
  'Adds a place on the asset -- a compartment, cabin, locker or deck area -- to the spaces tree, optionally inside another space. Returns the existing space when one of that name already sits under that parent.',
  'SPACE',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_name', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_parent_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_notes', 'type', 'text')
  ),
  '{}', true
),
(
  'action_set_part_details',
  'Set part details',
  'Sets a part''s kind (SYSTEM, ASSEMBLY or COMPONENT), the designation the drawings use for it (e.g. 11.1Q21), the space it sits in, and whether it is safety-critical (through-hull fittings, seacocks, fuel shut-offs, gas). Omitted fields keep their value; p_clear empties kind, designation or space.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_kind', 'type', 'enum', 'values', jsonb_build_array('SYSTEM', 'ASSEMBLY', 'COMPONENT')),
    jsonb_build_object('name', 'p_designation', 'type', 'text'),
    jsonb_build_object('name', 'p_space_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_safety_critical', 'type', 'boolean'),
    jsonb_build_object('name', 'p_clear', 'type', 'text[]'),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
),
(
  'action_connect_parts',
  'Connect parts',
  'Records how two parts relate: POWERS (electrical supply, source to consumer), PROTECTS (breaker or fuse to what it protects), CONTROLS (switch or panel to what it operates), SIGNALS (sensor to gauge or alarm), FLOWS_TO (water, fuel, waste: upstream to downstream) or CONNECTED. p_label carries the detail (breaker number, cable or hose size). Connecting an already connected pair is harmless.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_from_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_to_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_kind', 'type', 'enum', 'required', true,
                       'values', jsonb_build_array('POWERS', 'PROTECTS', 'CONTROLS', 'SIGNALS', 'FLOWS_TO', 'CONNECTED')),
    jsonb_build_object('name', 'p_label', 'type', 'text'),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
  ),
  '{}', true
),
(
  'action_disconnect_parts',
  'Disconnect parts',
  'Removes a connection between two parts. Kept in the record as removed, with the reason.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_connection_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text'),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
  ),
  '{}', true
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  target_type = excluded.target_type,
  parameters = excluded.parameters,
  is_agent_usable = excluded.is_agent_usable;
