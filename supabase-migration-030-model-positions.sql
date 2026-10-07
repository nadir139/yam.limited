-- Migration 030: where things are on the 3D model, as people set them.
--
-- YAManagement places spaces and parts by reading their names (src/lib/
-- vessel-model.ts). That is a starting guess. This stores the answer once
-- someone drags a space or a part to where it really is.
--
-- Positions are in the model frame, which a scan of the boat will later be
-- registered into, so they keep meaning the same place:
--   metres; x forward (stern at -LOA/2, bow at +LOA/2); y up from the
--   waterline; z to starboard.
--
--   spaces.model_box       {"x","y","z","sx","sy","sz"}  centre and size
--   parts.model_position   {"x","y","z"}                 centre
--
-- Null means "not placed by hand": the app keeps guessing from the name.

-- 1. Columns ---------------------------------------------------------------------------------
alter table public.spaces add column if not exists model_box jsonb;
alter table public.parts add column if not exists model_position jsonb;

-- 2. Shape check ------------------------------------------------------------------------------
-- Every listed key present, numeric and within half a kilometre of the
-- origin; sizes (keys starting "s") positive. Nothing else allowed.
create or replace function public.model_vector_ok(p jsonb, p_keys text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p) = 'object'
     and (select count(*) from jsonb_object_keys(p)) = cardinality(p_keys)
     and not exists (
       select 1 from unnest(p_keys) k
        where jsonb_typeof(p -> k) is distinct from 'number'
           or abs((p ->> k)::numeric) > 500
           or (k like 's%' and (p ->> k)::numeric <= 0)
     );
$$;

revoke execute on function public.model_vector_ok(jsonb, text[]) from anon, public;

-- 3. Actions ----------------------------------------------------------------------------------
-- Puts a space where it is on the model, or (p_clear) hands it back to the guess.
create or replace function public.action_place_space(
  p_space_id uuid,
  p_box jsonb default null,
  p_project_id uuid default null,
  p_clear boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_before spaces;
  v_after spaces;
  v_box jsonb;
begin
  perform require_permission('action_place_space', v_project_id);
  select * into v_before from spaces where id = p_space_id;
  if not found or not space_is_on_project(v_before, v_project_id) or v_before.removed_at is not null then
    raise exception 'No current space with that id on this project' using errcode = 'P0001';
  end if;
  if not coalesce(p_clear, false) then
    if p_box is null or not model_vector_ok(p_box, array['x', 'y', 'z', 'sx', 'sy', 'sz']) then
      raise exception 'A box is {x, y, z, sx, sy, sz} in metres, sizes above zero' using errcode = 'P0001';
    end if;
    -- Centimetres are as fine as anyone places a locker.
    select jsonb_object_agg(key, round(value::text::numeric, 2)) into v_box from jsonb_each(p_box);
  end if;

  update spaces set model_box = v_box where id = p_space_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'SPACE_PLACED', 'SPACE', v_after.id,
    jsonb_build_object('model_box', v_before.model_box),
    jsonb_build_object('model_box', v_after.model_box, 'name', v_after.name),
    current_actor_id(), current_actor_name()
  );

  return json_build_object('space', row_to_json(v_after));
end;
$$;

-- Puts a part where it is on the model, or (p_clear) hands it back to the guess.
create or replace function public.action_place_part(
  p_part_id uuid,
  p_position jsonb default null,
  p_project_id uuid default null,
  p_clear boolean default false
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
  v_position jsonb;
begin
  perform require_permission('action_place_part', v_project_id);
  select * into v_before from parts where id = p_part_id;
  if not found or not part_is_on_project(v_before, v_project_id) then
    raise exception 'No part with that id on this project' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    raise exception '"%" was removed and cannot be moved', v_before.name using errcode = 'P0001';
  end if;
  if not coalesce(p_clear, false) then
    if p_position is null or not model_vector_ok(p_position, array['x', 'y', 'z']) then
      raise exception 'A position is {x, y, z} in metres' using errcode = 'P0001';
    end if;
    select jsonb_object_agg(key, round(value::text::numeric, 2)) into v_position from jsonb_each(p_position);
  end if;

  update parts set model_position = v_position, updated_at = now()
   where id = p_part_id returning * into v_after;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'PART_PLACED', 'PART', v_after.id,
    jsonb_build_object('model_position', v_before.model_position),
    jsonb_build_object('model_position', v_after.model_position, 'name', v_after.name),
    current_actor_id(), current_actor_name()
  );

  return json_build_object('part', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_place_space(uuid, jsonb, uuid, boolean) from anon, public;
revoke execute on function public.action_place_part(uuid, jsonb, uuid, boolean) from anon, public;
grant execute on function public.action_place_space(uuid, jsonb, uuid, boolean) to authenticated;
grant execute on function public.action_place_part(uuid, jsonb, uuid, boolean) to authenticated;

-- 4. Permissions: whoever may record parts and spaces may place them --------------------------
insert into action_permissions (action_key, role)
select k, r::user_role
  from unnest(array['action_place_space', 'action_place_part']) as k,
       unnest(array['OWNERS_REP', 'OWNER', 'CAPTAIN', 'YARD_PM', 'NAVAL_ARCHITECT']) as r
on conflict do nothing;

-- 5. Registry ---------------------------------------------------------------------------------
-- Not agent-usable: the agent has no picture of the boat to place against.
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
(
  'action_place_space',
  'Place a space on the model',
  'Sets where a space sits on the 3D model of the asset, as a box in metres (centre x, y, z and size sx, sy, sz; x forward, y up from the waterline, z to starboard). p_clear hands it back to the position guessed from its name.',
  'SPACE',
  jsonb_build_array(
    jsonb_build_object('name', 'p_space_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_box', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_clear', 'type', 'boolean')
  ),
  '{}', false
),
(
  'action_place_part',
  'Place a part on the model',
  'Sets where a part sits on the 3D model of the asset, in metres (x forward, y up from the waterline, z to starboard). p_clear hands it back to the position worked out from its space, connections and name.',
  'PART',
  jsonb_build_array(
    jsonb_build_object('name', 'p_part_id', 'type', 'uuid', 'required', true),
    jsonb_build_object('name', 'p_position', 'type', 'jsonb'),
    jsonb_build_object('name', 'p_project_id', 'type', 'uuid'),
    jsonb_build_object('name', 'p_clear', 'type', 'boolean')
  ),
  '{}', false
)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, target_type = excluded.target_type,
  parameters = excluded.parameters, cascades = excluded.cascades, is_agent_usable = excluded.is_agent_usable;
