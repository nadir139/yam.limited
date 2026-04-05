-- ─── Supabase Storage: project-documents bucket ───────────────────────────────
-- Run this in the Supabase SQL editor AFTER the main schema and permissions migrations.

-- 1. Create the storage bucket (public = false, authenticated access only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  52428800,  -- 50 MB limit per file
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for storage objects
-- Allow authenticated users to upload to the project-documents bucket
CREATE POLICY "auth_upload_project_docs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents');

-- Allow authenticated users to read all files in the bucket
CREATE POLICY "auth_read_project_docs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents');

-- Allow authenticated users to update (overwrite) files
CREATE POLICY "auth_update_project_docs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'project-documents');

-- Allow authenticated users to delete files
CREATE POLICY "auth_delete_project_docs"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'project-documents');
