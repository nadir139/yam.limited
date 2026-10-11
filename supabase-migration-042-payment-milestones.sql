-- Migration 042: refit payments released against the model (finance, part 3).
--
-- A refit is paid in stages: 30% on signing, 30% when the hull is done, the
-- rest on sea trials. Today the yard asks by email, the owner's rep checks
-- by walking the boat, and the owner pays from Revolut. Here the stages are
-- written down once, each with the conditions the model can check -- a work
-- package complete, an inspection passed, no NCR open on it, a change order
-- approved, a date reached -- and a release goes:
--
--   PENDING -> RELEASE_REQUESTED (by the yard) -> APPROVED (owner side, with
--   the conditions as they stood, or an override with its reason) -> PAID
--   (when the owner's payment is seen in the ledger and matched to it)
--
-- Who holds the money. `holder` is OWNER_ACCOUNT: the money stays in the
-- owner's own account until they pay, and YAM records the agreement, the
-- conditions, the approvals and the payment. PARTNER_ESCROW (funds held by a
-- licensed escrow or safeguarding partner and released by these approvals)
-- is in the schema but refused until such a partner is contracted: YAM is
-- not licensed to hold client money and does not pretend to.
--
-- Who sees it: the owner side and the captain (finance readers), and the
-- YARD_PM of that project (the payee's side: their agreement, its stages and
-- conditions, never the owner's ledger). The history of every change is in
-- finance_events, which only finance readers read; the yard sees the names
-- and times kept on the milestone itself.
--
-- Applied to project xgpdfefxarllgykjbppn in steps: payments_0_enum,
-- payments_1_tables, payments_2_conditions, payments_3a_agreements, payments_3b_release,
-- payments_3c_paid_cancel,
-- payments_4_permissions_registry.

-- 0. Object types --------------------------------------------------------------------------
alter type object_type add value if not exists 'PAYMENT_AGREEMENT';
alter type object_type add value if not exists 'PAYMENT_MILESTONE';

-- 1. Tables ---------------------------------------------------------------------------------
create or replace function public.payment_can_read(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from projects p where p.id = p_project_id and can_read_finance(p.vessel_id, p.id))
      or current_actor_role(p_project_id) = 'YARD_PM';
$$;
revoke execute on function public.payment_can_read(uuid) from anon, public;
grant execute on function public.payment_can_read(uuid) to authenticated;

create table if not exists public.payment_agreements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  vessel_id uuid references public.vessels(id),
  title text not null check (length(trim(title)) >= 3),
  payee text not null check (length(trim(payee)) >= 2),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  holder text not null default 'OWNER_ACCOUNT' check (holder in ('OWNER_ACCOUNT', 'PARTNER_ESCROW')),
  -- ONE: the owner or the owner's rep approves a release. BOTH: one OWNER and
  -- one OWNERS_REP, two different people.
  approval_rule text not null default 'ONE' check (approval_rule in ('ONE', 'BOTH')),
  account_id uuid references public.finance_accounts(id),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  created_by_name text,
  activated_at timestamptz,
  activated_by_name text,
  cancelled_at timestamptz,
  cancelled_by_name text,
  cancelled_reason text
);
create index if not exists payment_agreements_project_idx on public.payment_agreements (project_id);

create table if not exists public.payment_milestones (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.payment_agreements(id),
  seq int not null,
  title text not null check (length(trim(title)) >= 3),
  amount numeric(14, 2) not null check (amount > 0),
  due_date date,
  -- [{type, id?, on?, text?}]; see payment_condition().
  conditions jsonb not null default '[]' check (jsonb_typeof(conditions) = 'array'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'RELEASE_REQUESTED', 'APPROVED', 'PAID', 'CANCELLED')),
  requested_at timestamptz,
  requested_by_name text,
  request_note text,
  -- [{role, name, at, note, override}] for the current request.
  approvals jsonb not null default '[]',
  approved_at timestamptz,
  -- Conditions as they stood when approved: what the decision was based on.
  approved_conditions jsonb,
  rejected_at timestamptz,
  rejected_by_name text,
  rejected_reason text,
  paid_transaction_id uuid references public.finance_transactions(id),
  paid_at timestamptz,
  paid_recorded_by_name text,
  cancelled_at timestamptz,
  cancelled_by_name text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  unique (agreement_id, seq)
);

alter table public.payment_agreements enable row level security;
alter table public.payment_milestones enable row level security;
create policy payment_agreements_read on public.payment_agreements for select using (payment_can_read(project_id));
create policy payment_milestones_read on public.payment_milestones for select
  using (exists (select 1 from payment_agreements a where a.id = agreement_id and payment_can_read(a.project_id)));
revoke all on public.payment_agreements, public.payment_milestones from anon, authenticated;
grant select on public.payment_agreements, public.payment_milestones to authenticated;

-- 2. Conditions ------------------------------------------------------------------------------
-- One condition, checked against the model now:
--   {type: WORK_PACKAGE_COMPLETE, id}  the work package's status is COMPLETE
--   {type: INSPECTION_PASSED, id}      the inspection's result is PASS (CONDITIONAL_PASS
--                                      counts, and says so)
--   {type: NO_OPEN_NCR, id}            no NCR on that work package is still open
--   {type: CHANGE_ORDER_APPROVED, id}  the change order is APPROVED or IMPLEMENTED
--   {type: DATE, on}                   that day has come
--   {type: MANUAL, text}               something only a person can judge; the
--                                      approver's approval is the check
-- Returns {type, id, label, met, detail}; met is null for MANUAL.
create or replace function public.payment_condition(p_project_id uuid, p_c jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text := upper(coalesce(p_c ->> 'type', ''));
  v_id uuid;
  v_wp work_packages;
  v_ie inspection_events;
  v_co change_orders;
  v_open int;
  v_on date;
begin
  if v_type in ('WORK_PACKAGE_COMPLETE', 'INSPECTION_PASSED', 'NO_OPEN_NCR', 'CHANGE_ORDER_APPROVED') then
    begin
      v_id := (p_c ->> 'id')::uuid;
    exception when others then
      raise exception 'A % condition needs the id of what it is about', v_type using errcode = 'P0001';
    end;
  end if;
  if v_type = 'WORK_PACKAGE_COMPLETE' then
    select * into v_wp from work_packages where id = v_id and project_id = p_project_id;
    if not found then raise exception 'No work package % on this project', v_id using errcode = 'P0001'; end if;
    return jsonb_build_object('type', v_type, 'id', v_id, 'label', v_wp.wp_number || ' ' || v_wp.title || ' complete',
      'met', v_wp.status = 'COMPLETE', 'detail', 'status ' || v_wp.status);
  elsif v_type = 'INSPECTION_PASSED' then
    select * into v_ie from inspection_events where id = v_id and project_id = p_project_id;
    if not found then raise exception 'No inspection % on this project', v_id using errcode = 'P0001'; end if;
    return jsonb_build_object('type', v_type, 'id', v_id,
      'label', coalesce(v_ie.inspection_number || ' ', '') || v_ie.title || ' passed',
      'met', v_ie.result in ('PASS', 'CONDITIONAL_PASS'),
      'detail', 'result ' || coalesce(v_ie.result::text, 'PENDING') || case when v_ie.result = 'CONDITIONAL_PASS' then ' (conditional)' else '' end);
  elsif v_type = 'NO_OPEN_NCR' then
    select * into v_wp from work_packages where id = v_id and project_id = p_project_id;
    if not found then raise exception 'No work package % on this project', v_id using errcode = 'P0001'; end if;
    select count(*) into v_open from defect_records where work_package_id = v_id and status <> 'CLOSED';
    return jsonb_build_object('type', v_type, 'id', v_id, 'label', 'No open NCR on ' || v_wp.wp_number,
      'met', v_open = 0, 'detail', v_open || ' open');
  elsif v_type = 'CHANGE_ORDER_APPROVED' then
    select * into v_co from change_orders where id = v_id and project_id = p_project_id;
    if not found then raise exception 'No change order % on this project', v_id using errcode = 'P0001'; end if;
    return jsonb_build_object('type', v_type, 'id', v_id, 'label', v_co.co_number || ' ' || v_co.title || ' approved',
      'met', v_co.status in ('APPROVED', 'IMPLEMENTED'), 'detail', 'status ' || v_co.status);
  elsif v_type = 'DATE' then
    begin
      v_on := (p_c ->> 'on')::date;
    exception when others then
      raise exception 'A DATE condition needs a day (YYYY-MM-DD)' using errcode = 'P0001';
    end;
    if v_on is null then raise exception 'A DATE condition needs a day (YYYY-MM-DD)' using errcode = 'P0001'; end if;
    return jsonb_build_object('type', v_type, 'on', v_on, 'label', 'On or after ' || v_on, 'met', current_date >= v_on, 'detail', null);
  elsif v_type = 'MANUAL' then
    if length(trim(coalesce(p_c ->> 'text', ''))) < 3 then
      raise exception 'A MANUAL condition says what has to be true' using errcode = 'P0001';
    end if;
    return jsonb_build_object('type', v_type, 'label', trim(p_c ->> 'text'), 'met', null, 'detail', 'judged by the approver');
  end if;
  raise exception 'Unknown condition %: WORK_PACKAGE_COMPLETE, INSPECTION_PASSED, NO_OPEN_NCR, CHANGE_ORDER_APPROVED, DATE or MANUAL', v_type
    using errcode = 'P0001';
end;
$$;
revoke execute on function public.payment_condition(uuid, jsonb) from anon, public;

-- Every agreement of the project with its stages and their conditions as
-- they stand now. What the Payments page and the agent read.
create or replace function public.payment_status(p_project_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not payment_can_read(p_project_id) then
    raise exception 'Payments are seen by the owner, the owner''s rep, the captain and the yard''s PM' using errcode = 'P0001';
  end if;
  return coalesce((
    select json_agg(json_build_object(
      'agreement', to_jsonb(a),
      'milestones', coalesce((
        select json_agg(json_build_object(
          'milestone', to_jsonb(m) - 'paid_transaction_id',
          'paid', m.paid_transaction_id is not null,
          'conditions', (select coalesce(jsonb_agg(payment_condition(a.project_id, c) order by ord), '[]')
                           from jsonb_array_elements(m.conditions) with ordinality as x(c, ord)),
          'all_met', not exists (select 1 from jsonb_array_elements(m.conditions) c
                                  where (payment_condition(a.project_id, c) ->> 'met') = 'false')
        ) order by m.seq)
        from payment_milestones m where m.agreement_id = a.id), '[]'),
      'total', (select coalesce(sum(amount), 0) from payment_milestones m where m.agreement_id = a.id and m.status <> 'CANCELLED'),
      'paid', (select coalesce(sum(amount), 0) from payment_milestones m where m.agreement_id = a.id and m.status = 'PAID')
    ) order by a.created_at)
    from payment_agreements a where a.project_id = p_project_id), '[]');
end;
$$;
revoke execute on function public.payment_status(uuid) from anon, public;
grant execute on function public.payment_status(uuid) to authenticated;

-- 3. Actions -----------------------------------------------------------------------------------
create or replace function public.require_payment_side(p_project_id uuid)
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
  if not found or not payment_can_read(p_project_id) then
    raise exception 'Payments are seen by the owner, the owner''s rep, the captain and the yard''s PM' using errcode = 'P0001';
  end if;
  return v_project;
end;
$$;
revoke execute on function public.require_payment_side(uuid) from anon, public;

create or replace function public.action_create_payment_agreement(
  p_project_id uuid, p_title text, p_payee text, p_currency text,
  p_approval_rule text default 'ONE', p_account_id uuid default null, p_holder text default 'OWNER_ACCOUNT'
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_project projects;
  v_after payment_agreements;
begin
  perform require_permission('action_create_payment_agreement', v_project_id);
  v_project := require_finance(v_project_id);
  if upper(coalesce(p_holder, 'OWNER_ACCOUNT')) = 'PARTNER_ESCROW' then
    raise exception 'Money held by an escrow partner is not available yet: YAM has no licensed partner contracted. Use OWNER_ACCOUNT: the money stays in the owner''s account until paid.'
      using errcode = 'P0001';
  end if;
  if upper(coalesce(p_currency, '')) !~ '^[A-Z]{3}$' then
    raise exception 'The currency is a three-letter code' using errcode = 'P0001';
  end if;
  if upper(coalesce(p_approval_rule, 'ONE')) not in ('ONE', 'BOTH') then
    raise exception 'Approval is ONE (owner or owner''s rep) or BOTH (owner and owner''s rep)' using errcode = 'P0001';
  end if;
  if p_account_id is not null and not exists (
    select 1 from finance_accounts f where f.id = p_account_id and f.currency = upper(p_currency)
       and ((v_project.vessel_id is not null and f.vessel_id = v_project.vessel_id) or f.project_id = v_project_id)) then
    raise exception 'That account is not one of this asset''s accounts in %', upper(p_currency) using errcode = 'P0001';
  end if;
  insert into payment_agreements (project_id, vessel_id, title, payee, currency, approval_rule, account_id, created_by_name)
  values (v_project_id, v_project.vessel_id, trim(p_title), trim(p_payee), upper(p_currency), upper(coalesce(p_approval_rule, 'ONE')),
          p_account_id, current_actor_name())
  returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_AGREEMENT_CREATED', 'PAYMENT_AGREEMENT', v_after.id, null, to_jsonb(v_after));
  return json_build_object('agreement', row_to_json(v_after));
end;
$$;

create or replace function public.action_add_payment_milestone(
  p_project_id uuid, p_agreement_id uuid, p_title text, p_amount numeric,
  p_conditions jsonb default '[]', p_due_date date default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_a payment_agreements;
  v_after payment_milestones;
  v_c jsonb;
begin
  perform require_permission('action_add_payment_milestone', v_project_id);
  perform require_finance(v_project_id);
  select * into v_a from payment_agreements where id = p_agreement_id and project_id = v_project_id for update;
  if not found then raise exception 'No payment agreement with that id on this project' using errcode = 'P0001'; end if;
  if v_a.status <> 'DRAFT' then
    raise exception 'The agreement is %: stages are fixed once it is agreed', lower(v_a.status) using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'The amount must be more than zero' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_conditions, '[]')) <> 'array' then
    raise exception 'Conditions are a list' using errcode = 'P0001';
  end if;
  -- Each condition is checked now, so one naming a work package that is not
  -- on this project is refused at once rather than failing at release.
  for v_c in select * from jsonb_array_elements(coalesce(p_conditions, '[]')) loop
    perform payment_condition(v_project_id, v_c);
  end loop;
  insert into payment_milestones (agreement_id, seq, title, amount, due_date, conditions)
  values (v_a.id, coalesce((select max(seq) from payment_milestones where agreement_id = v_a.id), 0) + 1,
          trim(p_title), round(p_amount, 2), p_due_date, coalesce(p_conditions, '[]'))
  returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_MILESTONE_ADDED', 'PAYMENT_MILESTONE', v_after.id, null, to_jsonb(v_after));
  return json_build_object('milestone', row_to_json(v_after));
end;
$$;

-- Agreed: from now the stages, amounts and conditions are fixed; a change
-- is a cancelled stage and a new agreement, never an edit.
create or replace function public.action_activate_payment_agreement(p_project_id uuid, p_agreement_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_before payment_agreements;
  v_after payment_agreements;
begin
  perform require_permission('action_activate_payment_agreement', v_project_id);
  perform require_finance(v_project_id);
  select * into v_before from payment_agreements where id = p_agreement_id and project_id = v_project_id for update;
  if not found then raise exception 'No payment agreement with that id on this project' using errcode = 'P0001'; end if;
  if v_before.status <> 'DRAFT' then raise exception 'The agreement is already %', lower(v_before.status) using errcode = 'P0001'; end if;
  if not exists (select 1 from payment_milestones where agreement_id = v_before.id) then
    raise exception 'Add the stages before agreeing it' using errcode = 'P0001';
  end if;
  update payment_agreements set status = 'ACTIVE', activated_at = now(), activated_by_name = current_actor_name()
   where id = v_before.id returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_AGREEMENT_ACTIVATED', 'PAYMENT_AGREEMENT', v_after.id, to_jsonb(v_before), to_jsonb(v_after));
  return json_build_object('agreement', row_to_json(v_after));
end;
$$;

-- The yard asks for a stage to be released.
create or replace function public.action_request_release(p_project_id uuid, p_milestone_id uuid, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_m payment_milestones;
  v_a payment_agreements;
  v_after payment_milestones;
begin
  perform require_permission('action_request_release', v_project_id);
  perform require_payment_side(v_project_id);
  select m.* into v_m from payment_milestones m join payment_agreements a on a.id = m.agreement_id
   where m.id = p_milestone_id and a.project_id = v_project_id for update of m;
  if not found then raise exception 'No payment stage with that id on this project' using errcode = 'P0001'; end if;
  select * into v_a from payment_agreements where id = v_m.agreement_id;
  if v_a.status <> 'ACTIVE' then raise exception 'The agreement is %, not agreed', lower(v_a.status) using errcode = 'P0001'; end if;
  if v_m.status <> 'PENDING' then raise exception 'That stage is %', lower(replace(v_m.status, '_', ' ')) using errcode = 'P0001'; end if;
  update payment_milestones set status = 'RELEASE_REQUESTED', requested_at = now(), requested_by_name = current_actor_name(),
         request_note = nullif(trim(coalesce(p_note, '')), ''), approvals = '[]', approved_at = null
   where id = v_m.id returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_RELEASE_REQUESTED', 'PAYMENT_MILESTONE', v_after.id, to_jsonb(v_m), to_jsonb(v_after));
  return json_build_object('milestone', row_to_json(v_after));
end;
$$;

-- The owner side approves. Every condition the model can check must be met,
-- or the approver overrides with a reason; the conditions as they stood are
-- kept with the approval. Under BOTH, the second approval must come from the
-- other role and another person.
create or replace function public.action_approve_release(
  p_project_id uuid, p_milestone_id uuid, p_note text default null, p_override_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_role user_role := current_actor_role(v_project_id);
  v_name text := current_actor_name();
  v_m payment_milestones;
  v_a payment_agreements;
  v_after payment_milestones;
  v_checked jsonb;
  v_unmet jsonb;
  v_approvals jsonb;
  v_done boolean;
begin
  perform require_permission('action_approve_release', v_project_id);
  perform require_finance(v_project_id);
  select m.* into v_m from payment_milestones m join payment_agreements a on a.id = m.agreement_id
   where m.id = p_milestone_id and a.project_id = v_project_id for update of m;
  if not found then raise exception 'No payment stage with that id on this project' using errcode = 'P0001'; end if;
  select * into v_a from payment_agreements where id = v_m.agreement_id;
  if v_m.status <> 'RELEASE_REQUESTED' then
    raise exception 'That stage is %: only a requested release is approved', lower(replace(v_m.status, '_', ' ')) using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(payment_condition(v_project_id, c)), '[]') into v_checked from jsonb_array_elements(v_m.conditions) c;
  select coalesce(jsonb_agg(c), '[]') into v_unmet from jsonb_array_elements(v_checked) c where (c ->> 'met') = 'false';
  if jsonb_array_length(v_unmet) > 0 and length(trim(coalesce(p_override_reason, ''))) < 5 then
    raise exception 'Not met yet: %. Approve anyway only with a reason.',
      (select string_agg(c ->> 'label', '; ') from jsonb_array_elements(v_unmet) c) using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(v_m.approvals) x where x ->> 'name' = v_name) then
    raise exception 'You have already approved this release' using errcode = 'P0001';
  end if;
  if v_a.approval_rule = 'BOTH' and exists (select 1 from jsonb_array_elements(v_m.approvals) x where x ->> 'role' = v_role::text) then
    raise exception 'This agreement needs the owner and the owner''s rep: the other one approves next' using errcode = 'P0001';
  end if;
  v_approvals := v_m.approvals || jsonb_build_array(jsonb_build_object(
    'role', v_role, 'name', v_name, 'at', now(), 'note', nullif(trim(coalesce(p_note, '')), ''),
    'override', nullif(trim(coalesce(p_override_reason, '')), ''), 'conditions', v_checked));
  v_done := v_a.approval_rule = 'ONE'
    or (exists (select 1 from jsonb_array_elements(v_approvals) x where x ->> 'role' = 'OWNER')
        and exists (select 1 from jsonb_array_elements(v_approvals) x where x ->> 'role' = 'OWNERS_REP'));
  update payment_milestones set approvals = v_approvals,
         status = case when v_done then 'APPROVED' else status end,
         approved_at = case when v_done then now() else null end,
         approved_conditions = case when v_done then v_checked else null end
   where id = v_m.id returning * into v_after;
  perform finance_event(v_project_id, case when v_done then 'PAYMENT_RELEASE_APPROVED' else 'PAYMENT_RELEASE_APPROVAL_ADDED' end,
    'PAYMENT_MILESTONE', v_after.id, to_jsonb(v_m), to_jsonb(v_after));
  return json_build_object('milestone', row_to_json(v_after), 'approved', v_done);
end;
$$;

create or replace function public.action_reject_release(p_project_id uuid, p_milestone_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_m payment_milestones;
  v_after payment_milestones;
begin
  perform require_permission('action_reject_release', v_project_id);
  perform require_finance(v_project_id);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why it is not released' using errcode = 'P0001'; end if;
  select m.* into v_m from payment_milestones m join payment_agreements a on a.id = m.agreement_id
   where m.id = p_milestone_id and a.project_id = v_project_id for update of m;
  if not found then raise exception 'No payment stage with that id on this project' using errcode = 'P0001'; end if;
  if v_m.status <> 'RELEASE_REQUESTED' then
    raise exception 'That stage is %', lower(replace(v_m.status, '_', ' ')) using errcode = 'P0001';
  end if;
  update payment_milestones set status = 'PENDING', rejected_at = now(), rejected_by_name = current_actor_name(),
         rejected_reason = trim(p_reason), approvals = '[]'
   where id = v_m.id returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_RELEASE_REJECTED', 'PAYMENT_MILESTONE', v_after.id, to_jsonb(v_m), to_jsonb(v_after));
  return json_build_object('milestone', row_to_json(v_after));
end;
$$;

-- The owner paid: the transaction in the ledger is matched to the stage and
-- the stage's amount is put against it (REFIT, on the stage's first work
-- package when it has one, else the project), through the ordinary
-- allocation, so the ledger and the stage say the same thing.
create or replace function public.action_record_milestone_payment(p_project_id uuid, p_milestone_id uuid, p_transaction_id uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_m payment_milestones;
  v_a payment_agreements;
  v_tx finance_transactions;
  v_after payment_milestones;
  v_wp uuid;
begin
  perform require_permission('action_record_milestone_payment', v_project_id);
  perform require_finance(v_project_id);
  select m.* into v_m from payment_milestones m join payment_agreements a on a.id = m.agreement_id
   where m.id = p_milestone_id and a.project_id = v_project_id for update of m;
  if not found then raise exception 'No payment stage with that id on this project' using errcode = 'P0001'; end if;
  select * into v_a from payment_agreements where id = v_m.agreement_id;
  if v_m.status <> 'APPROVED' then
    raise exception 'That stage is %: a payment is recorded against an approved release', lower(replace(v_m.status, '_', ' '))
      using errcode = 'P0001';
  end if;
  select * into v_tx from finance_transactions where id = p_transaction_id;
  if not found or not can_read_finance(v_tx.vessel_id, v_tx.project_id) then
    raise exception 'No transaction with that id you keep' using errcode = 'P0001';
  end if;
  if v_tx.amount >= 0 or v_tx.state in ('DECLINED', 'FAILED', 'REVERTED') then
    raise exception 'That transaction is not money paid out' using errcode = 'P0001';
  end if;
  if v_tx.currency <> v_a.currency then
    raise exception 'The stage is in %, the payment in %', v_a.currency, v_tx.currency using errcode = 'P0001';
  end if;
  if exists (select 1 from payment_milestones where paid_transaction_id = v_tx.id) then
    raise exception 'That transaction already pays another stage' using errcode = 'P0001';
  end if;
  select (c ->> 'id')::uuid into v_wp from jsonb_array_elements(v_m.conditions) c
   where c ->> 'type' in ('WORK_PACKAGE_COMPLETE', 'NO_OPEN_NCR') limit 1;
  -- Raises if the transaction has less than the stage's amount left.
  perform action_allocate_transaction(v_project_id, v_tx.id, v_m.amount, 'REFIT',
    case when v_wp is null then 'PROJECT' else 'WORK_PACKAGE' end, coalesce(v_wp, v_project_id),
    'Payment stage ' || v_m.seq || ': ' || v_m.title);
  update payment_milestones set status = 'PAID', paid_transaction_id = v_tx.id, paid_at = v_tx.booked_at,
         paid_recorded_by_name = current_actor_name()
   where id = v_m.id returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_MILESTONE_PAID', 'PAYMENT_MILESTONE', v_after.id, to_jsonb(v_m), to_jsonb(v_after));
  if not exists (select 1 from payment_milestones where agreement_id = v_a.id and status not in ('PAID', 'CANCELLED')) then
    update payment_agreements set status = 'CLOSED' where id = v_a.id;
    perform finance_event(v_project_id, 'PAYMENT_AGREEMENT_CLOSED', 'PAYMENT_AGREEMENT', v_a.id, null, jsonb_build_object('status', 'CLOSED'));
  end if;
  return json_build_object('milestone', row_to_json(v_after));
end;
$$;

create or replace function public.action_cancel_payment_milestone(p_project_id uuid, p_milestone_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := resolve_project(p_project_id);
  v_m payment_milestones;
  v_after payment_milestones;
begin
  perform require_permission('action_cancel_payment_milestone', v_project_id);
  perform require_finance(v_project_id);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why the stage is cancelled' using errcode = 'P0001'; end if;
  select m.* into v_m from payment_milestones m join payment_agreements a on a.id = m.agreement_id
   where m.id = p_milestone_id and a.project_id = v_project_id for update of m;
  if not found then raise exception 'No payment stage with that id on this project' using errcode = 'P0001'; end if;
  if v_m.status in ('PAID', 'CANCELLED') then
    raise exception 'That stage is already %', lower(v_m.status) using errcode = 'P0001';
  end if;
  update payment_milestones set status = 'CANCELLED', cancelled_at = now(), cancelled_by_name = current_actor_name(),
         cancelled_reason = trim(p_reason)
   where id = v_m.id returning * into v_after;
  perform finance_event(v_project_id, 'PAYMENT_MILESTONE_CANCELLED', 'PAYMENT_MILESTONE', v_after.id, to_jsonb(v_m), to_jsonb(v_after));
  return json_build_object('milestone', row_to_json(v_after));
end;
$$;

-- 4. Permissions and registry ----------------------------------------------------------------------
insert into action_permissions (action_key, role)
select k, r::user_role
  from (values
    ('action_create_payment_agreement', 'OWNER'), ('action_create_payment_agreement', 'OWNERS_REP'),
    ('action_add_payment_milestone', 'OWNER'), ('action_add_payment_milestone', 'OWNERS_REP'),
    ('action_activate_payment_agreement', 'OWNER'), ('action_activate_payment_agreement', 'OWNERS_REP'),
    ('action_request_release', 'YARD_PM'), ('action_request_release', 'OWNERS_REP'),
    ('action_approve_release', 'OWNER'), ('action_approve_release', 'OWNERS_REP'),
    ('action_reject_release', 'OWNER'), ('action_reject_release', 'OWNERS_REP'),
    ('action_record_milestone_payment', 'OWNER'), ('action_record_milestone_payment', 'OWNERS_REP'),
    ('action_cancel_payment_milestone', 'OWNER'), ('action_cancel_payment_milestone', 'OWNERS_REP')
  ) as p(k, r)
on conflict do nothing;

insert into ontology_object_types (key, label, table_name, description, display_order)
values
  ('PAYMENT_AGREEMENT', 'Payment agreement', 'payment_agreements',
   'How a refit is paid: the payee, the currency, who approves releases (the owner or the owner''s rep, or both) and who holds the money (today always the owner''s own account). Seen by the owner side, the captain and the yard''s PM.', 47),
  ('PAYMENT_MILESTONE', 'Payment stage', 'payment_milestones',
   'One stage of a payment agreement: amount, due date, and conditions the model checks (work package complete, inspection passed, no open NCR, change order approved, a date). Released PENDING -> RELEASE_REQUESTED -> APPROVED -> PAID, the payment matched to a bank transaction.', 48)
on conflict do nothing;

insert into ontology_links (from_type, to_type, label, cardinality, via_column)
select x.f::object_type, x.t::object_type, x.l, x.c, x.v
  from (values
    ('PAYMENT_MILESTONE', 'PAYMENT_AGREEMENT', 'is a stage of', 'MANY_TO_ONE', 'agreement_id'),
    ('PAYMENT_MILESTONE', 'FINANCE_TRANSACTION', 'was paid by', 'MANY_TO_ONE', 'paid_transaction_id'),
    ('PAYMENT_AGREEMENT', 'FINANCE_ACCOUNT', 'is paid from', 'MANY_TO_ONE', 'account_id')
  ) as x(f, t, l, c, v)
 where not exists (select 1 from ontology_links ol where ol.from_type::text = x.f and ol.to_type::text = x.t and ol.via_column = x.v);

insert into ontology_actions (key, label, description, target_type, parameters, cascades, is_agent_usable)
values
  ('action_request_release', 'Ask for a payment stage to be released',
   'The yard asks for a stage of a payment agreement to be released. The owner side then approves it against the stage''s conditions.', 'PAYMENT_MILESTONE',
   jsonb_build_array(
     jsonb_build_object('name', 'p_project_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_milestone_id', 'type', 'uuid', 'required', true),
     jsonb_build_object('name', 'p_note', 'type', 'text')
   ), '{}', true)
on conflict (key) do nothing;
