-- Migration 029: one object type per table in the registry.
--
-- SUBCONTRACTOR ("Stakeholder") and PROJECT_MEMBER both described
-- project_members, so /ontology drew the same table twice. PROJECT_MEMBER
-- carries the member Actions and events; SUBCONTRACTOR had neither. The enum
-- value stays: documents and messages may still be filed against it.
--
-- STATUS: pending. The Supabase MCP holds deletes for a confirmation that
-- timed out in the cloud session; run this in the SQL editor.

begin;

delete from ontology_links
 where from_type::text = 'SUBCONTRACTOR' or to_type::text = 'SUBCONTRACTOR';

delete from ontology_object_types where key::text = 'SUBCONTRACTOR';

commit;
