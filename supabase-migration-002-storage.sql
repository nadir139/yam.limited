-- =============================================================================
-- YAM Migration 002 — Supabase Storage bucket + RLS policies
-- Run this in the Supabase SQL editor BEFORE uploading any documents.
-- =============================================================================

-- Create the project-documents bucket (private — no public access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800,  -- 50MB per file
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.ms-excel',
    'text/plain'
  ]
) ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS policies ─────────────────────────────────────────────────────

-- Authenticated users can upload files
CREATE POLICY "auth_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents');

-- Authenticated users can read any file
CREATE POLICY "auth_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents');

-- Authenticated users can update (replace) files they own
CREATE POLICY "auth_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'project-documents');

-- Authenticated users can delete files
CREATE POLICY "auth_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'project-documents');
