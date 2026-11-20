-- Migration 048: documents store the Storage path, not a signed URL.
--
-- Until now uploadDocument() wrote a one-year signed URL into documents.file_url.
-- That URL is a bearer link: anyone holding it can read the file without being
-- a member of the project (it skips the member-only Storage policy from
-- migration 023), and every link stops working a year after upload.
--
-- Now:
--   * documents.storage_path holds the object's path in the project-documents
--     bucket. The app signs a short-lived URL (10 minutes) when someone opens
--     the file, so the Storage policy runs at that moment, every time.
--   * file_url stays for external links (e.g. a class society portal) and is
--     cleared on rows whose path has been recovered.
--   * A check keeps a document's path inside its own project's folder, the
--     same first-segment rule the Storage policy uses.
--
-- Note: signed URLs issued before this migration stay valid until they expire.
-- Clearing them from the table stops new copies; it cannot revoke old ones.
--
-- Applied to project xgpdfefxarllgykjbppn as documents_store_the_path.

alter table public.documents add column if not exists storage_path text;

-- Recover the path from the signed URLs already stored:
--   https://<ref>.supabase.co/storage/v1/object/sign/project-documents/<path>?token=…
update public.documents
   set storage_path = substring(file_url from '/storage/v1/object/sign/project-documents/([^?]+)')
 where storage_path is null
   and file_url like '%/storage/v1/object/sign/project-documents/%';

update public.documents
   set file_url = null
 where storage_path is not null
   and file_url like '%/storage/v1/object/sign/%';

alter table public.documents drop constraint if exists documents_storage_path_in_project;
alter table public.documents add constraint documents_storage_path_in_project
  check (storage_path is null or storage_path like project_id::text || '/%');

-- The Action takes either a Storage path (uploads) or an external URL.
drop function if exists public.action_register_document(text, text, text, integer, text, text, uuid, boolean, uuid);

create or replace function public.action_register_document(
  p_title text,
  p_doc_type text,
  p_file_url text default null,
  p_file_size integer default null,
  p_mime_type text default null,
  p_linked_object_type text default null,
  p_linked_object_id uuid default null,
  p_is_class_document boolean default false,
  p_project_id uuid default null,
  p_storage_path text default null
)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_actor_id uuid := current_actor_id();
  v_actor_name text := current_actor_name();
  v_seq int;
  v_doc_number text;
  v_doc documents;
begin
  perform require_permission('action_register_document', resolve_project(p_project_id));
  if p_title is null or length(trim(p_title)) < 2 then
    raise exception 'Document title is required' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_storage_path, '')), '') is null
     and nullif(trim(coalesce(p_file_url, '')), '') is null then
    raise exception 'A document needs a file or a link' using errcode = 'P0001';
  end if;
  if p_storage_path is not null and p_storage_path not like v_project_id::text || '/%' then
    raise exception 'That file is not in this project''s folder' using errcode = 'P0001';
  end if;
  -- A signed Storage URL is a bearer link; uploads must pass the path instead.
  if p_file_url like '%/storage/v1/object/sign/%' then
    raise exception 'Register an uploaded file by its path, not a signed link' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_project_id::text || ':numbering', 0));
  select coalesce(max((substring(doc_number from '\d+$'))::int), 0) + 1
    into v_seq
    from documents
   where project_id = v_project_id;
  v_doc_number := 'DOC-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 3, '0');

  insert into documents (
    project_id, doc_number, title, doc_type, revision, status,
    file_url, storage_path, file_size, mime_type, uploaded_by, uploaded_date,
    linked_object_type, linked_object_id, is_class_document
  ) values (
    v_project_id, v_doc_number, trim(p_title), p_doc_type::doc_type,
    'Rev.0', 'APPROVED'::document_status,
    nullif(trim(coalesce(p_file_url, '')), ''), p_storage_path, p_file_size, p_mime_type,
    v_actor_name, current_date,
    nullif(p_linked_object_type, '')::object_type, p_linked_object_id,
    coalesce(p_is_class_document, false)
  )
  returning * into v_doc;

  insert into world_model_events (
    project_id, event_type, object_type, object_id,
    before_state, after_state, triggered_by, triggered_by_name
  ) values (
    v_project_id, 'DOCUMENT_UPLOADED', 'DOCUMENT', v_doc.id,
    null,
    jsonb_build_object(
      'doc_number', v_doc.doc_number, 'title', v_doc.title,
      'doc_type', v_doc.doc_type, 'is_class_document', v_doc.is_class_document,
      'linked_object_type', v_doc.linked_object_type,
      'linked_object_id', v_doc.linked_object_id
    ),
    v_actor_id, v_actor_name
  );

  return row_to_json(v_doc);
end;
$function$;

revoke all on function public.action_register_document(text, text, text, integer, text, text, uuid, boolean, uuid, text) from public, anon;
grant execute on function public.action_register_document(text, text, text, integer, text, text, uuid, boolean, uuid, text) to authenticated, service_role;

-- The registry (what the agent sees): the URL is optional, the path is new.
update public.ontology_actions
   set parameters = (
     select jsonb_agg(
              case when p->>'name' = 'p_file_url'
                   then jsonb_set(p, '{required}', 'false'::jsonb)
                   else p end
              order by ord)
       from jsonb_array_elements(parameters) with ordinality as t(p, ord)
   ) || '[{"name":"p_storage_path","type":"text","required":false}]'::jsonb
 where key = 'action_register_document'
   and not parameters @> '[{"name":"p_storage_path"}]'::jsonb;
