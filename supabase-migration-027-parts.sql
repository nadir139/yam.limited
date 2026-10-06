-- =============================================================================
-- YAM Migration 027 — THE BOAT HAS PARTS
--
-- Applied to the live project as `parts_object_type` (section 0), `parts`
-- (everything else), then `parts_null_safe_membership` and
-- `parts_internal_helpers_private`, both folded into this file. Postgres will not use an enum value in the
-- transaction that adds it, so section 0 must commit first. Running this file
-- with psql outside a transaction does that on its own.
--
-- Until now the model had a vessel and the work done to it, and nothing in
-- between. "The port primary winch" existed only as words in a work package
-- title, so the record could not answer the question an owner, a captain or a
-- surveyor asks most: what has ever been done to this thing?
--
-- 1. Parts. A tree of systems, assemblies and components (deck → winches →
--    port primary), with what identifies them physically: where they are,
--    who made them, model, serial number, when fitted. A part belongs to the
--    VESSEL, not to a project, so it outlives the refit that first recorded it
--    and the next project on the same boat starts with the tree already
--    there. A property project has no vessel row, so its parts belong to the
--    project until a building gets its own asset record.
--
-- 2. Part links. Work packages, NCRs, inspections, change orders and
--    documents point at the parts they concern. A link belongs to the project
--    of the object it links, so reading it needs membership of that project,
--    like the object itself. Removing a link is recorded, not deleted.
--
-- 3. Actions to create, update, remove, link and unlink, each writing its
--    event. Creating a part that already exists under the same parent returns
--    the existing one, so an agent filing a list twice does not double the
--    boat.
-- =============================================================================

-- 0. The object type (applied first, on its own) --------------------------------
alter type public.object_type add value if not exists 'PART';

-- 1. Parts ----------------------------------------------------------------------
create table if not exists public.parts (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid references public.vessels(id),
  -- Home for a property project, which has no vessel row.
  project_id uuid references public.projects(id),
  parent_id uuid references public.parts(id),
  name text not null check (length(trim(name)) between 1 and 200),
  category discipline,
  location text,
  manufacturer text,
  model text,
  serial_number text,
  installed_on date,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  updated_at timestamptz,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text,
  check (num_nonnulls(vessel_id, project_id) = 1),
  check (parent_id is null or parent_id <> id)
);

-- One live part of a given name under a given parent, per asset.
create unique index if not exists parts_live_name
  on public.parts (
    coalesce(vessel_id, project_id),
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  where removed_at is null;
create index if not exists parts_vessel_idx on public.parts (vessel_id);
create index if not exists parts_project_idx on public.parts (project_id);
create index if not exists parts_parent_idx on public.parts (parent_id);

-- Who may read a part: anyone on a project about the asset it belongs to.
create or replace function public.can_read_part(p_vessel_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_project_id is not null then is_project_member(p_project_id)
    else exists (
      select 1 from projects p
       where p.vessel_id = p_vessel_id and is_project_member(p.id)
    )
  end;
$$;
revoke execute on function public.can_read_part(uuid, uuid) from anon, public;
grant execute on function public.can_read_part(uuid, uuid) to authenticated;

-- Whether a part belongs to the asset a project is about.
create or replace function public.part_is_on_project(p_part public.parts, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- coalesce: a project with no vessel compares as NULL, and NOT NULL is
  -- not true, which would let a check written as "if not ..." pass.
  select coalesce(
    p_part.project_id = p_project_id
      or p_part.vessel_id = (select vessel_id from projects where id = p_project_id),
    false
  );
$$;
revoke execute on function public.part_is_on_project(public.parts, uuid) from anon, authenticated, public;

alter table public.parts enable row level security;
create policy parts_read on public.parts
  for select using (can_read_part(vessel_id, project_id));
revoke all on public.parts from anon, authenticated;
grant select on public.parts to authenticated;

-- 2. Part links -----------------------------------------------------------------
create table if not exists public.part_links (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts(id),
  -- The project of the linked object, not of the part.
  project_id uuid not null references public.projects(id),
  object_type text not null
    check (object_type in ('WORK_PACKAGE', 'DEFECT_RECORD', 'INSPECTION_EVENT', 'CHANGE_ORDER', 'DOCUMENT')),
  object_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text
);

create unique index if not exists part_links_live
  on public.part_links (part_id, object_type, object_id)
  where removed_at is null;
create index if not exists part_links_project_idx on public.part_links (project_id);
create index if not exists part_links_object_idx on public.part_links (object_type, object_id);

alter table public.part_links enable row level security;
create policy part_links_read on public.part_links
  for select using (is_project_member(project_id));
revoke all on public.part_links from anon, authenticated;
grant select on public.part_links to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'parts') then
    alter publication supabase_realtime add table public.parts;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and tablename = 'part_links') then
    alter publication supabase_realtime add table public.part_links;
  end if;
end $$;

-- 3. Actions --------------------------------------------------------------------

-- Text in, trimmed text or null out.
create or replace function public.clean_text(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$ select nullif(trim(coalesce(p, '')), '') $$;

create or replace function public.parse_discipline(p text)
returns discipline
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if clean_text(p) is null then
    return null;
  end if;
  return upper(trim(p))::discipline;
exception when invalid_text_representation then
  raise exception 'Unknown category: % (use one of the disciplines, e.g. HULL, MECHANICAL, ELECTRICAL, RIGGING, INTERIOR, SAFETY)', p
    using errcode = 'P0001';
end;
$$;

-- Internal helpers: called only from the Actions, which run as their owner.
revoke execute on function public.parse_discipline(text) from anon, authenticated, public;
revoke execute on function public.clean_text(text) from anon, authenticated, public;

-- Records a part of the asset. Returns the existing part when one of that name
-- already sits under the same parent.
create or replace function public.action_create_part(
  p_project_id uuid default null,
  p_name text default null,
  p_category text default null,
  p_parent_id uuid default null,
  p_location text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_number text default null,
  p_installed_on date default null,
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
  v_parent parts;
  v_existing parts;
  v_part parts;
  v_name text := clean_text(p_name);
  v_category discipline := parse_discipline(p_category);
  v_vessel_id uuid;
  v_home_project uuid;
begin
  perform require_permission('action_create_part', v_project_id);

  select * into v_project from projects where id = v_project_id;
  if v_project.project_type <> 'PROPERTY' and v_project.vessel_id is null then
    raise exception 'This project has no vessel yet. Record the boat first (action_set_project_vessel), then its parts.'
      using errcode = 'P0001';
  end if;
  if v_name is null then
    raise exception 'A part needs a name' using errcode = 'P0001';
  end if;

  if v_project.vessel_id is not null then
    v_vessel_id := v_project.vessel_id;
  else
    v_home_project := v_project_id;
  end if;

  if p_parent_id is not null then
    select * into v_parent from parts where id = p_parent_id;
    if not found or not part_is_on_project(v_parent, v_project_id) then
      raise exception 'No part with that id on this project' using errcode = 'P0001';
    end if;
    if v_parent.removed_at is not null then
      raise exception '"%" was removed; choose a current part as the parent', v_parent.name
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_existing from parts
   where coalesce(vessel_id, project_id) = coalesce(v_vessel_id, v_home_project)
     and coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and lower(trim(name)) = lower(v_name)
     and removed_at is null;
  if found then
    return json_build_object('part', row_to_json(v_existing), 'existing', true);
  end if;

  insert into parts (
    vessel_id, project_id, parent_id, name, category, location, manufacturer,
    model, serial_number, installed_on, notes, created_by, created_by_name
  ) values (
    v_vessel_id, v_home_project, p_parent_id, v_name, v_category,
    clean_text(p_location), clean_text(p_manufacturer), clean_text(p_model),
    clean_text(p_serial_number), p_installed_on, clean_text(p_notes),
    v_actor_id, v_actor_name
  ) returning * into v_part;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_CREATED', 'PART', v_part.id,
    null, to_jsonb(v_part) - 'created_at', v_actor_id, v_actor_name
  );

  return json_build_object('part', row_to_json(v_part), 'existing', false);
end;
$$;

-- Changes a part. Omitted fields keep their value; fields named in p_clear are
-- emptied ('parent' moves the part to the top level).
create or replace function public.action_update_part(
  p_part_id uuid,
  p_project_id uuid default null,
  p_name text default null,
  p_category text default null,
  p_parent_id uuid default null,
  p_location text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_serial_number text default null,
  p_installed_on date default null,
  p_notes text default null,
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
  v_parent parts;
  v_clear text[] := coalesce(p_clear, '{}');
  v_bad text;
  v_parent_id uuid;
begin
  perform require_permission('action_update_part', v_project_id);

  select * into v_before from parts where id = p_part_id;
  if not found or not part_is_on_project(v_before, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    raise exception '"%" was removed and cannot be changed', v_before.name using errcode = 'P0001';
  end if;

  select f into v_bad from unnest(v_clear) f
   where f not in ('category', 'parent', 'location', 'manufacturer', 'model',
                   'serial_number', 'installed_on', 'notes')
   limit 1;
  if v_bad is not null then
    raise exception 'Cannot clear "%" (a part always keeps its name)', v_bad using errcode = 'P0001';
  end if;

  v_parent_id := case when 'parent' = any(v_clear) then null
                      else coalesce(p_parent_id, v_before.parent_id) end;

  if p_parent_id is not null and p_parent_id is distinct from v_before.parent_id then
    select * into v_parent from parts where id = p_parent_id;
    if not found or not part_is_on_project(v_parent, v_project_id) or v_parent.removed_at is not null then
      raise exception 'No current part with that id on this project' using errcode = 'P0001';
    end if;
    -- Moving a part under itself or one of its own sub-parts would loop the tree.
    if exists (
      with recursive up as (
        select id, parent_id from parts where id = p_parent_id
        union all
        select p.id, p.parent_id from parts p join up on p.id = up.parent_id
      )
      select 1 from up where id = p_part_id
    ) then
      raise exception 'A part cannot sit inside itself or one of its own sub-parts' using errcode = 'P0001';
    end if;
  end if;

  begin
    update parts set
      name          = coalesce(clean_text(p_name), name),
      category      = case when 'category' = any(v_clear) then null
                           else coalesce(parse_discipline(p_category), category) end,
      parent_id     = v_parent_id,
      location      = case when 'location' = any(v_clear) then null
                           else coalesce(clean_text(p_location), location) end,
      manufacturer  = case when 'manufacturer' = any(v_clear) then null
                           else coalesce(clean_text(p_manufacturer), manufacturer) end,
      model         = case when 'model' = any(v_clear) then null
                           else coalesce(clean_text(p_model), model) end,
      serial_number = case when 'serial_number' = any(v_clear) then null
                           else coalesce(clean_text(p_serial_number), serial_number) end,
      installed_on  = case when 'installed_on' = any(v_clear) then null
                           else coalesce(p_installed_on, installed_on) end,
      notes         = case when 'notes' = any(v_clear) then null
                           else coalesce(clean_text(p_notes), notes) end,
      updated_at    = now()
    where id = p_part_id
    returning * into v_after;
  exception when unique_violation then
    raise exception 'A part with that name already sits there' using errcode = 'P0001';
  end;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_UPDATED', 'PART', v_after.id,
    to_jsonb(v_before) - 'created_at' - 'updated_at',
    (to_jsonb(v_after) - 'created_at' - 'updated_at')
      || jsonb_build_object('reason', clean_text(p_reason)),
    v_actor_id, v_actor_name
  );

  return json_build_object('part', row_to_json(v_after));
end;
$$;

-- Takes a part off the asset (removed, scrapped, replaced). Kept in the record
-- with its history; refused while it still has current sub-parts.
create or replace function public.action_remove_part(
  p_part_id uuid,
  p_reason text,
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
  v_before parts;
  v_after parts;
  v_children integer;
begin
  perform require_permission('action_remove_part', v_project_id);

  select * into v_before from parts where id = p_part_id;
  if not found or not part_is_on_project(v_before, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    return json_build_object('part', row_to_json(v_before), 'already_removed', true);
  end if;
  if clean_text(p_reason) is null then
    raise exception 'Say why the part is being removed; it stays in the record' using errcode = 'P0001';
  end if;

  select count(*) into v_children from parts where parent_id = p_part_id and removed_at is null;
  if v_children > 0 then
    raise exception '"%" still has % current sub-part(s). Remove or move them first.', v_before.name, v_children
      using errcode = 'P0001';
  end if;

  update parts set
    removed_at = now(), removed_by_name = v_actor_name, removed_reason = clean_text(p_reason)
  where id = p_part_id
  returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_REMOVED', 'PART', v_after.id,
    jsonb_build_object('name', v_before.name),
    jsonb_build_object('name', v_after.name, 'reason', v_after.removed_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('part', row_to_json(v_after));
end;
$$;

-- The project an object belongs to, for the types a part can be linked to.
create or replace function public.project_of_object(p_object_type text, p_object_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case p_object_type
    when 'WORK_PACKAGE'     then (select project_id from work_packages     where id = p_object_id)
    when 'DEFECT_RECORD'    then (select project_id from defect_records    where id = p_object_id)
    when 'INSPECTION_EVENT' then (select project_id from inspection_events where id = p_object_id)
    when 'CHANGE_ORDER'     then (select project_id from change_orders     where id = p_object_id)
    when 'DOCUMENT'         then (select project_id from documents         where id = p_object_id)
  end;
$$;
revoke execute on function public.project_of_object(text, uuid) from anon, authenticated, public;

-- Says that a work package, NCR, inspection, change order or document concerns
-- a part. Linking an already linked pair returns the existing link.
create or replace function public.action_link_part(
  p_part_id uuid,
  p_object_type text,
  p_object_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_type text := upper(clean_text(p_object_type));
  v_project_id uuid;
  v_part parts;
  v_link part_links;
begin
  if v_type not in ('WORK_PACKAGE', 'DEFECT_RECORD', 'INSPECTION_EVENT', 'CHANGE_ORDER', 'DOCUMENT') then
    raise exception 'A part can be linked to a WORK_PACKAGE, DEFECT_RECORD, INSPECTION_EVENT, CHANGE_ORDER or DOCUMENT, not %', p_object_type
      using errcode = 'P0001';
  end if;
  v_project_id := project_of_object(v_type, p_object_id);
  if v_project_id is null then
    raise exception 'No % with that id', lower(replace(v_type, '_', ' ')) using errcode = 'P0001';
  end if;
  perform require_permission('action_link_part', v_project_id);

  select * into v_part from parts where id = p_part_id;
  if not found or not part_is_on_project(v_part, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_part.removed_at is not null then
    raise exception '"%" was removed; link a current part', v_part.name using errcode = 'P0001';
  end if;

  select * into v_link from part_links
   where part_id = p_part_id and object_type = v_type and object_id = p_object_id
     and removed_at is null;
  if found then
    return json_build_object('link', row_to_json(v_link), 'existing', true);
  end if;

  insert into part_links (part_id, project_id, object_type, object_id, created_by, created_by_name)
  values (p_part_id, v_project_id, v_type, p_object_id, v_actor_id, v_actor_name)
  returning * into v_link;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_LINKED', 'PART', p_part_id,
    null,
    jsonb_build_object('part', v_part.name, 'object_type', v_type, 'object_id', p_object_id),
    v_actor_id, v_actor_name
  );

  return json_build_object('link', row_to_json(v_link), 'existing', false);
end;
$$;

create or replace function public.action_unlink_part(
  p_part_id uuid,
  p_object_type text,
  p_object_id uuid,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_type text := upper(clean_text(p_object_type));
  v_project_id uuid := project_of_object(upper(clean_text(p_object_type)), p_object_id);
  v_link part_links;
begin
  if v_project_id is null then
    raise exception 'No % with that id', lower(replace(coalesce(v_type, 'object'), '_', ' ')) using errcode = 'P0001';
  end if;
  perform require_permission('action_unlink_part', v_project_id);

  update part_links set
    removed_at = now(), removed_by_name = v_actor_name, removed_reason = clean_text(p_reason)
  where part_id = p_part_id and object_type = v_type and object_id = p_object_id
    and removed_at is null
  returning * into v_link;
  if not found then
    raise exception 'That part is not linked to that %', lower(replace(v_type, '_', ' ')) using errcode = 'P0001';
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_UNLINKED', 'PART', p_part_id,
    jsonb_build_object('object_type', v_type, 'object_id', p_object_id),
    jsonb_build_object('reason', v_link.removed_reason),
    v_actor_id, v_actor_name
  );

  return json_build_object('link', row_to_json(v_link));
end;
$$;

revoke execute on function public.action_create_part(uuid, text, text, uuid, text, text, text, text, date, text) from anon, public;
revoke execute on function public.action_update_part(uuid, uuid, text, text, uuid, text, text, text, text, date, text, text[], text) from anon, public;
revoke execute on function public.action_remove_part(uuid, text, uuid) from anon, public;
revoke execute on function public.action_link_part(uuid, text, uuid) from anon, public;
revoke execute on function public.action_unlink_part(uuid, text, uuid, text) from anon, public;
grant execute on function public.action_create_part(uuid, text, text, uuid, text, text, text, text, date, text) to authenticated;
grant execute on function public.action_update_part(uuid, uuid, text, text, uuid, text, text, text, text, date, text, text[], text) to authenticated;
grant execute on function public.action_remove_part(uuid, text, uuid) to authenticated;
grant execute on function public.action_link_part(uuid, text, uuid) to authenticated;
grant execute on function public.action_unlink_part(uuid, text, uuid, text) to authenticated;

-- 4. Permissions ------------------------------------------------------------------
-- The people who know the boat record its parts; a surveyor may also say which
-- part a finding or an inspection concerns.
insert into action_permissions (action_key, role)
select k, r::user_role
  from unnest(array['action_create_part', 'action_update_part', 'action_remove_part',
                     'action_link_part', 'action_unlink_part']) as k,
       unnest(array['OWNERS_REP', 'OWNER', 'CAPTAIN', 'YARD_PM', 'NAVAL_ARCHITECT']) as r
on conflict do nothing;
insert into action_permissions (action_key, role)
values ('action_link_part', 'CLASS_SURVEYOR'), ('action_unlink_part', 'CLASS_SURVEYOR')
on conflict do nothing;

-- 5. The ontology -------------------------------------------------------------------
insert into ontology_object_types (key, label, table_name, description, display_order)
values (
  'PART', 'Part', 'parts',
  'A physical piece of the asset -- a system, an assembly or a component (deck > winches > port primary) -- with where it is, who made it and its serial number. It belongs to the vessel, not the project, so its history runs across every project on the same boat. Work packages, NCRs, inspections, change orders and documents link to the parts they concern.',
  13
)
on conflict (key) do update set
  label = excluded.label, table_name = excluded.table_name,
  description = excluded.description, display_order = excluded.display_order;

insert into ontology_links (from_type, to_type, label, cardinality, via_column) values
  ('PART', 'PART', 'is part of', 'MANY_TO_ONE', 'parent_id'),
  ('PART', 'VESSEL', 'is fitted to', 'MANY_TO_ONE', 'vessel_id'),
  ('WORK_PACKAGE', 'PART', 'works on', 'ONE_TO_MANY', 'part_links'),
  ('DEFECT_RECORD', 'PART', 'is found on', 'ONE_TO_MANY', 'part_links'),
  ('INSPECTION_EVENT', 'PART', 'inspects', 'ONE_TO_MANY', 'part_links'),
  ('CHANGE_ORDER', 'PART', 'changes', 'ONE_TO_MANY', 'part_links'),
  ('DOCUMENT', 'PART', 'describes', 'ONE_TO_MANY', 'part_links')
on conflict (from_type, to_type, via_column) do update set
  label = excluded.label, cardinality = excluded.cardinality;

-- 6. Registry, so the agent can build the tree as well as read it --------------------
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_create_part',
  'Record a part',
  'Adds a system, assembly or component to the asset''s parts tree. Give p_parent_id to place it under another part (create the parent first). If a part of the same name already sits under that parent, the existing one is returned with existing=true, so it is safe to call for every item in a list. p_category is a discipline (HULL, MECHANICAL, ELECTRICAL, RIGGING, INTERIOR, SAFETY, ...). Parts belong to the vessel, so they carry over to later projects on the same boat. Requires the vessel to be recorded first on a boat project.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_name', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_category', 'type', 'enum',
                       'values', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                                    from pg_enum e where e.enumtypid = 'discipline'::regtype)),
    jsonb_build_object('name', 'p_parent_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_location', 'type', 'text'),
    jsonb_build_object('name', 'p_manufacturer', 'type', 'text'),
    jsonb_build_object('name', 'p_model', 'type', 'text'),
    jsonb_build_object('name', 'p_serial_number', 'type', 'text'),
    jsonb_build_object('name', 'p_installed_on', 'type', 'date'),
    jsonb_build_object('name', 'p_notes', 'type', 'text')
  ),
  '{}', true
),
(
  'action_update_part',
  'Update a part',
  'Changes a part''s details or moves it under another parent. Omitted fields keep their value. To empty a field, name it in p_clear (category, parent, location, manufacturer, model, serial_number, installed_on, notes); clearing parent moves the part to the top level.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_name', 'type', 'text'),
    jsonb_build_object('name', 'p_category', 'type', 'enum',
                       'values', (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                                    from pg_enum e where e.enumtypid = 'discipline'::regtype)),
    jsonb_build_object('name', 'p_parent_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_location', 'type', 'text'),
    jsonb_build_object('name', 'p_manufacturer', 'type', 'text'),
    jsonb_build_object('name', 'p_model', 'type', 'text'),
    jsonb_build_object('name', 'p_serial_number', 'type', 'text'),
    jsonb_build_object('name', 'p_installed_on', 'type', 'date'),
    jsonb_build_object('name', 'p_notes', 'type', 'text'),
    jsonb_build_object('name', 'p_clear', 'type', 'text[]'),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
),
(
  'action_remove_part',
  'Remove a part',
  'Takes a part off the asset (removed, scrapped or replaced). It stays in the record with its history and the reason. Refused while it still has current sub-parts. When a part is replaced, remove the old one and record the new one.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
  ),
  '{}', true
),
(
  'action_link_part',
  'Link a part',
  'Records that a work package, NCR (DEFECT_RECORD), inspection, change order or document concerns a part. Link every record that names a physical thing to that part, creating the part first if it does not exist. Linking an already linked pair is harmless.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_object_type', 'type', 'enum', 'required', true,
                       'values', jsonb_build_array('WORK_PACKAGE', 'DEFECT_RECORD', 'INSPECTION_EVENT', 'CHANGE_ORDER', 'DOCUMENT')),
    jsonb_build_object('name', 'p_object_id', 'type', 'uuid', 'required', true)
  ),
  '{}', true
),
(
  'action_unlink_part',
  'Unlink a part',
  'Removes a link between a part and a record. The link is kept in the record as removed, with the reason.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_object_type', 'type', 'enum', 'required', true,
                       'values', jsonb_build_array('WORK_PACKAGE', 'DEFECT_RECORD', 'INSPECTION_EVENT', 'CHANGE_ORDER', 'DOCUMENT')),
    jsonb_build_object('name', 'p_object_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_reason', 'type', 'text')
  ),
  '{}', true
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  target_type = excluded.target_type,
  parameters = excluded.parameters,
  is_agent_usable = excluded.is_agent_usable;
