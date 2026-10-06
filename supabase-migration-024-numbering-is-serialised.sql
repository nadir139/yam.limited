-- =============================================================================
-- YAM Migration 024 — TWO RECORDS CANNOT GET THE SAME NUMBER
--
-- Applied to the live project as `numbering_is_serialised`.
--
-- Every numbered object (WP-RIG-004, NCR-2026-001, CO-, APPR-, INSP-, DOC-)
-- takes its number from `max(existing) + 1` and then inserts it. Two calls
-- running at the same moment read the same max and both try the same number;
-- the unique key rejects the second. It happened the first time the agent
-- filed a job list in parallel: six of fourteen calls failed with
-- `duplicate key value violates unique constraint
-- "work_packages_project_id_wp_number_key"` and only went in on retry.
--
-- Fix: before reading the max, each Action takes a transaction-scoped
-- advisory lock for its project, so numbering within a project is one at a
-- time and the lock is released when the transaction commits. Different
-- projects never wait on each other.
--
-- Done by rewriting each function's own definition, inserting one line before
-- every `select coalesce(max(` — so nothing else in their bodies changes. Safe
-- to re-run: a function that already takes the lock is left alone.
-- =============================================================================

do $$
declare
  fn text;
  def text;
  lock_line constant text :=
    'perform pg_advisory_xact_lock(hashtextextended(v_project_id::text || '':numbering'', 0));' || chr(10) || '  ';
begin
  foreach fn in array array[
    'action_create_work_package',
    'action_raise_defect',
    'action_register_document',
    'action_schedule_inspection'
  ] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = fn;

    if def is null then
      raise exception 'Function % not found', fn;
    end if;
    if position(':numbering' in def) > 0 then
      continue;  -- already patched
    end if;

    def := replace(def, 'select coalesce(max(', lock_line || 'select coalesce(max(');
    execute def;
  end loop;
end $$;
