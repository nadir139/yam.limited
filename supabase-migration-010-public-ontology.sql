-- =============================================================================
-- YAM Migration 010 — PUBLIC ONTOLOGY REGISTRY
-- Applied to the live project as migration `public_ontology_registry`.
--
-- Migration 009 restricted the registry to `authenticated`. That was the right
-- default, but it means the public /ontology page cannot read the object model
-- it exists to describe — leaving it to hardcode a copy that silently goes
-- stale. It already had: the page described entity types that were never built.
--
-- The registry is metadata about the *shape* of the system, not data about any
-- vessel or project. Every word of it was already published in prose on a page
-- with no login. Serving it to `anon` publishes nothing new; it just makes the
-- published version the true one.
--
-- What is NOT opened here: vessels, projects, defect_records and every other
-- domain table stay `authenticated`-only. The public page renders the schema,
-- never the contents.
-- =============================================================================

create policy "read_ontology_public" on ontology_object_types
  for select to anon using (true);

create policy "read_ontology_public" on ontology_links
  for select to anon using (true);

-- Actions are readable but this says nothing about who may call them. The
-- EXECUTE grants from migration 008 are unchanged, and each function still
-- checks auth.uid(). An anonymous reader learns that action_raise_defect exists
-- and cannot invoke it.
create policy "read_ontology_public" on ontology_actions
  for select to anon using (true);

-- PostgREST needs the table-level SELECT grant as well as the RLS policy.
grant select on ontology_object_types to anon;
grant select on ontology_links        to anon;
grant select on ontology_actions      to anon;

-- ---------------------------------------------------------------------------
-- Closing a gap left by migration 008.
--
-- 008 revoked write grants from every table that existed at the time. The
-- registry tables were created afterwards, in 009, so they picked up Supabase's
-- default `grant all` to anon and authenticated and were never included in the
-- lockdown.
--
-- Nothing was exploitable: RLS is enabled on all three and 009 created only
-- SELECT policies, so a write was refused at the policy check regardless of the
-- grant. But the grant being there means the tables were one permissive policy
-- away from being editable by any holder of the anon key — and this is the
-- registry the agent builds its tool manifest from. Bring them in line with the
-- posture 008 set for everything else: no write grant at all, so the guarantee
-- does not depend on a policy staying absent.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on ontology_object_types from anon, authenticated;
revoke insert, update, delete on ontology_links        from anon, authenticated;
revoke insert, update, delete on ontology_actions      from anon, authenticated;
