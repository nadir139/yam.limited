-- =============================================================================
-- YAM Migration 005 — contact_inquiries table for the public contact form
--
-- Leads from the public contact form. Deliberately NOT part of the permissive
-- auth_all RLS pattern from migration 001: this holds real PII (name/email/
-- phone/message) submitted by the public internet, and Workspace sign-up is
-- unrestricted, so an "authenticated" policy here would let any rando who
-- signs in read every lead. RLS is enabled with NO policies -- default-deny
-- for anon and authenticated. Only the service_role key (used by the
-- contact-inquiry Edge Function, see supabase/functions/contact-inquiry) can
-- write, and only the project owner via the SQL editor / dashboard can read.
-- =============================================================================

create table contact_inquiries (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  phone text,
  project_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table contact_inquiries enable row level security;

create index on contact_inquiries(created_at desc);
