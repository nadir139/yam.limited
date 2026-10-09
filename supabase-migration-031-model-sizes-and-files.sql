-- Migration 031: things on the 3D model at their real size, and the boat's own 3D file.
--
-- Until now a part was a dot of the same size whatever it was, so an engine
-- and a breaker looked alike and neither matched the hull. Parts now carry a
-- size, and a project can load the real model of its boat (GLB, STL or OBJ)
-- in place of the hull drawn from LOA, beam and draft.
--
-- Same model frame as migration 030: metres; x forward (stern at -LOA/2, bow
-- at +LOA/2); y up from the waterline; z to starboard.
--
--   parts.model_size         {"sx","sy","sz"}   length (x), height (y), width (z);
--                            set by action_size_part
--   vessels.model_file       {"path","name","format","bytes"}  the file in Storage
--   vessels.model_transform  {"scale","rx","ry","rz","x","y","z"}
--                            how the file sits in the model frame: uniform
--                            scale to metres, rotation in degrees, then offset
--
-- Null size means "not measured": the app shows a typical size for what the
-- name says it is. Null transform means "not aligned yet": the app fits the
-- file to the recorded LOA and draft.
--
-- The file lives in project-documents under <project_id>/VESSEL_MODEL/, so the
-- member-only read and upload policies of migration 023 already cover it.
-- Replacing it uploads a new file; the old one stays, like every document.

-- 1. Columns ---------------------------------------------------------------------------------
alter table public.parts add column if not exists model_size jsonb;
alter table public.vessels add column if not exists model_file jsonb;
alter table public.vessels add column if not exists model_transform jsonb;

-- 2. Storage accepts 3D files ------------------------------------------------------------------
-- The app uploads with these content types; browsers often give .glb and .stl none at all.
update storage.buckets
   set allowed_mime_types = (
     select array_agg(distinct m)
       from unnest(coalesce(allowed_mime_types, '{}') || array['model/gltf-binary', 'model/stl', 'model/obj']) m
   )
 where id = 'project-documents';

-- 3. A part's size -----------------------------------------------------------------------------
-- Its own action rather than a new argument on action_place_part: a second
-- overload would make named-argument calls from PostgREST ambiguous, and
-- where a thing is and how big it is are separate facts. p_size null hands it
-- back to the typical size for what it is.
create or replace function public.action_size_part(
  p_part_id uuid,
  p_size jsonb default null,
  p_project_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_before parts;
  v_after parts;
  v_size jsonb;
begin
  perform require_permission('action_size_part', v_project_id);
  select * into v_before from parts where id = p_part_id;
  if not found or not part_is_on_project(v_before, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    raise exception '"%" was removed and cannot be resized', v_before.name using errcode = 'P0001';
  end if;
  if p_size is not null then
    if not model_vector_ok(p_size, array['sx', 'sy', 'sz']) then
      raise exception 'A size is {sx, sy, sz} in metres, each above zero' using errcode = 'P0001';
    end if;
    -- Millimetres, and never below 5 mm: a fuse holder is a couple of centimetres across.
    select jsonb_object_agg(key, greatest(round(value::text::numeric, 3), 0.005)) into v_size from jsonb_each(p_size);
  end if;

  update parts set model_size = v_size, updated_at = now()
   where id = p_part_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_SIZED', 'PART', v_after.id,
    jsonb_build_object('model_size', v_before.model_size),
    jsonb_build_object('model_size', v_after.model_size, 'name', v_after.name),
    current_actor_id(), current_actor_name()
  );

  return json_build_object('part', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_size_part(uuid, jsonb, uuid) from anon, public;
grant execute on function public.action_size_part(uuid, jsonb, uuid) to authenticated;

-- 4. The boat's own 3D file --------------------------------------------------------------------
-- Records an uploaded file as the boat's model, re-aligns it (p_transform
-- alone), or (p_clear) goes back to the drawn hull. The file must already be
-- in Storage under this project's VESSEL_MODEL folder.
create or replace function public.action_set_vessel_model(
  p_project_id uuid default null,
  p_path text default null,
  p_name text default null,
  p_format text default null,
  p_bytes bigint default null,
  p_transform jsonb default null,
  p_clear boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_before vessels;
  v_after vessels;
  v_file jsonb;
  v_transform jsonb;
  v_format text := lower(trim(coalesce(p_format, '')));
begin
  perform require_permission('action_set_vessel_model', v_project_id);
  select * into v_project from projects where id = v_project_id;
  if v_project.vessel_id is null then
    raise exception 'Record the vessel first: a model belongs to a boat' using errcode = 'P0001';
  end if;
  select * into v_before from vessels where id = v_project.vessel_id;

  if coalesce(p_clear, false) then
    v_file := null;
    v_transform := null;
  else
    if p_path is null and p_transform is null then
      raise exception 'Give a file, an alignment, or both' using errcode = 'P0001';
    end if;
    v_file := v_before.model_file;
    v_transform := v_before.model_transform;
    if p_path is not null then
      if p_path not like v_project_id::text || '/VESSEL_MODEL/%' or p_path like '%..%' then
        raise exception 'The model must be uploaded to this project''s VESSEL_MODEL folder' using errcode = 'P0001';
      end if;
      if v_format not in ('glb', 'stl', 'obj') then
        raise exception 'A model is a GLB, STL or OBJ file' using errcode = 'P0001';
      end if;
      if not exists (select 1 from storage.objects where bucket_id = 'project-documents' and name = p_path) then
        raise exception 'No uploaded file at %', p_path using errcode = 'P0001';
      end if;
      v_file := jsonb_build_object(
        'path', p_path,
        'name', left(coalesce(nullif(trim(p_name), ''), regexp_replace(p_path, '^.*/', '')), 200),
        'format', v_format,
        'bytes', p_bytes
      );
      -- A new file starts unaligned unless told how it sits.
      v_transform := null;
    end if;
    if p_transform is not null then
      if v_file is null then
        raise exception 'Upload a model before aligning it' using errcode = 'P0001';
      end if;
      -- Scale is not rounded: a file in millimetres scales by 0.001.
      if not model_vector_ok(p_transform, array['scale', 'rx', 'ry', 'rz', 'x', 'y', 'z']) then
        raise exception 'An alignment is {scale, rx, ry, rz, x, y, z}: scale above zero, degrees, metres'
          using errcode = 'P0001';
      end if;
      v_transform := p_transform;
    end if;
  end if;

  update vessels set model_file = v_file, model_transform = v_transform
   where id = v_before.id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'VESSEL_MODEL_SET', 'VESSEL', v_after.id,
    jsonb_build_object('model_file', v_before.model_file, 'model_transform', v_before.model_transform),
    jsonb_build_object('model_file', v_after.model_file, 'model_transform', v_after.model_transform),
    current_actor_id(), current_actor_name()
  );

  return json_build_object('vessel', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_set_vessel_model(uuid, text, text, text, bigint, jsonb, boolean) from anon, public;
grant execute on function public.action_set_vessel_model(uuid, text, text, text, bigint, jsonb, boolean) to authenticated;

-- 5. Permissions: the roles that place things on the model (migration 030) -------------------
insert into action_permissions (action_key, role)
select k, r::user_role
  from unnest(array['action_size_part', 'action_set_vessel_model']) as k,
       unnest(array['OWNERS_REP', 'OWNER', 'CAPTAIN', 'YARD_PM', 'NAVAL_ARCHITECT']) as r
on conflict do nothing;

-- 6. Registry ---------------------------------------------------------------------------------
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_size_part',
  'Give a part its size',
  'Sets how big a part is on the 3D model, in metres: sx along the boat, sy high, sz across. Null hands it back to the typical size for what its name says it is. Permitted to whoever may place parts.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_size', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid')
  ),
  '{}', false
),
(
  'action_set_vessel_model',
  'Load the boat''s 3D model',
  'Records an uploaded GLB, STL or OBJ file as the 3D model of the vessel, sets how it is aligned to the model frame (uniform scale to metres, rotation in degrees, offset in metres), or with p_clear goes back to the hull drawn from LOA, beam and draft.',
  'VESSEL',
  jsonb_build_array(
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_path', 'type', 'text'),
    jsonb_build_object('name', 'p_name', 'type', 'text'),
    jsonb_build_object('name', 'p_format', 'type', 'text'),
    jsonb_build_object('name', 'p_bytes', 'type', 'bigint'),
    jsonb_build_object('name', 'p_transform', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_clear', 'type', 'boolean')
  ),
  '{}', false
)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, target_type = excluded.target_type,
  parameters = excluded.parameters, cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;
