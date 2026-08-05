-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — MIGRATION 004: DROP world_model_events.triggered_by FK
-- Allows system-generated events and synthetic user IDs in seed data.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE world_model_events DROP CONSTRAINT IF EXISTS world_model_events_triggered_by_fkey;
