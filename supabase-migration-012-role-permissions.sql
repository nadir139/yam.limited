-- =============================================================================
-- YAM Migration 012 — ROLES BECOME PERMISSIONS
--
-- Applied to the live project as migration `role_permissions`.
--
-- Until now "role" was a lie. The user picked one at sign-in and it was stored
-- in localStorage under `yam_role_<email>`; nothing server-side ever read it.
-- Any signed-in person could call any Action, and could change their own role
-- from the browser console. The Actions layer made the write path auditable but
-- not authorised: it recorded WHO did something, never whether they may.
--
-- This closes that. Role is resolved server-side from project_members by the
-- verified JWT email, and every Action checks it against a permission matrix
-- held as data.
--
-- ⚠️ BEHAVIOUR CHANGE: an authenticated user whose email is not in
-- project_members can now call no Action at all. Reads are unaffected.
-- =============================================================================

-- ─── Who the caller is, according to the project ─────────────────────────────

create or replace function current_actor_role()
returns user_role language sql stable security definer
set search_path = public, pg_temp
as $$
  select pm.role
    from project_members pm
   where lower(pm.email) = lower(nullif(auth.jwt() ->> 'email', ''))
   limit 1;
$$;

comment on function current_actor_role() is
  'The caller''s project role, from the verified JWT email. Null when they are not a member. Never client-supplied.';

-- ─── The matrix, as data ─────────────────────────────────────────────────────
--
-- A table rather than a CASE statement so it can be read by the /ontology page
-- and the agent, and changed without a code deploy. It is data the system can
-- describe about itself, in the same spirit as the ontology registry.

create table if not exists action_permissions (
  action_key text not null,
  role user_role not null,
  primary key (action_key, role)
);

alter table action_permissions enable row level security;

do $$ begin
  create policy "read_action_permissions" on action_permissions
    for select to authenticated, anon using (true);
exception when duplicate_object then null;
end $$;

delete from action_permissions;

insert into action_permissions (action_key, role) values
  -- Reporting a problem is never gated. A subcontractor who finds corrosion
  -- must be able to say so; a system that makes bad news hard to file gets the
  -- bad news late, which is the failure this whole product exists to prevent.
  ('action_raise_defect', 'OWNER'),
  ('action_raise_defect', 'OWNERS_REP'),
  ('action_raise_defect', 'CAPTAIN'),
  ('action_raise_defect', 'YARD_PM'),
  ('action_raise_defect', 'CLASS_SURVEYOR'),
  ('action_raise_defect', 'NAVAL_ARCHITECT'),
  ('action_raise_defect', 'SUBCONTRACTOR'),

  -- Same reasoning for evidence and for talking to each other.
  ('action_register_document', 'OWNER'),
  ('action_register_document', 'OWNERS_REP'),
  ('action_register_document', 'CAPTAIN'),
  ('action_register_document', 'YARD_PM'),
  ('action_register_document', 'CLASS_SURVEYOR'),
  ('action_register_document', 'NAVAL_ARCHITECT'),
  ('action_register_document', 'SUBCONTRACTOR'),

  -- Moving an NCR through its lifecycle is a judgement about the work, so it
  -- sits with the people accountable for the work.
  ('action_update_defect_status', 'OWNERS_REP'),
  ('action_update_defect_status', 'YARD_PM'),
  ('action_update_defect_status', 'CLASS_SURVEYOR'),
  ('action_update_defect_status', 'NAVAL_ARCHITECT'),

  -- Recording a survey result is the surveyor's job, plus yard QC and the
  -- owner's rep who attend.
  ('action_record_inspection_result', 'OWNERS_REP'),
  ('action_record_inspection_result', 'YARD_PM'),
  ('action_record_inspection_result', 'CLASS_SURVEYOR'),

  ('action_schedule_inspection', 'OWNERS_REP'),
  ('action_schedule_inspection', 'CAPTAIN'),
  ('action_schedule_inspection', 'YARD_PM'),
  ('action_schedule_inspection', 'CLASS_SURVEYOR'),

  -- Scope and money. Not the captain, not subcontractors, not class.
  ('action_create_work_package', 'OWNERS_REP'),
  ('action_create_work_package', 'YARD_PM'),
  ('action_create_work_package', 'NAVAL_ARCHITECT'),
  ('action_update_work_package', 'OWNERS_REP'),
  ('action_update_work_package', 'YARD_PM'),
  ('action_update_work_package', 'NAVAL_ARCHITECT'),
  ('action_link_defect_to_work_package', 'OWNERS_REP'),
  ('action_link_defect_to_work_package', 'YARD_PM'),
  ('action_link_defect_to_work_package', 'NAVAL_ARCHITECT'),

  -- The decision the tiers exist for. See require_approval_authority below:
  -- the owner's rep may clear Tier 1 and Tier 2, but Tier 3 is the owner's.
  ('action_decide_approval', 'OWNER'),
  ('action_decide_approval', 'OWNERS_REP'),

  -- Project-level control.
  ('action_advance_project_phase', 'OWNERS_REP');

-- ─── The check ───────────────────────────────────────────────────────────────

create or replace function can_perform(p_action_key text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from action_permissions ap
     where ap.action_key = p_action_key
       and ap.role = current_actor_role()
  );
$$;

comment on function can_perform(text) is
  'Whether the caller''s role may invoke this Action. Used by the UI to hide what it cannot do; the Action itself still enforces.';

create or replace function require_permission(p_action_key text)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_role user_role := current_actor_role();
begin
  if v_role is null then
    raise exception 'You are not a member of this project'
      using errcode = 'P0001';
  end if;
  if not can_perform(p_action_key) then
    raise exception '% is not permitted for your role (%)', p_action_key, v_role
      using errcode = 'P0001';
  end if;
end;
$$;

-- The tiers were always documented as meaning something -- "Tier 3: full owner
-- decision" -- but nothing enforced it. A rep could clear a EUR 200,000 change
-- on the owner's behalf and the record would look identical to the owner doing
-- it. Now the record can only say what happened.
create or replace function require_approval_authority(p_approval_id uuid)
returns void language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_tier approval_tier;
  v_role user_role := current_actor_role();
begin
  select tier into v_tier from owner_approvals where id = p_approval_id;
  if v_tier = 'TIER_3' and v_role is distinct from 'OWNER' then
    raise exception
      'Tier 3 approvals (over EUR 50,000) are the owner''s decision; your role is %', v_role
      using errcode = 'P0001';
  end if;
end;
$$;

-- ─── Apply the guard to every Action ─────────────────────────────────────────
--
-- The guard is one line per function. Rather than re-emitting ten function
-- bodies by hand -- where a transcription slip would silently change behaviour
-- -- each definition is read back from the catalogue and the call is inserted
-- immediately after its outer `begin`. Verified beforehand: every action_*
-- function contains exactly one occurrence of the outer marker, so the
-- insertion point is unambiguous. Re-creating the function proves it still
-- compiles.

do $$
declare
  r record;
  v_def text;
  v_guard text;
  v_marker constant text := E'\nbegin\n';
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'action\_%'
  loop
    v_def := pg_get_functiondef(r.oid);

    -- Idempotent: re-running must not stack guards.
    if position('require_permission(' in v_def) > 0 then
      continue;
    end if;

    v_guard := format(E'\nbegin\n  perform require_permission(%L);\n', r.proname);

    if r.proname = 'action_decide_approval' then
      v_guard := v_guard || E'  perform require_approval_authority(p_approval_id);\n';
    end if;

    v_def := overlay(
      v_def placing v_guard
      from position(v_marker in v_def)
      for length(v_marker)
    );

    execute v_def;
  end loop;
end $$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function
  current_actor_role(), can_perform(text),
  require_permission(text), require_approval_authority(uuid)
from public, anon;

grant execute on function current_actor_role(), can_perform(text) to authenticated;

grant select on action_permissions to authenticated, anon;
revoke insert, update, delete on action_permissions from authenticated, anon;
