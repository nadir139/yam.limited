-- Migration 044: a building in use (assets, part 2).
--
-- A boat in service has its logbook (an OPERATIONS project, migration 032):
-- the record of the boat between refits. A building needs the same thing
-- without the sea: the place its maintenance is kept (the boiler serviced
-- every year, the roof and gutters checked, the fire extinguishers every six
-- months), its parts, its money and its NCRs, between renovations.
--
-- So a building gets an OPERATIONS project too, "<name> · In use", opened
-- from its property project (or named fresh). It has no log days, crew,
-- hours of rest or Oil Record Book -- those stay the boat's -- and the app
-- shows it maintenance first. Everything it records hangs on the building
-- (vessel_id), as a boat's does, so the next renovation sees it.
--
-- The owner records services and readings on a building (there is no
-- captain), so OWNER joins the roles that may.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: in_use_1_action.

create or replace function public.action_open_in_use(p_from_project_id uuid default null, p_building_name text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_name text := nullif(trim(coalesce(p_building_name, '')), '');
  v_from projects;
  v_asset vessels;
  v_role user_role;
  v_project projects;
begin
  if v_email is null then
    raise exception 'You must be signed in' using errcode = 'P0001';
  end if;
  if (p_from_project_id is null) = (v_name is null) then
    raise exception 'Open a building''s record from its project, or name a new building' using errcode = 'P0001';
  end if;

  if p_from_project_id is not null then
    v_role := current_actor_role(p_from_project_id);
    if v_role is null then
      raise exception 'You are not a member of that project' using errcode = 'P0001';
    end if;
    if v_role not in ('OWNER', 'OWNERS_REP') then
      raise exception 'Only the owner or the owner''s representative can open a building''s record' using errcode = 'P0001';
    end if;
    select * into v_from from projects where id = p_from_project_id;
    if v_from.vessel_id is null then
      raise exception 'Record the building on this project first' using errcode = 'P0001';
    end if;
    select * into v_asset from vessels where id = v_from.vessel_id;
    if v_asset.asset_kind <> 'BUILDING' then
      raise exception 'This project''s asset is a %, not a building', lower(v_asset.asset_kind) using errcode = 'P0001';
    end if;
    if exists (select 1 from projects where vessel_id = v_asset.id and project_type = 'OPERATIONS') then
      raise exception 'This building already has its record in use. Ask its owner to invite you.' using errcode = 'P0001';
    end if;
  else
    if length(v_name) > 200 then
      raise exception 'A building''s name is at most 200 characters' using errcode = 'P0001';
    end if;
    insert into vessels (name, asset_kind) values (v_name, 'BUILDING') returning * into v_asset;
    v_role := 'OWNER';
  end if;

  insert into projects (vessel_id, name, project_type, phase)
  values (v_asset.id, v_asset.name || ' · In use', 'OPERATIONS', 'IN_SERVICE')
  returning * into v_project;

  insert into project_members (project_id, user_id, role, name, email, status, first_seen_at, last_seen_at)
  values (v_project.id, v_actor_id, v_role, coalesce(v_actor_name, v_email), v_email, 'ACTIVE', now(), now());

  if p_from_project_id is null then
    insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
    values (v_project.id, 'ASSET_CREATED', 'VESSEL', v_asset.id, null,
            jsonb_build_object('name', v_asset.name, 'asset_kind', 'BUILDING'), v_actor_id, v_actor_name);
  end if;
  insert into world_model_events (project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (v_project.id, 'PROJECT_CREATED', 'PROJECT', v_project.id, null,
          jsonb_build_object('name', v_project.name, 'project_type', v_project.project_type, 'asset', v_asset.name,
                             'asset_kind', 'BUILDING', 'opened_from', p_from_project_id),
          v_actor_id, v_actor_name);

  return json_build_object('project', row_to_json(v_project));
end;
$$;
revoke execute on function public.action_open_in_use(uuid, text) from anon, public;
grant execute on function public.action_open_in_use(uuid, text) to authenticated;

insert into action_permissions (action_key, role)
values ('action_record_service', 'OWNER'), ('action_record_reading', 'OWNER')
on conflict do nothing;
