-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — MIGRATION 002: SUPABASE STORAGE
-- Run in the Supabase SQL editor after schema + migration-001.
-- Creates the project-documents bucket with RLS policies.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-documents');

CREATE POLICY "auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'project-documents');

CREATE POLICY "auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-documents');
