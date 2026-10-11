-- Migration 040: the money, in the ontology (finance, part 1: the ledger).
--
-- An owner runs a yacht (or a house) out of a bank account, today a Revolut
-- Business account and a pile of receipts. This records every transaction
-- of that account against the thing it paid for: the work package, the
-- part, the NCR, the bunkering in the Oil Record Book, the day in port. That
-- is what turns a bank statement into a cost of ownership: cost per engine
-- hour, per system, per season, with the receipt behind each line.
--
--   finance_accounts      a bank or card account (or cash) kept for an asset
--   finance_transactions  what the bank says happened, as the bank said it:
--                         imported, never edited by people; a later import
--                         that changes a transaction's state (pending to
--                         completed, reverted) is recorded as a change
--   finance_allocations   what each transaction was for: an object in the
--                         model, a category, an amount (a transaction can be
--                         split); removed with a reason, never deleted
--   finance_imports       every import: file, rows, new, already there
--   finance_events        the full before/after of every finance change,
--                         private: the shared event log (read by the crew)
--                         carries nothing of the money
--   finance_receipts      receipts and invoices behind a transaction, kept in
--                         a private storage bucket only the finance-files
--                         Edge Function reaches (crew can read the project's
--                         documents bucket; they must not read the owner's)
--
-- Who: the owner, the owner's rep and the captain of any project on the
-- vessel (or of the property project). Crew, yard and surveyors see none of
-- it. The money stays in the bank: this is a record of it.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: finance_ledger_0_enum,
-- finance_ledger_1_tables, finance_ledger_2_actions, finance_ledger_3_summary,
-- finance_ledger_4_permissions_registry, finance_ledger_5_private_history
-- (finance history moved to finance_events), finance_ledger_6_wording (an
-- error message), and the storage bucket at the end (run as SQL).
--
-- Storage: the bucket finance-receipts is private and has NO storage.objects
-- policies on purpose. Only the finance-files Edge Function reaches it, with
-- the service role, after checking the caller can read the transaction.

-- 0. Object types ------------------------------------------------------------------
alter type object_type add value if not exists 'FINANCE_ACCOUNT';
alter type object_type add value if not exists 'FINANCE_TRANSACTION';
alter type object_type add value if not exists 'FINANCE_ALLOCATION';
alter type object_type add value if not exists 'FINANCE_IMPORT';
alter type object_type add value if not exists 'FINANCE_RECEIPT';

-- 1. Tables ---------------------------------------------------------------------------

-- Finance is read and kept by the owner side and the captain: of any project
-- on the vessel, or of the project itself when the asset is a property.
create or replace function public.can_read_finance(p_vessel_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_vessel_id is not null then exists (
      select 1 from projects p
       where p.vessel_id = p_vessel_id
         and current_actor_role(p.id) in ('OWNER', 'OWNERS_REP', 'CAPTAIN'))
    else coalesce(current_actor_role(p_project_id) in ('OWNER', 'OWNERS_REP', 'CAPTAIN'), false)
  end;
$$;
revoke execute on function public.can_read_finance(uuid, uuid) from anon, public;
grant execute on function public.can_read_finance(uuid, uuid) to authenticated;

create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid references public.vessels(id),
  name text not null check (length(trim(name)) >= 2),
  provider text not null check (provider in ('REVOLUT', 'BANK', 'CARD', 'CASH', 'ESCROW')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- The bank's own id for the account, when known (Revolut account id).
  external_id text,
  created_at timestamptz not null default now(),
  created_by_name text,
  closed_at timestamptz,
  closed_reason text,
  unique (provider, external_id)
);

create table if not exists public.finance_imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.finance_accounts(id),
  project_id uuid not null references public.projects(id),
  source text not null check (source in ('REVOLUT_CSV', 'REVOLUT_API', 'MANUAL')),
  file_name text,
  row_count int not null default 0,
  new_count int not null default 0,
  changed_count int not null default 0,
  unchanged_count int not null default 0,
  imported_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.finance_accounts(id),
  project_id uuid not null references public.projects(id),
  vessel_id uuid references public.vessels(id),
  -- The bank's id for the transaction (or a hash of the row when it has none).
  external_id text not null,
  booked_at timestamptz not null,
  -- Signed, in the account's currency: money out is negative.
  amount numeric not null,
  currency char(3) not null,
  fee numeric,
  -- What it was in the merchant's currency, when different.
  original_amount numeric,
  original_currency char(3),
  counterparty text,
  description text,
  reference text,
  bank_category text,
  state text not null check (state in ('COMPLETED', 'PENDING', 'REVERTED', 'DECLINED', 'FAILED')),
  source text not null check (source in ('REVOLUT_CSV', 'REVOLUT_API', 'MANUAL')),
  -- The row exactly as it came from the bank.
  raw jsonb not null,
  import_id uuid references public.finance_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (account_id, external_id)
);
create index if not exists finance_transactions_account_idx on public.finance_transactions (account_id, booked_at desc);
create index if not exists finance_transactions_vessel_idx on public.finance_transactions (vessel_id, booked_at desc);

create table if not exists public.finance_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id),
  -- The part of the transaction this line covers, as a positive figure in
  -- the account's currency.
  amount numeric not null check (amount > 0),
  category text not null check (category in (
    'FUEL', 'BERTHING', 'CREW', 'MAINTENANCE', 'REFIT', 'REPAIRS', 'INSURANCE', 'PROVISIONS',
    'CHARTER_INCOME', 'TAXES_FEES', 'ADMIN', 'TRANSFER', 'OTHER')),
  -- What it paid for in the model; null when it is only a category.
  object_type object_type,
  object_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text,
  check ((object_type is null) = (object_id is null))
);
create index if not exists finance_allocations_tx_idx on public.finance_allocations (transaction_id);
create index if not exists finance_allocations_object_idx on public.finance_allocations (object_type, object_id) where removed_at is null;

create table if not exists public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.finance_transactions(id),
  -- In the private finance-receipts bucket; only the finance-files function reads it.
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes int,
  -- So a receipt can be shown to be the one that was attached.
  sha256 text not null,
  created_at timestamptz not null default now(),
  created_by_name text,
  removed_at timestamptz,
  removed_by_name text,
  removed_reason text
);
create index if not exists finance_receipts_tx_idx on public.finance_receipts (transaction_id);

alter table public.finance_accounts enable row level security;
alter table public.finance_imports enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_allocations enable row level security;
alter table public.finance_receipts enable row level security;
create policy finance_accounts_read on public.finance_accounts for select using (can_read_finance(vessel_id, project_id));
create policy finance_imports_read on public.finance_imports for select using (
  exists (select 1 from finance_accounts a where a.id = account_id and can_read_finance(a.vessel_id, a.project_id)));
create policy finance_transactions_read on public.finance_transactions for select using (can_read_finance(vessel_id, project_id));
create policy finance_allocations_read on public.finance_allocations for select using (
  exists (select 1 from finance_transactions t where t.id = transaction_id and can_read_finance(t.vessel_id, t.project_id)));
create policy finance_receipts_read on public.finance_receipts for select using (
  exists (select 1 from finance_transactions t where t.id = transaction_id and can_read_finance(t.vessel_id, t.project_id)));
revoke all on public.finance_accounts, public.finance_imports, public.finance_transactions,
              public.finance_allocations, public.finance_receipts from anon, authenticated;
grant select on public.finance_accounts, public.finance_imports, public.finance_transactions,
                public.finance_allocations, public.finance_receipts to authenticated;

do $$ begin alter publication supabase_realtime add table public.finance_transactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.finance_allocations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.finance_receipts; exception when duplicate_object then null; end $$;

-- 2. Actions --------------------------------------------------------------------------

-- Finance history is private. Every change is kept in full, before and
-- after, in finance_events, readable by the finance readers only. It is not
-- copied into the project's shared event log, which the whole crew reads:
-- not even that a finance record changed.
create table if not exists public.finance_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid references public.vessels(id),
  event_type text not null,
  object_type object_type not null,
  object_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  triggered_by uuid,
  triggered_by_name text,
  triggered_at timestamptz not null default now()
);
create index if not exists finance_events_object_idx on public.finance_events (object_id, triggered_at);
alter table public.finance_events enable row level security;
create policy finance_events_read on public.finance_events for select using (can_read_finance(vessel_id, project_id));
revoke all on public.finance_events from anon, authenticated;
grant select on public.finance_events to authenticated;

create or replace function public.finance_event(
  p_project_id uuid, p_type text, p_object_type object_type, p_object_id uuid, p_before jsonb, p_after jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into finance_events (project_id, vessel_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name)
  values (p_project_id, (select vessel_id from projects where id = p_project_id), p_type, p_object_type, p_object_id,
          p_before, p_after, current_actor_id(), coalesce(current_actor_name(), 'Bank sync'))
  returning id into v_id;
end;
$$;
revoke execute on function public.finance_event(uuid, text, object_type, uuid, jsonb, jsonb) from anon, public;

create or replace function public.require_finance(p_project_id uuid)
returns projects
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_project projects;
begin
  select * into v_project from projects where id = p_project_id;
  if not found or not can_read_finance(v_project.vessel_id, v_project.id) then
    raise exception 'The money is kept by the owner, the owner''s rep and the captain' using errcode = 'P0001';
  end if;
  return v_project;
end;
$$;
revoke execute on function public.require_finance(uuid) from anon, public;

create or replace function public.action_create_finance_account(
  p_project_id uuid, p_name text, p_provider text, p_currency text, p_external_id text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_after finance_accounts;
begin
  perform require_permission('action_create_finance_account', v_project_id);
  v_project := require_finance(v_project_id);
  if upper(coalesce(p_provider, '')) not in ('REVOLUT', 'BANK', 'CARD', 'CASH', 'ESCROW') then
    raise exception 'The account is REVOLUT, BANK, CARD, CASH or ESCROW' using errcode = 'P0001';
  end if;
  if upper(coalesce(p_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'The currency is a three-letter code (EUR, GBP, USD)' using errcode = 'P0001';
  end if;
  insert into finance_accounts (project_id, vessel_id, name, provider, currency, external_id, created_by_name)
  values (v_project_id, v_project.vessel_id, trim(p_name), upper(p_provider), upper(p_currency),
          nullif(trim(coalesce(p_external_id, '')), ''), current_actor_name())
  returning * into v_after;
  perform finance_event(v_project_id, 'FINANCE_ACCOUNT_ADDED', 'FINANCE_ACCOUNT', v_after.id, null,
                        jsonb_build_object('name', v_after.name, 'provider', v_after.provider, 'currency', v_after.currency));
  return json_build_object('account', row_to_json(v_after));
end;
$$;

-- Imports rows as the bank gave them. A row already there with the same bank
-- id and the same content is left alone; one whose state or amount changed
-- (pending to completed, reverted) is updated and the change recorded.
-- Rows: [{external_id, booked_at, amount, currency, fee, original_amount,
-- original_currency, counterparty, description, reference, bank_category,
-- state, raw}].
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
  perform require_permission('action_import_transactions', v_project_id);
  perform require_finance(v_project_id);
  select * into v_account from finance_accounts where id = p_account_id and project_id = v_project_id;
  if not found then
    raise exception 'No account with that id kept from this project' using errcode = 'P0001';
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
  values (v_account.id, v_project_id, upper(p_source), nullif(trim(coalesce(p_file_name, '')), ''),
          jsonb_array_length(p_rows), current_actor_name())
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
        v_account.id, v_project_id, v_account.vessel_id, v_row ->> 'external_id',
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
      perform finance_event(v_project_id, 'FINANCE_TRANSACTION_CHANGED_BY_BANK', 'FINANCE_TRANSACTION', v_after.id,
        jsonb_build_object('state', v_before.state, 'amount', v_before.amount, 'booked_at', v_before.booked_at, 'raw', v_before.raw),
        jsonb_build_object('state', v_after.state, 'amount', v_after.amount, 'booked_at', v_after.booked_at, 'import_id', v_import.id));
      v_changed := v_changed + 1;
    else
      v_same := v_same + 1;
    end if;
  end loop;

  update finance_imports set new_count = v_new, changed_count = v_changed, unchanged_count = v_same
   where id = v_import.id returning * into v_import;
  perform finance_event(v_project_id, 'FINANCE_IMPORTED', 'FINANCE_IMPORT', v_import.id, null,
    jsonb_build_object('account', v_account.name, 'source', v_import.source, 'file_name', v_import.file_name,
                       'rows', v_import.row_count, 'new', v_new, 'changed', v_changed, 'unchanged', v_same));
  return json_build_object('import', row_to_json(v_import));
end;
$$;

-- The vessel (or property project) an object of the model belongs to.
create or replace function public.finance_object_scope(p_object_type text, p_object_id uuid, out vessel_id uuid, out project_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  case p_object_type
    when 'WORK_PACKAGE', 'DEFECT_RECORD', 'CHANGE_ORDER', 'INSPECTION_EVENT' then
      project_id := project_of_object(p_object_type, p_object_id);
      select p.vessel_id into vessel_id from projects p where p.id = project_id;
    when 'PROJECT' then
      select p.vessel_id, p.id into vessel_id, project_id from projects p where p.id = p_object_id;
    when 'PART' then select p.vessel_id, p.project_id into vessel_id, project_id from parts p where p.id = p_object_id;
    when 'SERVICE_RECORD' then select s.vessel_id, s.project_id into vessel_id, project_id from service_records s where s.id = p_object_id;
    when 'ORB_ENTRY' then select o.vessel_id, o.project_id into vessel_id, project_id from orb_entries o where o.id = p_object_id;
    when 'LOG_DAY' then select d.vessel_id, d.project_id into vessel_id, project_id from log_days d where d.id = p_object_id;
    when 'CREW' then select c.vessel_id, c.project_id into vessel_id, project_id from crew c where c.id = p_object_id;
    else
      raise exception 'Money can be put against a work package, NCR, change order, inspection, project, part, service, Oil Record Book entry, log day or crew member, not %', p_object_type
        using errcode = 'P0001';
  end case;
  if project_id is null and vessel_id is null then
    raise exception 'No % with that id', lower(replace(p_object_type, '_', ' ')) using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.finance_object_scope(text, uuid) from anon, public;

-- Puts (part of) a transaction against what it paid for.
create or replace function public.action_allocate_transaction(
  p_project_id uuid, p_transaction_id uuid, p_amount numeric, p_category text,
  p_object_type text default null, p_object_id uuid default null, p_note text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_tx finance_transactions;
  v_scope record;
  v_taken numeric;
  v_after finance_allocations;
  v_type text := nullif(upper(trim(coalesce(p_object_type, ''))), '');
begin
  perform require_permission('action_allocate_transaction', v_project_id);
  perform require_finance(v_project_id);
  select * into v_tx from finance_transactions where id = p_transaction_id for update;
  if not found or not can_read_finance(v_tx.vessel_id, v_tx.project_id) then
    raise exception 'No transaction with that id you keep' using errcode = 'P0001';
  end if;
  if v_tx.state in ('DECLINED', 'FAILED', 'REVERTED') then
    raise exception 'That transaction was %: no money moved', lower(v_tx.state) using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount put against it must be more than zero' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount), 0) into v_taken from finance_allocations where transaction_id = v_tx.id and removed_at is null;
  if v_taken + p_amount > abs(v_tx.amount) then
    raise exception 'Only % % of this transaction is not yet put against anything', abs(v_tx.amount) - v_taken, v_tx.currency
      using errcode = 'P0001';
  end if;
  if (v_type is null) <> (p_object_id is null) then
    raise exception 'Name both the kind of thing and which one, or neither' using errcode = 'P0001';
  end if;
  if v_type is not null then
    select * into v_scope from finance_object_scope(v_type, p_object_id);
    if not ((v_tx.vessel_id is not null and v_scope.vessel_id = v_tx.vessel_id)
            or (v_tx.vessel_id is null and v_scope.project_id = v_tx.project_id)) then
      raise exception 'That % is not on the asset this account is kept for', lower(replace(v_type, '_', ' ')) using errcode = 'P0001';
    end if;
  end if;
  begin
    insert into finance_allocations (transaction_id, amount, category, object_type, object_id, note, created_by, created_by_name)
    values (v_tx.id, p_amount, upper(trim(p_category)), v_type::object_type, p_object_id,
            nullif(trim(coalesce(p_note, '')), ''), current_actor_id(), current_actor_name())
    returning * into v_after;
  exception when check_violation then
    raise exception 'Unknown category %', p_category using errcode = 'P0001';
  end;
  perform finance_event(v_tx.project_id, 'FINANCE_ALLOCATED', 'FINANCE_ALLOCATION', v_after.id, null,
    jsonb_build_object('transaction_id', v_tx.id, 'amount', v_after.amount, 'currency', v_tx.currency,
                       'category', v_after.category, 'object_type', v_after.object_type, 'object_id', v_after.object_id,
                       'note', v_after.note));
  return json_build_object('allocation', row_to_json(v_after));
end;
$$;

create or replace function public.action_remove_allocation(p_project_id uuid, p_allocation_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_before finance_allocations;
  v_after finance_allocations;
  v_tx finance_transactions;
begin
  perform require_permission('action_allocate_transaction', v_project_id);
  perform require_finance(v_project_id);
  select * into v_before from finance_allocations where id = p_allocation_id for update;
  if not found then
    raise exception 'No allocation with that id' using errcode = 'P0001';
  end if;
  select * into v_tx from finance_transactions where id = v_before.transaction_id;
  if not can_read_finance(v_tx.vessel_id, v_tx.project_id) then
    raise exception 'No allocation with that id' using errcode = 'P0001';
  end if;
  if v_before.removed_at is not null then
    raise exception 'That allocation was already removed' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'Say why the allocation is removed' using errcode = 'P0001';
  end if;
  update finance_allocations set removed_at = now(), removed_by_name = current_actor_name(), removed_reason = v_reason
   where id = v_before.id returning * into v_after;
  perform finance_event(v_tx.project_id, 'FINANCE_ALLOCATION_REMOVED', 'FINANCE_ALLOCATION', v_after.id,
    jsonb_build_object('amount', v_before.amount, 'category', v_before.category, 'object_type', v_before.object_type, 'object_id', v_before.object_id),
    jsonb_build_object('removed_at', v_after.removed_at, 'reason', v_reason));
  return json_build_object('allocation', row_to_json(v_after));
end;
$$;

-- Registers a receipt already stored by the finance-files function. Called
-- with the uploader's own session, so the permission and the event are theirs.
create or replace function public.action_attach_receipt(
  p_project_id uuid, p_transaction_id uuid, p_storage_path text, p_file_name text,
  p_mime_type text, p_size_bytes int, p_sha256 text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_tx finance_transactions;
  v_after finance_receipts;
begin
  perform require_permission('action_allocate_transaction', v_project_id);
  perform require_finance(v_project_id);
  select * into v_tx from finance_transactions where id = p_transaction_id;
  if not found or not can_read_finance(v_tx.vessel_id, v_tx.project_id) then
    raise exception 'No transaction with that id you keep' using errcode = 'P0001';
  end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_tx.project_id::text || '/') then
    raise exception 'The receipt is not stored under this account''s project' using errcode = 'P0001';
  end if;
  if coalesce(p_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'The receipt''s fingerprint is missing' using errcode = 'P0001';
  end if;
  insert into finance_receipts (transaction_id, storage_path, file_name, mime_type, size_bytes, sha256, created_by_name)
  values (v_tx.id, p_storage_path, p_file_name, p_mime_type, p_size_bytes, p_sha256, current_actor_name())
  returning * into v_after;
  perform finance_event(v_tx.project_id, 'FINANCE_RECEIPT_ATTACHED', 'FINANCE_RECEIPT', v_after.id, null,
    jsonb_build_object('transaction_id', v_tx.id, 'file_name', v_after.file_name, 'sha256', v_after.sha256));
  return json_build_object('receipt', row_to_json(v_after));
end;
$$;

revoke execute on function public.action_create_finance_account(uuid, text, text, text, text) from anon, public;
revoke execute on function public.action_import_transactions(uuid, uuid, text, jsonb, text) from anon, public;
revoke execute on function public.action_allocate_transaction(uuid, uuid, numeric, text, text, uuid, text) from anon, public;
revoke execute on function public.action_remove_allocation(uuid, uuid, text) from anon, public;
revoke execute on function public.action_attach_receipt(uuid, uuid, text, text, text, int, text) from anon, public;
grant execute on function public.action_create_finance_account(uuid, text, text, text, text) to authenticated;
grant execute on function public.action_import_transactions(uuid, uuid, text, jsonb, text) to authenticated;
grant execute on function public.action_allocate_transaction(uuid, uuid, numeric, text, text, uuid, text) to authenticated;
grant execute on function public.action_remove_allocation(uuid, uuid, text) to authenticated;
grant execute on function public.action_attach_receipt(uuid, uuid, text, text, text, int, text) to authenticated;

-- 3. Cost of ownership ---------------------------------------------------------------
-- Money in and out for the asset over a period, by category and month, with
-- what is still not put against anything. Security invoker: the caller's
-- finance read rights apply.
create or replace function public.finance_summary(p_project_id uuid, p_from date, p_to date)
returns table (month date, category text, currency char(3), amount numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with scope as (select vessel_id, id from projects where id = p_project_id),
  tx as (
    select t.* from finance_transactions t, scope s
     where ((s.vessel_id is not null and t.vessel_id = s.vessel_id) or (s.vessel_id is null and t.project_id = s.id))
       and t.state in ('COMPLETED', 'PENDING')
       and t.booked_at >= p_from and t.booked_at < (p_to + 1)
  ),
  alloc as (
    select date_trunc('month', tx.booked_at)::date m, a.category, tx.currency,
           sign(tx.amount) * a.amount amt
      from finance_allocations a join tx on tx.id = a.transaction_id
     where a.removed_at is null
  ),
  rest as (
    select date_trunc('month', tx.booked_at)::date m,
           case when tx.amount < 0 then 'UNALLOCATED_OUT' else 'UNALLOCATED_IN' end::text category, tx.currency,
           sign(tx.amount) * (abs(tx.amount) - coalesce((select sum(a.amount) from finance_allocations a
                                                          where a.transaction_id = tx.id and a.removed_at is null), 0)) amt
      from tx
  )
  select m, category, currency, sum(amt) from (select * from alloc union all select * from rest where amt <> 0) x
   group by m, category, currency
   order by m, category;
$$;
revoke execute on function public.finance_summary(uuid, date, date) from anon, public;
grant execute on function public.finance_summary(uuid, date, date) to authenticated;

-- What has been spent on each thing in the model, for the cost of a part, a
-- work package or a system.
create or replace function public.finance_by_object(p_project_id uuid)
returns table (object_type object_type, object_id uuid, currency char(3), spent numeric, received numeric, transactions int)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with scope as (select vessel_id, id from projects where id = p_project_id)
  select a.object_type, a.object_id, t.currency,
         sum(case when t.amount < 0 then a.amount else 0 end),
         sum(case when t.amount > 0 then a.amount else 0 end),
         count(distinct t.id)::int
    from finance_allocations a
    join finance_transactions t on t.id = a.transaction_id, scope s
   where a.removed_at is null and a.object_type is not null
     and t.state in ('COMPLETED', 'PENDING')
     and ((s.vessel_id is not null and t.vessel_id = s.vessel_id) or (s.vessel_id is null and t.project_id = s.id))
   group by a.object_type, a.object_id, t.currency;
$$;
revoke execute on function public.finance_by_object(uuid) from anon, public;
grant execute on function public.finance_by_object(uuid) to authenticated;

-- 4. Permissions and registry -----------------------------------------------------------
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_create_finance_account', 'OWNER'), ('action_create_finance_account', 'OWNERS_REP'), ('action_create_finance_account', 'CAPTAIN'),
    ('action_import_transactions', 'OWNER'), ('action_import_transactions', 'OWNERS_REP'), ('action_import_transactions', 'CAPTAIN'),
    ('action_allocate_transaction', 'OWNER'), ('action_allocate_transaction', 'OWNERS_REP'), ('action_allocate_transaction', 'CAPTAIN')
  ) as p(k, r)
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values
  ('FINANCE_ACCOUNT', 'Finance account', 'finance_accounts', 'A bank, card or cash account kept for a vessel or property (Revolut Business, another bank). The money stays at the bank; this is its record. Readable only by the owner, the owner''s rep and the captain.', 40),
  ('FINANCE_TRANSACTION', 'Transaction', 'finance_transactions', 'A transaction as the bank reported it: date, signed amount, counterparty, state, and the bank''s row unchanged. Never edited by people; a bank-side change is recorded as an event.', 41),
  ('FINANCE_ALLOCATION', 'Allocation', 'finance_allocations', 'What (part of) a transaction paid for: a category and, usually, an object of the model (work package, part, NCR, service, Oil Record Book entry, log day, crew member). Removed with a reason, never deleted.', 42),
  ('FINANCE_IMPORT', 'Bank import', 'finance_imports', 'One import of bank rows (CSV or API): how many were new, changed by the bank, or already there.', 43),
  ('FINANCE_RECEIPT', 'Receipt', 'finance_receipts', 'A receipt or invoice behind a transaction, stored privately with its SHA-256 fingerprint.', 44)
on conflict (key) do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select f::object_type, t::object_type, l, c, v
  from (values
    ('FINANCE_TRANSACTION', 'FINANCE_ACCOUNT', 'was booked on', 'MANY_TO_ONE', 'account_id'),
    ('FINANCE_ALLOCATION', 'FINANCE_TRANSACTION', 'puts part of', 'MANY_TO_ONE', 'transaction_id'),
    ('FINANCE_RECEIPT', 'FINANCE_TRANSACTION', 'evidences', 'MANY_TO_ONE', 'transaction_id')
  ) as x(f, t, l, c, v)
 where not exists (select 1 from ontology_links ol where ol.from_type::text = x.f and ol.to_type::text = x.t and ol.via_column = x.v);

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_create_finance_account', 'Add a finance account', 'Adds a bank, card or cash account kept for the asset, with its currency.', 'FINANCE_ACCOUNT',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_name', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_provider', 'type', 'text', 'required', true, 'enum', jsonb_build_array('REVOLUT', 'BANK', 'CARD', 'CASH', 'ESCROW')),
     jsonb_build_object('name', 'p_currency', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_external_id', 'type', 'text')
   ), '{}', false),
  ('action_import_transactions', 'Import bank transactions', 'Imports bank rows into an account; rows already there are left alone, rows the bank changed are updated with the change recorded.', 'FINANCE_IMPORT',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_account_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_source', 'type', 'text', 'required', true),
     jsonb_build_object('name', 'p_rows', 'type', 'jsonb', 'required', true),
     jsonb_build_object('name', 'p_file_name', 'type', 'text')
   ), '{FINANCE_TRANSACTION}', false),
  ('action_allocate_transaction', 'Put money against what it paid for',
   'Puts (part of) a bank transaction against a category and, usually, an object of the model: WORK_PACKAGE, DEFECT_RECORD, CHANGE_ORDER, INSPECTION_EVENT, PROJECT, PART, SERVICE_RECORD, ORB_ENTRY (fuel bunkered), LOG_DAY (a day in port), CREW. Amounts are positive, in the account''s currency, and cannot exceed what is left of the transaction.',
   'FINANCE_ALLOCATION',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_transaction_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_amount', 'type', 'numeric', 'required', true),
     jsonb_build_object('name', 'p_category', 'type', 'text', 'required', true, 'enum', jsonb_build_array('FUEL', 'BERTHING', 'CREW', 'MAINTENANCE', 'REFIT', 'REPAIRS', 'INSURANCE', 'PROVISIONS', 'CHARTER_INCOME', 'TAXES_FEES', 'ADMIN', 'TRANSFER', 'OTHER')),
     jsonb_build_object('name', 'p_object_type', 'type', 'text'),
     jsonb_build_object('name', 'p_object_id', 'type', 'uuid'),
     jsonb_build_object('name', 'p_note', 'type', 'text')
   ), '{}', true),
  ('action_remove_allocation', 'Remove an allocation', 'Removes an allocation that was wrong, with the reason; it stays in the record.', 'FINANCE_ALLOCATION',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_allocation_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_reason', 'type', 'text', 'required', true)
   ), '{}', false),
  ('action_attach_receipt', 'Attach a receipt', 'Registers a receipt stored by the finance-files function against a transaction.', 'FINANCE_RECEIPT',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_transaction_id', 'type', 'uuid', 'required', true)
   ), '{}', false)
on conflict (key) do nothing;

-- 5. Private receipts bucket (no policies: reached only by finance-files) -----------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-receipts', 'finance-receipts', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;
