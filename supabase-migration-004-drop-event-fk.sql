-- =============================================================================
-- YAM Migration 004 — Drop FK on world_model_events.triggered_by
--
-- triggered_by references auth.users but seed events use synthetic user UUIDs
-- and system events use the nil UUID. Drop the FK — the column stays as UUID.
-- =============================================================================

ALTER TABLE world_model_events
  DROP CONSTRAINT IF EXISTS world_model_events_triggered_by_fkey;
