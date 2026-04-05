-- ─────────────────────────────────────────────────────────────────────────────
-- YAM APP — SEED DATA
-- Run this in the Supabase SQL editor after the schema and migration-001.
-- Uses fixed UUIDs so it is safe to run multiple times (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── VESSEL ───────────────────────────────────────────────────────────────────

INSERT INTO vessels (id, name, hull_id, vessel_type, loa, beam, draft, gross_tonnage, flag_state, class_society, class_number, year_built, build_yard, created_at)
VALUES (
  'a1b2c3d4-0001-0000-0000-000000000001',
  'Project ZERO',
  'PZ-55K-2008',
  'Sailing Yacht Ketch',
  55.00,
  10.20,
  4.80,
  498.00,
  'Cayman Islands',
  'RINA',
  'RINA-2008-4491',
  2008,
  'Perini Navi',
  '2026-01-01T00:00:00Z'
) ON CONFLICT DO NOTHING;

-- ─── PROJECT ──────────────────────────────────────────────────────────────────

INSERT INTO projects (id, vessel_id, name, project_type, phase, yard_name, yard_location, planned_start, planned_delivery, actual_start, actual_delivery, budget_locked, budget_spent, budget_contingency, class_society, survey_due_date, created_at)
VALUES (
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0001-0000-0000-000000000001',
  'Project ZERO — 5 Year Survey 2026',
  'FIVE_YEAR_SURVEY',
  'PRE_SURVEY',
  'Pendennis Shipyard',
  'Falmouth, UK',
  '2026-05-01',
  '2026-08-15',
  NULL,
  NULL,
  1850000,
  24500,
  185000,
  'RINA',
  '2026-06-30',
  '2026-01-15T00:00:00Z'
) ON CONFLICT DO NOTHING;

-- ─── PROJECT MEMBERS ──────────────────────────────────────────────────────────

INSERT INTO project_members (id, project_id, user_id, role, name, email, company, created_at)
VALUES
  ('a1b2c3d4-0070-0000-0000-000000000001', 'a1b2c3d4-0002-0000-0000-000000000001', NULL, 'OWNERS_REP', 'Nadir', 'nadir@yam.limited', 'YAM.Limited', '2026-01-15T00:00:00Z'),
  ('a1b2c3d4-0070-0000-0000-000000000002', 'a1b2c3d4-0002-0000-0000-000000000001', NULL, 'OWNER', 'Alexander Fontaine', 'alex@fontaine-family.com', 'Fontaine Family Office', '2026-01-15T00:00:00Z'),
  ('a1b2c3d4-0070-0000-0000-000000000003', 'a1b2c3d4-0002-0000-0000-000000000001', NULL, 'CAPTAIN', 'Captain James Harlow', 'captain@projectzero.com', NULL, '2026-01-15T00:00:00Z')
ON CONFLICT DO NOTHING;

-- ─── WORK PACKAGES ────────────────────────────────────────────────────────────

INSERT INTO work_packages (id, project_id, wp_number, title, discipline, description, status, planned_hours, actual_hours, planned_cost, actual_cost, trade_contractor, planned_start, planned_end, actual_start, actual_end, is_class_item, class_society, class_item_ref, created_at)
VALUES
  (
    'a1b2c3d4-0010-0000-0000-000000000001',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-CLASS-001',
    'Hull Class Survey — Steel & Framing',
    'CLASS',
    'Full hull structural survey per RINA 5-year requirements including ultrasonic thickness measurements on all steel plating and frames.',
    'SCOPED',
    240, 0, 48000, 0,
    'RINA Surveyor',
    '2026-05-05', '2026-05-20', NULL, NULL,
    true, 'RINA', 'RINA-HS-001',
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000002',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-HULL-001',
    'Hull Blasting & Anti-Fouling',
    'HULL',
    'Full hull blasting to Sa 2.5, epoxy prime coat, and application of premium anti-fouling system.',
    'SCOPED',
    480, 0, 85000, 0,
    'Pendennis Coatings',
    '2026-05-15', '2026-06-10', NULL, NULL,
    false, NULL, NULL,
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000003',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-MECH-001',
    'Main Engine Service — Port & Starboard',
    'MECHANICAL',
    'Full 5,000-hour service on both Caterpillar C18 main engines including injector replacement, heat exchanger overhaul, and alignment check.',
    'ACTIVE',
    320, 45, 62000, 8500,
    'Finning CAT',
    '2026-04-20', '2026-05-30', '2026-04-22', NULL,
    true, 'RINA', 'RINA-ME-002',
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000004',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-ELEC-001',
    'Electrical Systems Survey & Upgrade',
    'ELECTRICAL',
    'Full electrical survey per RINA requirements. Upgrade shore power system to 100A/480V three-phase. Replace aging wiring runs in engine room.',
    'SCOPED',
    280, 0, 54000, 0,
    'Pendennis Electrical',
    '2026-05-20', '2026-06-25', NULL, NULL,
    true, 'RINA', 'RINA-EL-003',
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000005',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-RIG-001',
    'Standing Rigging Replacement',
    'RIGGING',
    'Full replacement of all standing rigging including main mast shrouds, forestay, backstays, and all associated terminals. Seldén supplied.',
    'ACTIVE',
    160, 12, 38500, 2400,
    'Pendennis Rigging',
    '2026-04-25', '2026-05-25', '2026-04-28', NULL,
    false, NULL, NULL,
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000006',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-PAINT-001',
    'Topsides & Superstructure Repaint',
    'PAINT',
    'Full fairing and repaint of topsides and superstructure in original Perini white. Awlgrip HDT system.',
    'DRAFT',
    600, 0, 110000, 0,
    NULL,
    '2026-06-15', '2026-07-20', NULL, NULL,
    false, NULL, NULL,
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000007',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-INT-001',
    'Interior Soft Furnishings Refresh',
    'INTERIOR',
    'Replace all saloon upholstery, master cabin soft furnishings, and guest cabin bedding. New carpet in passageways.',
    'DRAFT',
    200, 0, 42000, 0,
    NULL,
    '2026-07-01', '2026-07-30', NULL, NULL,
    false, NULL, NULL,
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000008',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-SAFE-001',
    'Safety Equipment Survey & Renewal',
    'SAFETY',
    'Full survey and renewal of all SOLAS safety equipment. Life rafts, EPIRBs, flares, fire extinguishers.',
    'SCOPED',
    80, 0, 18500, 0,
    'Ocean Safety',
    '2026-05-25', '2026-06-05', NULL, NULL,
    true, 'RINA', 'RINA-SF-004',
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000009',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-STRUCT-001',
    'Structural Weld Inspection & Repairs',
    'STRUCTURAL',
    'MPI inspection of all structural welds per RINA requirements. Remediation of any identified cracks or corrosion.',
    'ON_HOLD',
    120, 8, 22000, 1200,
    'Pendennis Structural',
    '2026-05-10', '2026-05-22', '2026-04-30', NULL,
    true, 'RINA', 'RINA-ST-005',
    '2026-01-20T00:00:00Z'
  ),
  (
    'a1b2c3d4-0010-0000-0000-000000000010',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'WP-MECH-002',
    'Hydraulic Deck Equipment Overhaul',
    'MECHANICAL',
    'Overhaul of all hydraulic systems including anchor windlass, sail drives, and stabiliser rams.',
    'SCOPED',
    180, 0, 34000, 0,
    'Hydraulic Solutions Ltd',
    '2026-06-01', '2026-06-20', NULL, NULL,
    false, NULL, NULL,
    '2026-01-20T00:00:00Z'
  )
ON CONFLICT DO NOTHING;

-- ─── INSPECTION EVENTS ────────────────────────────────────────────────────────

INSERT INTO inspection_events (id, project_id, work_package_id, inspection_number, title, inspector_role, inspector_name, scheduled_date, actual_date, result, notes, is_class_inspection, class_item_ref, defect_count, created_at)
VALUES
  (
    'a1b2c3d4-0020-0000-0000-000000000001',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0010-0000-0000-000000000001',
    'INSP-CLASS-001',
    'Initial Hull Condition Survey',
    'CLASS_SURVEYOR',
    'Marco Ferretti (RINA)',
    '2026-05-06', NULL,
    'PENDING', NULL,
    true, 'RINA-HS-001', 0,
    '2026-02-01T00:00:00Z'
  ),
  (
    'a1b2c3d4-0020-0000-0000-000000000002',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0010-0000-0000-000000000003',
    'INSP-MECH-001',
    'Engine Room Pre-Service Inspection',
    'OWNERS_REP',
    'Nadir (YAM.Limited)',
    '2026-04-23', NULL,
    'PENDING', NULL,
    false, NULL, 1,
    '2026-02-01T00:00:00Z'
  ),
  (
    'a1b2c3d4-0020-0000-0000-000000000003',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0010-0000-0000-000000000005',
    'INSP-RIG-001',
    'Standing Rigging Condition Assessment',
    'YARD_QC',
    'Tom Bradley (Pendennis)',
    '2026-04-29', NULL,
    'PENDING', NULL,
    false, NULL, 1,
    '2026-02-01T00:00:00Z'
  ),
  (
    'a1b2c3d4-0020-0000-0000-000000000004',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0010-0000-0000-000000000009',
    'INSP-STRUCT-001',
    'MPI Weld Survey — Engine Room Frames',
    'CLASS_SURVEYOR',
    'Marco Ferretti (RINA)',
    '2026-05-12', NULL,
    'PENDING', NULL,
    true, 'RINA-ST-005', 0,
    '2026-02-01T00:00:00Z'
  )
ON CONFLICT DO NOTHING;

-- ─── CHANGE ORDERS (insert before defects to avoid circular FK issues) ─────────
-- We insert CO first (without approval_id), then defects, then update CO.approval_id

INSERT INTO change_orders (id, project_id, co_number, title, description, trigger_type, status, cost_delta, schedule_delta_days, raised_by, raised_date, defect_record_id, approval_id, created_at)
VALUES (
  'a1b2c3d4-0040-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CO-2026-001',
  'Starboard Engine Seawater Pump Replacement',
  'Replacement of starboard C18 seawater cooling pump due to impeller failure and cavitation damage discovered during pre-service inspection (NCR-2026-001). Includes new Caterpillar OEM pump unit, installation labour, and pressure testing.',
  'DEFECT_DISCOVERY',
  'PENDING_APPROVAL',
  8500, 3,
  'Nadir',
  '2026-04-23',
  NULL, -- will be set after defect insert via update
  NULL, -- will be set after approval insert
  '2026-04-23T11:00:00Z'
) ON CONFLICT DO NOTHING;

-- ─── DEFECT RECORDS ───────────────────────────────────────────────────────────

INSERT INTO defect_records (id, project_id, inspection_event_id, work_package_id, ncr_number, title, description, location_on_vessel, severity, status, root_cause, disposition, is_class_defect, class_item_ref, discovered_by, discovered_date, closed_date, cost_impact, schedule_impact_days, change_order_id, created_at)
VALUES
  (
    'a1b2c3d4-0030-0000-0000-000000000001',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0020-0000-0000-000000000002',
    'a1b2c3d4-0010-0000-0000-000000000003',
    'NCR-2026-001',
    'Starboard Engine Seawater Pump — Impeller Failure',
    'Starboard Caterpillar C18 seawater cooling pump impeller found heavily corroded and partially disintegrated. Pump shows cavitation damage to housing. Immediate replacement required to prevent engine overheating.',
    'Engine Room — Starboard Side, Frame 32',
    'HIGH',
    'PENDING_APPROVAL',
    'CORROSION',
    'REPLACE',
    true, 'RINA-ME-002',
    'Nadir',
    '2026-04-23',
    NULL,
    8500, 3,
    'a1b2c3d4-0040-0000-0000-000000000001',
    '2026-04-23T09:15:00Z'
  ),
  (
    'a1b2c3d4-0030-0000-0000-000000000002',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'a1b2c3d4-0020-0000-0000-000000000003',
    'a1b2c3d4-0010-0000-0000-000000000005',
    'NCR-2026-002',
    'Forestay Lower Terminal — Fatigue Cracking',
    'Forestay lower swaged terminal shows circumferential fatigue cracking at the swage/wire interface. Cracking visible to naked eye. Structural integrity compromised. Must be replaced before mast re-step.',
    'Foredeck — Forestay chainplate, Frame 2',
    'CRITICAL',
    'OPEN',
    'FATIGUE',
    'REPLACE',
    false, NULL,
    'Tom Bradley',
    '2026-04-29',
    NULL,
    NULL, NULL,
    NULL,
    '2026-04-29T14:30:00Z'
  )
ON CONFLICT DO NOTHING;

-- Update CO defect_record_id now that defect exists
UPDATE change_orders
SET defect_record_id = 'a1b2c3d4-0030-0000-0000-000000000001'
WHERE id = 'a1b2c3d4-0040-0000-0000-000000000001'
  AND defect_record_id IS NULL;

-- ─── OWNER APPROVALS ──────────────────────────────────────────────────────────

INSERT INTO owner_approvals (id, project_id, approval_number, title, description, tier, status, requested_by, requested_date, approver_name, decision_date, decision_notes, change_order_id, cost_amount, deadline, created_at)
VALUES (
  'a1b2c3d4-0050-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPR-2026-001',
  'Approve CO-2026-001: Starboard Engine Seawater Pump Replacement',
  'Owner approval required for change order CO-2026-001. Cost impact €8,500 above baseline. Schedule impact +3 days. Classified as Tier 1 approval (under €10,000).',
  'TIER_1',
  'PENDING',
  'Nadir',
  '2026-04-23',
  NULL, NULL, NULL,
  'a1b2c3d4-0040-0000-0000-000000000001',
  8500,
  '2026-04-30',
  '2026-04-23T11:30:00Z'
) ON CONFLICT DO NOTHING;

-- Update CO approval_id now that approval exists
UPDATE change_orders
SET approval_id = 'a1b2c3d4-0050-0000-0000-000000000001'
WHERE id = 'a1b2c3d4-0040-0000-0000-000000000001'
  AND approval_id IS NULL;

-- ─── DOCUMENTS ────────────────────────────────────────────────────────────────

INSERT INTO documents (id, project_id, doc_number, title, doc_type, revision, status, file_url, file_size, mime_type, uploaded_by, uploaded_date, linked_object_type, linked_object_id, is_class_document, created_at)
VALUES
  (
    'a1b2c3d4-0060-0000-0000-000000000001',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOC-2026-001',
    'RINA Class Certificate — Current',
    'CLASS_CERTIFICATE',
    'Rev.0', 'APPROVED',
    NULL, 245760, 'application/pdf',
    'Nadir', '2026-01-20',
    'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
    true,
    '2026-01-20T10:00:00Z'
  ),
  (
    'a1b2c3d4-0060-0000-0000-000000000002',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOC-2026-002',
    'Project ZERO — 5YS Specification Package',
    'SPECIFICATION',
    'Rev.2', 'APPROVED',
    NULL, 1572864, 'application/pdf',
    'Nadir', '2026-02-10',
    'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
    false,
    '2026-02-10T09:00:00Z'
  ),
  (
    'a1b2c3d4-0060-0000-0000-000000000003',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOC-2026-003',
    'NCR-2026-001 Photographic Evidence',
    'PHOTO',
    'Rev.0', 'APPROVED',
    NULL, 8388608, 'image/jpeg',
    'Nadir', '2026-04-23',
    'DEFECT_RECORD', 'a1b2c3d4-0030-0000-0000-000000000001',
    false,
    '2026-04-23T09:45:00Z'
  ),
  (
    'a1b2c3d4-0060-0000-0000-000000000004',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOC-2026-004',
    'CO-2026-001 Cost Breakdown',
    'CHANGE_ORDER',
    'Rev.0', 'UNDER_REVIEW',
    NULL, 102400, 'application/pdf',
    'Nadir', '2026-04-23',
    'CHANGE_ORDER', 'a1b2c3d4-0040-0000-0000-000000000001',
    false,
    '2026-04-23T11:15:00Z'
  ),
  (
    'a1b2c3d4-0060-0000-0000-000000000005',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOC-2026-005',
    'Pendennis Shipyard — Master Works Agreement',
    'CORRESPONDENCE',
    'Rev.1', 'APPROVED',
    NULL, 512000, 'application/pdf',
    'Nadir', '2026-01-15',
    'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
    false,
    '2026-01-15T14:00:00Z'
  )
ON CONFLICT DO NOTHING;

-- ─── WORLD MODEL EVENTS ───────────────────────────────────────────────────────

INSERT INTO world_model_events (id, project_id, event_type, object_type, object_id, before_state, after_state, triggered_by, triggered_by_name, triggered_at, cascade_from_event_id)
VALUES
  (
    'a1b2c3d4-0080-0000-0000-000000000001',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DEFECT_CREATED',
    'DEFECT_RECORD',
    'a1b2c3d4-0030-0000-0000-000000000001',
    NULL,
    '{"ncr_number": "NCR-2026-001", "severity": "HIGH", "status": "OPEN"}'::jsonb,
    NULL,
    'Nadir',
    '2026-04-23T09:15:00Z',
    NULL
  ),
  (
    'a1b2c3d4-0080-0000-0000-000000000002',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'CHANGE_ORDER_CREATED',
    'CHANGE_ORDER',
    'a1b2c3d4-0040-0000-0000-000000000001',
    NULL,
    '{"co_number": "CO-2026-001", "cost_delta": 8500, "status": "PENDING_APPROVAL"}'::jsonb,
    NULL,
    'Nadir',
    '2026-04-23T11:00:00Z',
    'a1b2c3d4-0080-0000-0000-000000000001'
  ),
  (
    'a1b2c3d4-0080-0000-0000-000000000003',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'APPROVAL_CREATED',
    'OWNER_APPROVAL',
    'a1b2c3d4-0050-0000-0000-000000000001',
    NULL,
    '{"approval_number": "APPR-2026-001", "tier": "TIER_1", "status": "PENDING"}'::jsonb,
    NULL,
    'Nadir',
    '2026-04-23T11:30:00Z',
    'a1b2c3d4-0080-0000-0000-000000000002'
  ),
  (
    'a1b2c3d4-0080-0000-0000-000000000004',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DEFECT_CREATED',
    'DEFECT_RECORD',
    'a1b2c3d4-0030-0000-0000-000000000002',
    NULL,
    '{"ncr_number": "NCR-2026-002", "severity": "CRITICAL", "status": "OPEN"}'::jsonb,
    NULL,
    'Tom Bradley',
    '2026-04-29T14:30:00Z',
    NULL
  ),
  (
    'a1b2c3d4-0080-0000-0000-000000000005',
    'a1b2c3d4-0002-0000-0000-000000000001',
    'DOCUMENT_UPLOADED',
    'DOCUMENT',
    'a1b2c3d4-0060-0000-0000-000000000003',
    NULL,
    '{"doc_number": "DOC-2026-003", "title": "NCR-2026-001 Photographic Evidence"}'::jsonb,
    NULL,
    'Nadir',
    '2026-04-23T09:45:00Z',
    NULL
  )
ON CONFLICT DO NOTHING;
