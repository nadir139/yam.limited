-- =============================================================================
-- YAM Migration 023 — A PROJECT'S FILES BELONG TO ITS MEMBERS
--
-- NOT YET APPLIED. storage.objects is owned by supabase_storage_admin, and
-- `postgres` -- the role both the SQL editor and the MCP connect as -- gets
-- "must be owner of table objects". Apply it in the dashboard instead:
-- Storage → Policies → project-documents, edit each of the four policies and
-- paste the USING / WITH CHECK expression below (update and delete: `false`).
--
-- The four policies on storage.objects (migration 002) checked only the
-- bucket. Any authenticated account could list, download, overwrite and delete
-- every file in project-documents, whichever project it was filed under -- and
-- anyone with an email address can become an authenticated account through
-- the magic-link form. Every table in the world model is membership-scoped and
-- nothing in it can be deleted; its evidence could be.
--
-- Uploads are written to `<project_id>/<object type>/<file>`, so the first
-- folder says which project a file belongs to:
--
--   * read and upload require membership of that project;
--   * nothing may be updated or deleted. The app never does either (it uploads
--     with upsert: false), and a document is evidence: the same rule as
--     migration 013's "nothing can be deleted".
--
-- Signed URLs already issued keep working; they are checked by signature, not
-- by these policies.
-- =============================================================================

-- Altered in place rather than dropped and recreated, so there is no moment
-- at which the bucket has no policy at all.

alter policy auth_select on storage.objects
  using (
    bucket_id = 'project-documents'
    -- CASE, not AND: Postgres may evaluate AND operands in any order, and the
    -- cast must never see a folder name that is not a UUID.
    and case
          when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.is_project_member(((storage.foldername(name))[1])::uuid)
          else false
        end
  );
alter policy auth_select on storage.objects rename to project_documents_member_read;

alter policy auth_upload on storage.objects
  with check (
    bucket_id = 'project-documents'
    -- CASE, not AND: Postgres may evaluate AND operands in any order, and the
    -- cast must never see a folder name that is not a UUID.
    and case
          when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.is_project_member(((storage.foldername(name))[1])::uuid)
          else false
        end
  );
alter policy auth_upload on storage.objects rename to project_documents_member_upload;

-- Kept as policies that match nothing, rather than dropped: the absence of a
-- policy and a policy saying "never" deny the same, but only one of them says
-- it was decided.
alter policy auth_update on storage.objects using (false);
alter policy auth_update on storage.objects rename to project_documents_never_update;
alter policy auth_delete on storage.objects using (false);
alter policy auth_delete on storage.objects rename to project_documents_never_delete;
