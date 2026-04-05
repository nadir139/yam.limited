-- =============================================================================
-- YAM Migration 003 — Drop FK constraint on project_members.user_id
--
-- project_members.user_id references auth.users, which prevents inserting
-- synthetic team members (who are not real Supabase auth accounts).
-- We keep user_id as a UUID for future use, but remove the hard FK so
-- seed data and manually-added stakeholders can use any UUID.
-- When a stakeholder actually logs in, their real auth.users UUID can be
-- matched against their email.
-- =============================================================================

ALTER TABLE project_members
  DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
