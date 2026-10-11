-- Migration 039: the electronic Oil Record Book, Part I (machinery space operations).
--
-- MARPOL Annex I, regulation 17: every oil tanker of 150 GT and above and
-- every other ship of 400 GT and above keeps an Oil Record Book; smaller
-- yachts often keep one voluntarily. Part I records machinery space
-- operations under the codes of the IMO guidance (MEPC.1/Circ.736/Rev.2):
--
--   A  ballasting or cleaning of fuel oil tanks
--   B  discharge of dirty ballast or cleaning water from fuel oil tanks
--   C  collection, transfer and disposal of oil residues (sludge)
--   D  non-automatic discharge, transfer or disposal of bilge water
--   E  automatic discharge, transfer or disposal of bilge water
--   F  condition of the oil filtering equipment
--   G  accidental or other exceptional discharges of oil
--   H  bunkering of fuel or bulk lubricating oil
--   I  additional operational procedures and general remarks
--
-- Each entry carries the item numbers of those codes (e.g. C 11.1, 12.3)
-- with what was done. The electronic book follows the IMO guidelines for
-- electronic record books (MEPC.312(74)): an entry is signed by the person
-- who made it (the signed-in member, recorded with the time), the master
-- countersigns, nothing is deleted or overwritten, a wrong entry is struck
-- through with a reason and stays legible, and a correcting entry refers to
-- the one it corrects. Entries are numbered in one unbroken sequence per
-- vessel, so a missing number would show.
--
-- A code G entry (oil discharged by accident) is also written in the
-- boat's log as a SAFETY entry, because it is an incident as well as a
-- record-book line.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: oil_record_book_0_enum,
-- oil_record_book_1_table, oil_record_book_2_actions,
-- oil_record_book_3_permissions_registry.

-- 0. Object type ---------------------------------------------------------------------
alter type object_type add value if not exists 'ORB_ENTRY';

-- 1. Table -----------------------------------------------------------------------------
create table if not exists public.orb_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid not null references public.vessels(id),
  -- One unbroken sequence per vessel, assigned by the server.
  entry_no int not null,
  occurred_at timestamptz not null,
  code char(1) not null check (code in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I')),
  -- [{item: "11.1", text: "Sludge tank 3.1, capacity 1.2 m3, retained 0.8 m3"}, ...]
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text check (unit is null or unit in ('m3', 't')),
  tank text,
  part_id uuid references public.parts(id),
  position text,
  -- The entry this one corrects (the corrected one is struck through).
  corrects_id uuid references public.orb_entries(id),
  client_id uuid unique,
  -- The signature of the person who made the entry: who, as what, when.
  recorded_by uuid,
  recorded_by_name text not null,
  recorded_by_role text,
  created_at timestamptz not null default now(),
  -- The master's countersignature.
  master_signed_at timestamptz,
  master_signed_by_name text,
  -- Struck through: still legible, with who, when and why.
  struck_at timestamptz,
  struck_by_name text,
  struck_reason text,
  unique (vessel_id, entry_no),
  check ((quantity is null) = (unit is null))
);
create index if not exists orb_entries_project_idx on public.orb_entries (project_id, occurred_at);

alter table public.orb_entries enable row level security;
create policy orb_entries_read on public.orb_entries for select using (is_project_member(project_id));
revoke all on public.orb_entries from anon, authenticated;
grant select on public.orb_entries to authenticated;
do $$ begin
  alter publication supabase_realtime add table public.orb_entries;
exception when duplicate_object then null;
end $$;

-- 2. Actions -----------------------------------------------------------------------------

-- Makes an entry, signed by the caller. A repeated client id returns the first.
create or replace function public.action_add_orb_entry(
  p_project_id uuid,
  p_code text,
  p_lines jsonb,
  p_occurred_at timestamptz default null,
  p_quantity numeric default null,
  p_unit text default null,
  p_tank text default null,
  p_part_id uuid default null,
  p_position text default null,
  p_corrects_id uuid default null,
  p_client_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_line jsonb;
  v_lines jsonb := '[]';
  v_corrected orb_entries;
  v_part parts;
  v_no int;
  v_after orb_entries;
  v_log uuid;
begin
  perform require_permission('action_add_orb_entry', v_project_id);
  v_project := operations_project(v_project_id);

  if p_client_id is not null then
    select * into v_after from orb_entries where client_id = p_client_id;
    if found then
      if v_after.project_id <> v_project_id then
        raise exception 'That write id belongs to another record book' using errcode = 'P0001';
      end if;
      return json_build_object('entry', row_to_json(v_after), 'duplicate', true);
    end if;
  end if;

  if v_code not in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I') then
    raise exception 'The code is a letter from A to I' using errcode = 'P0001';
  end if;
  if v_when > now() + interval '10 minutes' then
    raise exception 'The record book records operations that have taken place' using errcode = 'P0001';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'An entry needs at least one item with what was done' using errcode = 'P0001';
  end if;
  -- Keep each item as written; refuse blank ones rather than store them.
  for v_line in select * from jsonb_array_elements(p_lines) loop
    if nullif(trim(coalesce(v_line ->> 'text', '')), '') is null then
      raise exception 'Item % has nothing written against it', coalesce(v_line ->> 'item', '?') using errcode = 'P0001';
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'item', nullif(trim(coalesce(v_line ->> 'item', '')), ''),
      'text', trim(v_line ->> 'text')));
  end loop;
  if (p_quantity is null) <> (nullif(trim(coalesce(p_unit, '')), '') is null) then
    raise exception 'A quantity needs its unit (m3 or t), and a unit its quantity' using errcode = 'P0001';
  end if;
  if p_quantity is not null and p_quantity < 0 then
    raise exception 'A quantity is zero or more' using errcode = 'P0001';
  end if;
  if p_unit is not null and lower(trim(p_unit)) not in ('m3', 't') then
    raise exception 'Quantities in the Oil Record Book are in m3 (or tonnes for bunkers)' using errcode = 'P0001';
  end if;
  if v_code = 'H' and p_quantity is null then
    raise exception 'A bunkering entry states the quantity taken' using errcode = 'P0001';
  end if;
  if p_part_id is not null then
    select * into v_part from parts where id = p_part_id;
    if not found or v_part.vessel_id is distinct from v_project.vessel_id then
      raise exception 'That tank or part is not on this boat' using errcode = 'P0001';
    end if;
  end if;
  if p_corrects_id is not null then
    select * into v_corrected from orb_entries where id = p_corrects_id and vessel_id = v_project.vessel_id;
    if not found then
      raise exception 'The entry being corrected is not in this record book' using errcode = 'P0001';
    end if;
    if v_corrected.struck_at is null then
      raise exception 'Strike out entry % first, with the reason, then record the correction', v_corrected.entry_no using errcode = 'P0001';
    end if;
  end if;

  -- The next number in the vessel's sequence, one writer at a time.
  perform pg_advisory_xact_lock(hashtextextended(v_project.vessel_id::text || ':orb', 0));
  select coalesce(max(entry_no), 0) + 1 into v_no from orb_entries where vessel_id = v_project.vessel_id;

  insert into orb_entries (
    project_id, vessel_id, entry_no, occurred_at, code, lines, quantity, unit, tank, part_id,
    position, corrects_id, client_id, recorded_by, recorded_by_name, recorded_by_role
  ) values (
    v_project_id, v_project.vessel_id, v_no, v_when, v_code, v_lines, p_quantity,
    lower(nullif(trim(coalesce(p_unit, '')), '')), nullif(trim(coalesce(p_tank, '')), ''), p_part_id,
    nullif(trim(coalesce(p_position, '')), ''), p_corrects_id, p_client_id,
    v_actor_id, v_actor_name, current_actor_role(v_project_id)::text
  ) returning * into v_after;

  -- Oil in the sea is an incident as well as a record-book line.
  if v_code = 'G' then
    v_log := log_alongside(
      v_project_id, 'SAFETY',
      'Oil Record Book entry ' || v_no || ' (code G, accidental or exceptional discharge of oil): '
        || (select string_agg(coalesce(l ->> 'item' || ' ', '') || (l ->> 'text'), '; ') from jsonb_array_elements(v_lines) l),
      v_when, p_part_id
    );
  end if;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ORB_ENTRY_MADE', 'ORB_ENTRY', v_after.id, null,
    jsonb_build_object('entry_no', v_no, 'code', v_code, 'occurred_at', v_when, 'lines', v_lines,
                       'quantity', p_quantity, 'unit', v_after.unit, 'tank', v_after.tank,
                       'corrects_entry_no', v_corrected.entry_no, 'log_entry_id', v_log),
    v_actor_id, v_actor_name
  );

  return json_build_object('entry', row_to_json(v_after), 'duplicate', false);
end;
$$;

-- Strikes an entry through. It stays legible with who, when and why; the
-- correct record is a new entry that refers to it.
create or replace function public.action_strike_orb_entry(p_project_id uuid, p_entry_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before orb_entries;
  v_after orb_entries;
begin
  perform require_permission('action_add_orb_entry', v_project_id);
  perform operations_project(v_project_id);
  select * into v_before from orb_entries where id = p_entry_id and project_id = v_project_id for update;
  if not found then
    raise exception 'No entry with that id in this record book' using errcode = 'P0001';
  end if;
  if v_before.struck_at is not null then
    raise exception 'Entry % is already struck through', v_before.entry_no using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why entry % is struck through', v_before.entry_no using errcode = 'P0001';
  end if;
  if v_before.recorded_by is distinct from v_actor_id and current_actor_role(v_project_id) <> 'CAPTAIN' then
    raise exception 'Only the person who made the entry or the master can strike it through' using errcode = 'P0001';
  end if;
  update orb_entries set struck_at = now(), struck_by_name = v_actor_name, struck_reason = v_reason
   where id = v_before.id returning * into v_after;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ORB_ENTRY_STRUCK', 'ORB_ENTRY', v_after.id,
    jsonb_build_object('entry_no', v_before.entry_no, 'code', v_before.code, 'lines', v_before.lines),
    jsonb_build_object('struck_at', v_after.struck_at, 'reason', v_reason, 'master_had_signed', v_before.master_signed_at is not null),
    v_actor_id, v_actor_name
  );
  return json_build_object('entry', row_to_json(v_after));
end;
$$;

-- The master countersigns every entry made up to a moment (a page, in the
-- paper book). Returns how many were signed.
create or replace function public.action_master_sign_orb(p_project_id uuid, p_through timestamptz default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_name text := current_actor_name();
  v_through timestamptz := coalesce(p_through, now());
  v_ids uuid[];
  v_nos int[];
begin
  perform require_permission('action_master_sign_orb', v_project_id);
  perform operations_project(v_project_id);
  if current_actor_role(v_project_id) <> 'CAPTAIN' then
    raise exception 'Only the master countersigns the Oil Record Book' using errcode = 'P0001';
  end if;
  with s as (
    update orb_entries set master_signed_at = now(), master_signed_by_name = v_actor_name
     where project_id = v_project_id and master_signed_at is null and created_at <= v_through
    returning id, entry_no
  ) select array_agg(id order by entry_no), array_agg(entry_no order by entry_no) into v_ids, v_nos from s;
  if v_ids is null then
    return json_build_object('signed', 0);
  end if;
  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'ORB_MASTER_SIGNED', 'ORB_ENTRY', v_ids[array_length(v_ids, 1)], null,
    jsonb_build_object('entry_nos', to_jsonb(v_nos), 'through', v_through),
    current_actor_id(), v_actor_name
  );
  return json_build_object('signed', array_length(v_ids, 1), 'entry_nos', to_jsonb(v_nos));
end;
$$;

revoke execute on function public.action_add_orb_entry(uuid, text, jsonb, timestamptz, numeric, text, text, uuid, text, uuid, uuid) from anon, public;
revoke execute on function public.action_strike_orb_entry(uuid, uuid, text) from anon, public;
revoke execute on function public.action_master_sign_orb(uuid, timestamptz) from anon, public;
grant execute on function public.action_add_orb_entry(uuid, text, jsonb, timestamptz, numeric, text, text, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.action_strike_orb_entry(uuid, uuid, text) to authenticated;
grant execute on function public.action_master_sign_orb(uuid, timestamptz) to authenticated;

-- 3. Permissions and registry ------------------------------------------------------------
-- The engineers (crew) and the master make entries; only the master countersigns.
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_add_orb_entry', 'CAPTAIN'), ('action_add_orb_entry', 'CREW'),
    ('action_master_sign_orb', 'CAPTAIN')
  ) as p(k, r)
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('ORB_ENTRY', 'Oil Record Book entry', 'orb_entries',
        'A line of the vessel''s Oil Record Book, Part I (MARPOL Annex I): numbered in one unbroken sequence, with its code (A-I), item numbers and what was done, signed by whoever made it and countersigned by the master. Struck through with a reason, never deleted; a correction is a new entry that refers to the struck one.', 38)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select f::object_type, t::object_type, l, c, v
  from (values
    ('ORB_ENTRY', 'ORB_ENTRY', 'corrects', 'MANY_TO_ONE', 'corrects_id'),
    ('ORB_ENTRY', 'PART', 'concerns the tank or equipment', 'MANY_TO_ONE', 'part_id')
  ) as x(f, t, l, c, v)
 where not exists (select 1 from ontology_links ol where ol.from_type::text = x.f and ol.to_type::text = x.t and ol.via_column = x.v);

-- A legal record signed by the person making it: entered in the app, not
-- by the agent on someone's behalf (is_agent_usable false). The agent reads
-- it through the registry.
insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_add_orb_entry', 'Make an Oil Record Book entry',
   'Makes a Part I entry: code A-I, item lines [{item, text}], when, quantity in m3 (or t for bunkers), tank. Signed by the caller; numbered by the server. A correction refers to the struck entry it replaces.',
   'ORB_ENTRY',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_code', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_lines', 'type', 'jsonb', 'required', true),
     jsonb_build_object('name', 'p_occurred_at', 'type', 'timestamptz'),
     jsonb_build_object('name', 'p_quantity', 'type', 'numeric'),
     jsonb_build_object('name', 'p_unit', 'type', 'text'),
     jsonb_build_object('name', 'p_tank', 'type', 'text'),
     jsonb_build_object('name', 'p_part_id', 'type', 'uuid'),
     jsonb_build_object('name', 'p_position', 'type', 'text'),
     jsonb_build_object('name', 'p_corrects_id', 'type', 'uuid')
   ), '{LOG_ENTRY}', false),
  ('action_strike_orb_entry', 'Strike through an Oil Record Book entry',
   'Strikes an entry through with the reason; it stays legible. Only its maker or the master.',
   'ORB_ENTRY',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_entry_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false),
  ('action_master_sign_orb', 'Countersign the Oil Record Book',
   'The master countersigns every entry made up to a moment.',
   'ORB_ENTRY',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_through', 'type', 'timestamptz')
   ), '{}', false)
on conflict (key) do nothing;
