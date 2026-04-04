-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — WORLD MODEL SCHEMA
-- Run this in your Supabase SQL editor (supabase.com → project → SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

create type project_phase as enum (
  'PRE_SURVEY', 'HAUL_OUT', 'STRUCTURAL', 'SYSTEMS', 'INTERIOR', 'SEA_TRIALS', 'DELIVERED'
);
create type project_type as enum (
  'FIVE_YEAR_SURVEY', 'REFIT', 'NEWBUILD', 'ANNUAL_SURVEY', 'DAMAGE_REPAIR'
);
create type work_package_status as enum (
  'DRAFT', 'SCOPED', 'ACTIVE', 'EXPANDED', 'ON_HOLD', 'COMPLETE'
);
create type discipline as enum (
  'STRUCTURAL', 'HULL', 'MECHANICAL', 'ELECTRICAL', 'RIGGING', 'INTERIOR', 'PAINT', 'CLASS', 'SAFETY'
);
create type defect_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type defect_status as enum (
  'OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'DISPUTED'
);
create type root_cause as enum (
  'WEAR', 'CORROSION', 'IMPACT', 'FATIGUE', 'INSTALLATION_ERROR',
  'DESIGN_DEFICIENCY', 'MOISTURE_INGRESS', 'OTHER'
);
create type disposition as enum ('REPAIR', 'REPLACE', 'MONITOR', 'ACCEPT_AS_IS', 'PENDING');
create type change_order_trigger as enum (
  'CLASS_REQUIREMENT', 'OWNER_REQUEST', 'DEFECT_DISCOVERY', 'SCOPE_GROWTH', 'REGULATORY'
);
create type change_order_status as enum (
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'IMPLEMENTED'
);
create type approval_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');
create type approval_tier as enum ('TIER_1', 'TIER_2', 'TIER_3');
create type class_society as enum ('LLOYDS', 'BV', 'RINA', 'DNV', 'ABS', 'OTHER');
create type user_role as enum (
  'OWNERS_REP', 'OWNER', 'CAPTAIN', 'YARD_PM', 'CLASS_SURVEYOR', 'SUBCONTRACTOR', 'NAVAL_ARCHITECT'
);
create type inspection_result as enum ('PASS', 'CONDITIONAL_PASS', 'FAIL', 'PENDING');
create type document_status as enum ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SUPERSEDED');
create type doc_type as enum (
  'SURVEY_REPORT', 'CLASS_CERTIFICATE', 'DRAWING', 'SPECIFICATION',
  'NCR', 'CHANGE_ORDER', 'APPROVAL', 'CORRESPONDENCE', 'PHOTO', 'OTHER'
);
create type object_type as enum (
  'VESSEL', 'PROJECT', 'WORK_PACKAGE', 'CHANGE_ORDER',
  'INSPECTION_EVENT', 'DEFECT_RECORD', 'OWNER_APPROVAL', 'DOCUMENT', 'SUBCONTRACTOR'
);

-- ─── VESSELS ──────────────────────────────────────────────────────────────────

create table vessels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  hull_id text not null unique,
  vessel_type text not null,
  loa numeric(6,2) not null,
  beam numeric(5,2),
  draft numeric(5,2),
  gross_tonnage numeric(8,2),
  flag_state text not null,
  class_society class_society not null,
  class_number text,
  year_built integer,
  build_yard text,
  created_at timestamptz default now()
);

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────

create table projects (
  id uuid primary key default uuid_generate_v4(),
  vessel_id uuid not null references vessels(id) on delete cascade,
  name text not null,
  project_type project_type not null,
  phase project_phase not null default 'PRE_SURVEY',
  yard_name text,
  yard_location text,
  planned_start date,
  planned_delivery date,
  actual_start date,
  actual_delivery date,
  budget_locked numeric(12,2) default 0,
  budget_spent numeric(12,2) default 0,
  budget_contingency numeric(12,2) default 0,
  class_society class_society,
  survey_due_date date,
  created_at timestamptz default now()
);

-- ─── PROJECT MEMBERS ──────────────────────────────────────────────────────────

create table project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role user_role not null,
  name text not null,
  email text not null,
  company text,
  created_at timestamptz default now(),
  unique(project_id, email)
);

-- ─── WORK PACKAGES ────────────────────────────────────────────────────────────

create table work_packages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  wp_number text not null,
  title text not null,
  discipline discipline not null,
  description text,
  status work_package_status not null default 'DRAFT',
  planned_hours numeric(8,2) default 0,
  actual_hours numeric(8,2) default 0,
  planned_cost numeric(12,2) default 0,
  actual_cost numeric(12,2) default 0,
  trade_contractor text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  is_class_item boolean default false,
  class_society class_society,
  class_item_ref text,
  created_at timestamptz default now(),
  unique(project_id, wp_number)
);

-- ─── INSPECTION EVENTS ────────────────────────────────────────────────────────

create table inspection_events (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  work_package_id uuid references work_packages(id) on delete set null,
  inspection_number text not null,
  title text not null,
  inspector_role text not null,
  inspector_name text,
  scheduled_date date,
  actual_date date,
  result inspection_result not null default 'PENDING',
  notes text,
  is_class_inspection boolean default false,
  class_item_ref text,
  defect_count integer default 0,
  created_at timestamptz default now(),
  unique(project_id, inspection_number)
);

-- ─── DEFECT RECORDS ───────────────────────────────────────────────────────────

create table defect_records (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  inspection_event_id uuid references inspection_events(id) on delete set null,
  work_package_id uuid references work_packages(id) on delete set null,
  ncr_number text not null,
  title text not null,
  description text,
  location_on_vessel text,
  severity defect_severity not null,
  status defect_status not null default 'OPEN',
  root_cause root_cause not null default 'OTHER',
  disposition disposition not null default 'PENDING',
  is_class_defect boolean default false,
  class_item_ref text,
  discovered_by text,
  discovered_date date not null default current_date,
  closed_date date,
  cost_impact numeric(12,2),
  schedule_impact_days integer,
  change_order_id uuid, -- set after CO created
  created_at timestamptz default now(),
  unique(project_id, ncr_number)
);

-- ─── CHANGE ORDERS ────────────────────────────────────────────────────────────

create table change_orders (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  co_number text not null,
  title text not null,
  description text,
  trigger_type change_order_trigger not null,
  status change_order_status not null default 'DRAFT',
  cost_delta numeric(12,2) not null default 0,
  schedule_delta_days integer not null default 0,
  raised_by text not null,
  raised_date date not null default current_date,
  defect_record_id uuid references defect_records(id) on delete set null,
  approval_id uuid, -- set after approval created
  created_at timestamptz default now(),
  unique(project_id, co_number)
);

-- Add FK back to defect_records (circular, set after both tables exist)
alter table defect_records
  add constraint defect_records_change_order_id_fkey
  foreign key (change_order_id) references change_orders(id) on delete set null;

-- ─── OWNER APPROVALS ──────────────────────────────────────────────────────────

create table owner_approvals (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  approval_number text not null,
  title text not null,
  description text,
  tier approval_tier not null,
  status approval_status not null default 'PENDING',
  requested_by text not null,
  requested_date date not null default current_date,
  approver_name text,
  decision_date date,
  decision_notes text,
  change_order_id uuid references change_orders(id) on delete set null,
  cost_amount numeric(12,2) not null default 0,
  deadline date,
  created_at timestamptz default now(),
  unique(project_id, approval_number)
);

-- Add FK back to change_orders
alter table change_orders
  add constraint change_orders_approval_id_fkey
  foreign key (approval_id) references owner_approvals(id) on delete set null;

-- ─── DOCUMENTS ────────────────────────────────────────────────────────────────

create table documents (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  doc_number text not null,
  title text not null,
  doc_type doc_type not null,
  revision text not null default 'A',
  status document_status not null default 'DRAFT',
  file_url text,
  file_size integer,
  mime_type text,
  uploaded_by text not null,
  uploaded_date date not null default current_date,
  linked_object_type object_type,
  linked_object_id uuid,
  is_class_document boolean default false,
  created_at timestamptz default now(),
  unique(project_id, doc_number)
);

-- ─── WORLD MODEL EVENT LOG ────────────────────────────────────────────────────
-- Append-only. Every state change is recorded here.
-- This is the honest signal — the audit trail of the project's reality.

create table world_model_events (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  event_type text not null,          -- e.g. 'DEFECT_RAISED', 'CO_APPROVED', 'WP_STATUS_CHANGED'
  object_type object_type not null,
  object_id uuid not null,
  before_state jsonb,
  after_state jsonb not null,
  triggered_by uuid references auth.users(id) on delete set null,
  triggered_by_name text,            -- denormalized for display
  triggered_at timestamptz default now(),
  cascade_from_event_id uuid references world_model_events(id) on delete set null
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table vessels enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table work_packages enable row level security;
alter table inspection_events enable row level security;
alter table defect_records enable row level security;
alter table change_orders enable row level security;
alter table owner_approvals enable row level security;
alter table documents enable row level security;
alter table world_model_events enable row level security;

-- Members can read everything in their projects
create policy "project_member_read" on projects
  for select using (
    id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on work_packages
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on inspection_events
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on defect_records
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on change_orders
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on owner_approvals
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on documents
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

create policy "project_member_read" on world_model_events
  for select using (
    project_id in (select project_id from project_members where user_id = auth.uid())
  );

-- Only OWNERS_REP and YARD_PM can write most objects
create policy "rep_write_work_packages" on work_packages
  for all using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid()
      and role in ('OWNERS_REP', 'YARD_PM', 'NAVAL_ARCHITECT')
    )
  );

create policy "rep_write_defects" on defect_records
  for all using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid()
      and role in ('OWNERS_REP', 'YARD_PM', 'CLASS_SURVEYOR')
    )
  );

create policy "rep_write_change_orders" on change_orders
  for all using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid()
      and role in ('OWNERS_REP', 'NAVAL_ARCHITECT')
    )
  );

-- Only OWNER and OWNERS_REP can write approvals
create policy "owner_write_approvals" on owner_approvals
  for all using (
    project_id in (
      select project_id from project_members
      where user_id = auth.uid()
      and role in ('OWNER', 'OWNERS_REP')
    )
  );

-- ─── INDEXES ──────────────────────────────────────────────────────────────────

create index on work_packages(project_id);
create index on inspection_events(project_id);
create index on defect_records(project_id);
create index on defect_records(status);
create index on change_orders(project_id);
create index on owner_approvals(project_id, status);
create index on documents(project_id);
create index on world_model_events(project_id, triggered_at desc);
create index on world_model_events(object_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Next step: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
-- and swap mock-data imports for live Supabase queries.
-- ─────────────────────────────────────────────────────────────────────────────
