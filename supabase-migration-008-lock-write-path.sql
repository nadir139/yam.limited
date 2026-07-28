-- =============================================================================
-- YAM Migration 008 — THE WRITE GUARD
-- Applied to the live project as migration `lock_write_path_to_actions`.
--
-- Before this migration `authenticated` held 33 direct INSERT/UPDATE/DELETE
-- grants across the public schema, so any signed-in user could mutate any row
-- straight from the browser -- skipping cascade rules and skipping the event
-- log entirely. Provenance written by the client is not provenance: the actor
-- was whatever the client claimed, and the log could simply be omitted.
--
-- Removing those grants makes the SECURITY DEFINER Actions the only way to
-- change anything. Cascade rules and the audit trail stop being conventions
-- the client is trusted to follow, and become properties of the database.
--
-- SELECT is deliberately retained: reads still flow directly through PostgREST,
-- governed by the existing RLS policies.
--
-- NOTE: this is scoped to tables that exist today. A future table will arrive
-- with Supabase's default grants and must be revoked explicitly, or it silently
-- reopens a direct write path.
-- =============================================================================

revoke insert, update, delete on all tables in schema public from authenticated;
revoke insert, update, delete on all tables in schema public from anon;

-- Actions are the sanctioned entry points. Postgres grants EXECUTE to PUBLIC by
-- default, so revoke that first -- otherwise anon keeps execute rights via the
-- implicit grant and the guard is decorative.
revoke execute on function
  action_raise_defect(text, text, text, text, text, text, boolean, text, numeric, int, uuid, uuid),
  action_update_defect_status(uuid, text, date),
  action_record_inspection_result(uuid, text, text, date),
  action_decide_approval(uuid, text, text),
  action_advance_project_phase(),
  action_register_document(text, text, text, int, text, text, uuid, boolean)
from public, anon;

grant execute on function
  action_raise_defect(text, text, text, text, text, text, boolean, text, numeric, int, uuid, uuid),
  action_update_defect_status(uuid, text, date),
  action_record_inspection_result(uuid, text, text, date),
  action_decide_approval(uuid, text, text),
  action_advance_project_phase(),
  action_register_document(text, text, text, int, text, text, uuid, boolean)
to authenticated;
