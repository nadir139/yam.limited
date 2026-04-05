-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — MIGRATION 001: PERMISSIVE RLS
-- Run this in the Supabase SQL editor.
-- Drops the original restrictive per-role policies and replaces them with
-- a single permissive policy per table: any authenticated user can do everything.
-- Role-based restriction will be added in phase 2.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop existing restrictive policies
drop policy if exists "project_member_read" on projects;
drop policy if exists "project_member_read" on work_packages;
drop policy if exists "project_member_read" on inspection_events;
drop policy if exists "project_member_read" on defect_records;
drop policy if exists "project_member_read" on change_orders;
drop policy if exists "project_member_read" on owner_approvals;
drop policy if exists "project_member_read" on documents;
drop policy if exists "project_member_read" on world_model_events;
drop policy if exists "rep_write_work_packages" on work_packages;
drop policy if exists "rep_write_defects" on defect_records;
drop policy if exists "rep_write_change_orders" on change_orders;
drop policy if exists "owner_write_approvals" on owner_approvals;

-- Permissive: any authenticated user can do everything
-- (role-based restriction added in phase 2)
create policy "auth_all" on vessels for all to authenticated using (true) with check (true);
create policy "auth_all" on projects for all to authenticated using (true) with check (true);
create policy "auth_all" on project_members for all to authenticated using (true) with check (true);
create policy "auth_all" on work_packages for all to authenticated using (true) with check (true);
create policy "auth_all" on inspection_events for all to authenticated using (true) with check (true);
create policy "auth_all" on defect_records for all to authenticated using (true) with check (true);
create policy "auth_all" on change_orders for all to authenticated using (true) with check (true);
create policy "auth_all" on owner_approvals for all to authenticated using (true) with check (true);
create policy "auth_all" on documents for all to authenticated using (true) with check (true);
create policy "auth_all" on world_model_events for all to authenticated using (true) with check (true);
