-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — MIGRATION 003: DROP project_members.user_id FK
-- Allows synthetic team members (no real Supabase auth account) in seed data.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_id_fkey;
