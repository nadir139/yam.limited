-- Migration 041: Revolut Business connected straight to the ledger (finance, part 2).
--
-- Migration 040 took a statement exported by hand. This lets the owner connect
-- the Revolut Business account once; from then on its accounts and
-- transactions arrive by themselves (a webhook on every new or changed
-- transaction, and "Sync now"). They land in the same ledger, through the
-- same import, so a statement imported by hand and the same transactions
-- synced meet on one row (both carry Revolut's transaction id).
--
-- The connection is READ only. It sees accounts and transactions; it cannot
-- make a payment.
--
--   finance_connections         one per Revolut Business connection: the
--                               certificate the owner uploaded, the client id
--                               Revolut gave, the state, the last sync. Read
--                               by the finance readers; written only by the
--                               `revolut` Edge Function (service role) after
--                               it has checked the caller.
--   finance_connection_secrets  where the private key, the refresh token and
--                               the webhook signing secret are: ids of
--                               Supabase Vault secrets, encrypted at rest. No
--                               one but the service role can read them, and
--                               the browser never sees them.
--
-- Who: the owner and the owner's rep connect and disconnect
-- (action_connect_bank); the captain can see the connection and sync it.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: finance_api_0_enum, finance_api_1_actor,
-- finance_api_2_import_rows, finance_api_3_connections, and section 4 as
-- finance_api_4a_checks, _4b_secret_put, _4c_secret_get, _4d_secrets_revoke,
-- _4e_connection_fns, _4f_account_import, _4g_grants_registry, then
-- finance_api_5_import_lock.

-- 0. Object type (its own step: a new enum value cannot be used in the same transaction).
alter type object_type add value if not exists 'FINANCE_CONNECTION';

-- 1. Who did it, when a machine did it ------------------------------------------------
-- A sync started by the webhook has no signed-in person. The functions the
-- Edge Function calls name the actor in yam.actor_name for the transaction
-- ("Revolut sync", or the person who pressed Sync now); the finance history
-- and the import record carry that name instead of "Unknown".
create or replace function public.finance_actor_name()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(nullif(current_setting('yam.actor_name', true), ''), current_actor_name());
$$;
revoke execute on function public.finance_actor_name() from anon, public;
grant execute on function public.finance_actor_name() to authenticated, service_role;

create or replace function public.finance_event(
  p_project_id uuid, p_type text, p_object_type object_type, p_object_id uuid, p_before jsonb, p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into finance_events (project_id, vessel_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (p_project_id, (select vessel_id from projects where id = p_project_id), p_type, p_object_type, p_object_id,
          p_before, p_after, current_actor_id(), finance_actor_name());
end;
$$;
revoke execute on function public.finance_event(uuid, text, object_type, uuid, jsonb, jsonb) from anon, public;

-- 2. One import, two doors ---------------------------------------------------------------
-- The import loop of migration 040, unchanged, moved into an internal
-- function so the statement upload (a person, through
-- action_import_transactions) and the API sync (the Edge Function) write
-- rows exactly the same way. Not callable from the browser.
create or replace function public.finance_import_rows(
  p_account_id uuid, p_source text, p_rows jsonb, p_file_name text default null
)
returns finance_imports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account finance_accounts;
  v_import finance_imports;
  v_row jsonb;
  v_before finance_transactions;
  v_after finance_transactions;
  v_state text;
  v_new int := 0;
  v_changed int := 0;
  v_same int := 0;
  v_k int := 0;
begin
  select * into v_account from finance_accounts where id = p_account_id;
  if not found then
    raise exception 'No such account' using errcode = 'P0001';
  end if;
  if v_account.closed_at is not null then
    raise exception 'That account was closed' using errcode = 'P0001';
  end if;
  if upper(coalesce(p_source, '')) not in ('REVOLUT_CSV', 'REVOLUT_API', 'MANUAL') then
    raise exception 'Unknown source %', p_source using errcode = 'P0001';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nothing to import' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import at most 5,000 rows at a time' using errcode = 'P0001';
  end if;

  insert into finance_imports (account_id, project_id, source, file_name, row_count, imported_by_name)
  values (v_account.id, v_account.project_id, upper(p_source), nullif(trim(coalesce(p_file_name, '')), ''),
          jsonb_array_length(p_rows), finance_actor_name())
  returning * into v_import;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_k := v_k + 1;
    if nullif(trim(coalesce(v_row ->> 'external_id', '')), '') is null then
      raise exception 'Row % has no transaction id', v_k using errcode = 'P0001';
    end if;
    if upper(coalesce(v_row ->> 'currency', '')) <> v_account.currency then
      raise exception 'Row % is in %, the account is in %: import each currency into its own account',
        v_k, coalesce(v_row ->> 'currency', '?'), v_account.currency using errcode = 'P0001';
    end if;
    v_state := upper(coalesce(nullif(v_row ->> 'state', ''), 'COMPLETED'));
    if v_state not in ('COMPLETED', 'PENDING', 'REVERTED', 'DECLINED', 'FAILED') then
      raise exception 'Row % has an unknown state %', v_k, v_state using errcode = 'P0001';
    end if;

    select * into v_before from finance_transactions
     where account_id = v_account.id and external_id = v_row ->> 'external_id' for update;
    if not found then
      insert into finance_transactions (
        account_id, project_id, vessel_id, external_id, booked_at, amount, currency, fee,
        original_amount, original_currency, counterparty, description, reference, bank_category,
        state, source, raw, import_id
      ) values (
        v_account.id, v_account.project_id, v_account.vessel_id, v_row ->> 'external_id',
        (v_row ->> 'booked_at')::timestamptz, (v_row ->> 'amount')::numeric, v_account.currency,
        nullif(v_row ->> 'fee', '')::numeric, nullif(v_row ->> 'original_amount', '')::numeric,
        nullif(upper(v_row ->> 'original_currency'), ''), nullif(trim(v_row ->> 'counterparty'), ''),
        nullif(trim(v_row ->> 'description'), ''), nullif(trim(v_row ->> 'reference'), ''),
        nullif(trim(v_row ->> 'bank_category'), ''), v_state, upper(p_source),
        coalesce(v_row -> 'raw', v_row), v_import.id
      ) returning * into v_after;
      v_new := v_new + 1;
    elsif v_before.state <> v_state or v_before.amount <> (v_row ->> 'amount')::numeric
          or v_before.booked_at <> (v_row ->> 'booked_at')::timestamptz then
      update finance_transactions set
        state = v_state, amount = (v_row ->> 'amount')::numeric, booked_at = (v_row ->> 'booked_at')::timestamptz,
        fee = nullif(v_row ->> 'fee', '')::numeric, raw = coalesce(v_row -> 'raw', v_row),
        import_id = v_import.id, updated_at = now()
      where id = v_before.id returning * into v_after;
      perform finance_event(v_account.project_id, 'FINANCE_TRANSACTION_CHANGED_BY_BANK', 'FINANCE_TRANSACTION', v_after.id,
        jsonb_build_object('state', v_before.state, 'amount', v_before.amount, 'booked_at', v_before.booked_at, 'raw', v_before.raw),
        jsonb_build_object('state', v_after.state, 'amount', v_after.amount, 'booked_at', v_after.booked_at, 'import_id', v_import.id));
      v_changed := v_changed + 1;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  update finance_imports set new_count = v_new, changed_count = v_changed, unchanged_count = v_same
   where id = v_import.id returning * into v_import;
  perform finance_event(v_account.project_id, 'FINANCE_IMPORTED', 'FINANCE_IMPORT', v_import.id, null,
    jsonb_build_object('account', v_account.name, 'source', v_import.source, 'file_name', v_import.file_name,
                       'rows', v_import.row_count, 'new', v_new, 'changed', v_changed, 'unchanged', v_same));
  return v_import;
end;
$$;
revoke execute on function public.finance_import_rows(uuid, text, jsonb, text) from anon, authenticated, public;

create or replace function public.action_import_transactions(
  p_project_id uuid, p_account_id uuid, p_source text, p_rows jsonb, p_file_name text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_import finance_imports;
begin
  perform require_permission('action_import_transactions', v_project_id);
  perform require_finance(v_project_id);
  if not exists (select 1 from finance_accounts where id = p_account_id and project_id = v_project_id) then
    raise exception 'No account with that id kept from this project' using errcode = 'P0001';
  end if;
  v_import := finance_import_rows(p_account_id, p_source, p_rows, p_file_name);
  return json_build_object('import', row_to_json(v_import));
end;
$$;

-- 3. Connections --------------------------------------------------------------------------
create table if not exists public.finance_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid references public.vessels(id),
  provider text not null default 'REVOLUT_BUSINESS' check (provider = 'REVOLUT_BUSINESS'),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  -- Where Revolut sends the owner back after consent; its host is the `iss`
  -- of every client assertion, so it is fixed when the certificate is made.
  redirect_uri text not null check (redirect_uri ~ '^https?://'),
  certificate_pem text not null,
  client_id text,
  status text not null default 'AWAITING_CLIENT_ID'
    check (status in ('AWAITING_CLIENT_ID', 'AWAITING_CONSENT', 'CONNECTED', 'NEEDS_RECONSENT', 'DISCONNECTED')),
  webhook_id text,
  last_synced_at timestamptz,
  last_sync_result jsonb,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  created_by_name text,
  connected_at timestamptz,
  connected_by_name text,
  disconnected_at timestamptz,
  disconnected_by_name text,
  disconnected_reason text
);
create index if not exists finance_connections_vessel_idx on public.finance_connections (vessel_id);
alter table public.finance_connections enable row level security;
create policy finance_connections_read on public.finance_connections for select using (can_read_finance(vessel_id, project_id));
revoke all on public.finance_connections from anon, authenticated;
grant select on public.finance_connections to authenticated;

create table if not exists public.finance_connection_secrets (
  connection_id uuid not null references public.finance_connections(id),
  kind text not null check (kind in ('PRIVATE_KEY', 'REFRESH_TOKEN', 'WEBHOOK_SECRET')),
  secret_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (connection_id, kind)
);
alter table public.finance_connection_secrets enable row level security;
revoke all on public.finance_connection_secrets from anon, authenticated;

alter table public.finance_accounts add column if not exists connection_id uuid references public.finance_connections(id);

insert into action_permissions (action_key, role)
values ('action_connect_bank', 'OWNER'), ('action_connect_bank', 'OWNERS_REP')
on conflict do nothing;

-- 4. Functions -----------------------------------------------------------------------------
-- Called with the CALLER's session by the Edge Function, before it does
-- anything with the service role. Connecting needs action_connect_bank on
-- the project; syncing needs only to be a finance reader.
create or replace function public.finance_connect_check(p_project_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project projects;
begin
  perform require_permission('action_connect_bank', p_project_id);
  v_project := require_finance(p_project_id);
  return json_build_object('project_id', v_project.id, 'vessel_id', v_project.vessel_id, 'actor_name', current_actor_name());
end;
$$;
revoke execute on function public.finance_connect_check(uuid) from anon, public;
grant execute on function public.finance_connect_check(uuid) to authenticated;

create or replace function public.finance_connection_check(p_connection_id uuid, p_manage boolean)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_conn finance_connections;
begin
  select * into v_conn from finance_connections where id = p_connection_id;
  if not found or not can_read_finance(v_conn.vessel_id, v_conn.project_id) then
    raise exception 'No connection with that id you keep' using errcode = 'P0001';
  end if;
  if p_manage then
    perform require_permission('action_connect_bank', v_conn.project_id);
  end if;
  return json_build_object('connection', row_to_json(v_conn), 'actor_name', current_actor_name());
end;
$$;
revoke execute on function public.finance_connection_check(uuid, boolean) from anon, public;
grant execute on function public.finance_connection_check(uuid, boolean) to authenticated;

-- The rest is for the Edge Function's service role only.

create or replace function public.finance_secret_put(p_connection_id uuid, p_kind text, p_value text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select secret_id into v_id from finance_connection_secrets where connection_id = p_connection_id and kind = p_kind;
  if v_id is null then
    v_id := vault.create_secret(p_value, 'finance_' || p_connection_id || '_' || lower(p_kind), 'Revolut connection ' || p_connection_id);
    insert into finance_connection_secrets (connection_id, kind, secret_id) values (p_connection_id, p_kind, v_id);
  else
    perform vault.update_secret(v_id, p_value);
    update finance_connection_secrets set updated_at = now() where connection_id = p_connection_id and kind = p_kind;
  end if;
end;
$$;

create or replace function public.finance_secret_get(p_connection_id uuid, p_kind text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ds.decrypted_secret
    from finance_connection_secrets s
    join vault.decrypted_secrets ds on ds.id = s.secret_id
   where s.connection_id = p_connection_id and s.kind = p_kind;
$$;

-- Disconnecting destroys the credentials: each vault secret is overwritten
-- with nothing. Nothing is deleted: the mapping rows, the connection, its
-- history and every transaction it brought stay.
create or replace function public.finance_secrets_revoke(p_connection_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s record;
  v_n int := 0;
begin
  for v_s in select secret_id from finance_connection_secrets where connection_id = p_connection_id loop
    perform vault.update_secret(v_s.secret_id, '');
    v_n := v_n + 1;
  end loop;
  update finance_connection_secrets set updated_at = now() where connection_id = p_connection_id;
  return v_n;
end;
$$;

create or replace function public.finance_connection_create(
  p_project_id uuid, p_environment text, p_redirect_uri text, p_certificate_pem text, p_private_key text, p_actor_name text
)
returns finance_connections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_after finance_connections;
begin
  perform set_config('yam.actor_name', p_actor_name, true);
  insert into finance_connections (project_id, vessel_id, environment, redirect_uri, certificate_pem, created_by_name)
  values (p_project_id, (select vessel_id from projects where id = p_project_id), upper(p_environment), p_redirect_uri,
          p_certificate_pem, p_actor_name)
  returning * into v_after;
  perform finance_secret_put(v_after.id, 'PRIVATE_KEY', p_private_key);
  perform finance_event(p_project_id, 'FINANCE_CONNECTION_STARTED', 'FINANCE_CONNECTION', v_after.id, null,
    jsonb_build_object('provider', v_after.provider, 'environment', v_after.environment, 'redirect_uri', v_after.redirect_uri));
  return v_after;
end;
$$;

-- Changes a connection's state and records the change. Only these fields
-- move; the certificate and the redirect never change after creation.
create or replace function public.finance_connection_update(
  p_connection_id uuid, p_patch jsonb, p_event text, p_actor_name text
)
returns finance_connections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before finance_connections;
  v_after finance_connections;
  v_keys text[] := array['client_id', 'status', 'webhook_id', 'last_synced_at', 'last_sync_result', 'last_error',
                         'last_error_at', 'connected_at', 'connected_by_name', 'disconnected_at',
                         'disconnected_by_name', 'disconnected_reason'];
  v_bad text;
begin
  perform set_config('yam.actor_name', p_actor_name, true);
  select k into v_bad from jsonb_object_keys(p_patch) k where k <> all (v_keys) limit 1;
  if v_bad is not null then
    raise exception 'A connection''s % is not changed this way', v_bad using errcode = 'P0001';
  end if;
  select * into v_before from finance_connections where id = p_connection_id for update;
  if not found then
    raise exception 'No such connection' using errcode = 'P0001';
  end if;
  v_after := jsonb_populate_record(v_before, p_patch);
  update finance_connections set
    client_id = v_after.client_id, status = v_after.status, webhook_id = v_after.webhook_id,
    last_synced_at = v_after.last_synced_at, last_sync_result = v_after.last_sync_result,
    last_error = v_after.last_error, last_error_at = v_after.last_error_at,
    connected_at = v_after.connected_at, connected_by_name = v_after.connected_by_name,
    disconnected_at = v_after.disconnected_at, disconnected_by_name = v_after.disconnected_by_name,
    disconnected_reason = v_after.disconnected_reason
  where id = p_connection_id returning * into v_after;
  if p_event is not null then
    perform finance_event(v_after.project_id, p_event, 'FINANCE_CONNECTION', v_after.id,
      to_jsonb(v_before) - 'certificate_pem', to_jsonb(v_after) - 'certificate_pem');
  end if;
  return v_after;
end;
$$;

-- The ledger account a Revolut account syncs into. In order: the account
-- already linked to it; else the one Revolut account of that currency on the
-- same asset that was added by hand and never linked (its imported statement
-- then dedupes against the sync); else a new one.
create or replace function public.finance_api_account(
  p_connection_id uuid, p_external_id text, p_name text, p_currency text, p_actor_name text
)
returns finance_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conn finance_connections;
  v_acc finance_accounts;
  v_ids uuid[];
begin
  perform set_config('yam.actor_name', p_actor_name, true);
  select * into v_conn from finance_connections where id = p_connection_id;
  select * into v_acc from finance_accounts where provider = 'REVOLUT' and external_id = p_external_id;
  if found then
    if v_acc.connection_id is distinct from p_connection_id then
      update finance_accounts set connection_id = p_connection_id where id = v_acc.id returning * into v_acc;
    end if;
    return v_acc;
  end if;
  select array_agg(id) into v_ids from finance_accounts
   where provider = 'REVOLUT' and currency = upper(p_currency) and external_id is null and connection_id is null
     and closed_at is null
     and ((v_conn.vessel_id is not null and vessel_id = v_conn.vessel_id) or (v_conn.vessel_id is null and project_id = v_conn.project_id));
  if array_length(v_ids, 1) = 1 then
    update finance_accounts set external_id = p_external_id, connection_id = p_connection_id
     where id = v_ids[1] returning * into v_acc;
    perform finance_event(v_acc.project_id, 'FINANCE_ACCOUNT_LINKED', 'FINANCE_ACCOUNT', v_acc.id, null,
      jsonb_build_object('external_id', p_external_id, 'connection_id', p_connection_id));
    return v_acc;
  end if;
  insert into finance_accounts (project_id, vessel_id, name, provider, currency, external_id, connection_id, created_by_name)
  values (v_conn.project_id, v_conn.vessel_id, coalesce(nullif(trim(p_name), ''), 'Revolut ' || upper(p_currency)),
          'REVOLUT', upper(p_currency), p_external_id, p_connection_id, p_actor_name)
  returning * into v_acc;
  perform finance_event(v_acc.project_id, 'FINANCE_ACCOUNT_ADDED', 'FINANCE_ACCOUNT', v_acc.id, null,
    jsonb_build_object('name', v_acc.name, 'provider', v_acc.provider, 'currency', v_acc.currency, 'from', 'Revolut connection'));
  return v_acc;
end;
$$;

create or replace function public.finance_api_import(p_account_id uuid, p_rows jsonb, p_actor_name text)
returns finance_imports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Webhooks can arrive together: one import per account at a time, so two
  -- syncs never race to insert the same transaction.
  perform pg_advisory_xact_lock(hashtext('finance_import:' || p_account_id::text));
  perform set_config('yam.actor_name', p_actor_name, true);
  return finance_import_rows(p_account_id, 'REVOLUT_API', p_rows, null);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'finance_secret_put(uuid, text, text)', 'finance_secret_get(uuid, text)', 'finance_secrets_revoke(uuid)',
    'finance_connection_create(uuid, text, text, text, text, text)', 'finance_connection_update(uuid, jsonb, text, text)',
    'finance_api_account(uuid, text, text, text, text)', 'finance_api_import(uuid, jsonb, text)',
    'finance_import_rows(uuid, text, jsonb, text)'
  ] loop
    execute format('revoke execute on function public.%s from anon, authenticated, public', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

insert into ontology_object_types (key, label, table_name, description, display_order)
values ('FINANCE_CONNECTION', 'Bank connection', 'finance_connections',
        'A read-only connection to a Revolut Business account: accounts and transactions arrive by themselves. Credentials are in the vault, never here. Readable only by the owner, the owner''s rep and the captain.', 46)
on conflict do nothing;
