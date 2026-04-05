-- =============================================================================
-- YAM — Maritime Intelligence Platform
-- Seed File v2 — Project ZERO / 5-Year Survey 2026
-- Generated: 2026-04-05
-- =============================================================================

-- ─── TRUNCATE ALL EXISTING DATA (in dependency order) ────────────────────────

TRUNCATE TABLE
  world_model_events,
  owner_approvals,
  change_orders,
  defect_records,
  inspection_events,
  documents,
  project_members,
  work_packages,
  projects,
  vessels
CASCADE;

-- =============================================================================
-- VESSEL
-- =============================================================================

INSERT INTO vessels (
  id, name, hull_id, vessel_type,
  loa, beam, draft, gross_tonnage,
  flag_state, class_society, class_number,
  year_built, build_yard, created_at
) VALUES (
  'a1b2c3d4-0001-0000-0000-000000000001',
  'Project ZERO',
  'HIN-PNV-2008-055',
  'Sailing Ketch',
  55.0, 10.2, 4.8, 498,
  'Cayman Islands',
  'RINA',
  'RINA-2008-KY-1247',
  2008,
  'Perini Navi, Viareggio',
  '2026-04-05T00:00:00Z'
) ON CONFLICT DO NOTHING;

-- =============================================================================
-- PROJECT
-- =============================================================================

INSERT INTO projects (
  id, vessel_id, name, project_type, phase,
  yard_name, yard_location,
  planned_start, planned_delivery,
  actual_start, actual_delivery,
  budget_locked, budget_spent, budget_contingency,
  class_society, survey_due_date, created_at
) VALUES (
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0001-0000-0000-000000000001',
  '5-Year Survey 2026',
  'FIVE_YEAR_SURVEY',
  'PRE_SURVEY',
  'Pendennis Shipyard',
  'Falmouth, Cornwall, UK',
  '2026-05-01',
  '2026-08-15',
  NULL, NULL,
  1850000, 127400, 185000,
  'RINA',
  '2026-09-30',
  '2026-04-05T00:00:00Z'
) ON CONFLICT DO NOTHING;

-- =============================================================================
-- WORK PACKAGES  (23 packages — UUIDs ...000001 through ...000023)
-- =============================================================================

INSERT INTO work_packages (
  id, project_id, wp_number, title, discipline, description, status,
  planned_hours, actual_hours, planned_cost, actual_cost,
  trade_contractor, planned_start, planned_end, actual_start, actual_end,
  is_class_item, class_society, class_item_ref, created_at
) VALUES

-- ─── Hull & Structural ────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-HULL-001', 'Hull survey & ultrasonic thickness gauging',
  'HULL',
  'Full hull thickness gauging per RINA 5-year survey requirements. UT readings at all nominated frames and shell plating.',
  'SCOPED',
  240, 0, 28000, 0,
  'Pendennis Survey Team', '2026-05-05', '2026-05-20', NULL, NULL,
  true, 'RINA', 'RINA Pt.B Ch.1',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-HULL-002', 'Keel bolt survey & integrity testing',
  'STRUCTURAL',
  'Survey and integrity testing of all keel bolts. Hydraulic load testing and UT examination per RINA requirements.',
  'SCOPED',
  80, 0, 18500, 0,
  'Pendennis Survey Team', '2026-05-08', '2026-05-14', NULL, NULL,
  true, 'RINA', 'RINA Pt.B Ch.3 Sec.2',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-STRUCT-001', 'Structural frames inspection portside bilge',
  'STRUCTURAL',
  'Detailed inspection of portside bilge structural frames. Scope expanded following discovery of corrosion at stations 47-49. Steel replacement required.',
  'ACTIVE',
  320, 48, 42000, 12600,
  'Marintek Acciaio Srl', '2026-05-10', '2026-06-15', '2026-05-10', NULL,
  true, 'RINA', 'RINA Pt.B Ch.2 Sec.1',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-HULL-003', 'Deck hardware removal, inspection & rebed',
  'HULL',
  'Remove all deck hardware including cleats, fairleads, and stanchion bases. Inspect backing plates and deck substrate. Rebed with appropriate sealant.',
  'SCOPED',
  180, 0, 31000, 0,
  'Pendennis Shipyard', '2026-05-18', '2026-06-10', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-PAINT-001', 'Underwater hull blasting & antifouling',
  'PAINT',
  'Grit blast entire underwater hull to Sa 2.5. Apply full antifouling system including primer, tie coat and antifouling to class specification.',
  'DRAFT',
  400, 0, 95000, 0,
  NULL, '2026-06-01', '2026-07-15', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-001', 'Propeller shaft & sterntube survey',
  'MECHANICAL',
  'Pull propeller shaft for inspection. Measure shaft for wear and straightness. Inspect sterntube bearings and seals. Repack/replace as required.',
  'SCOPED',
  120, 0, 22000, 0,
  'Pendennis Shipyard', '2026-05-12', '2026-05-22', NULL, NULL,
  true, 'RINA', 'RINA Pt.C Ch.1 Sec.7',
  '2026-04-05T00:00:00Z' ),

-- ─── Mechanical ──────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-002', 'Main engine service (2x Volvo IPS 900)',
  'MECHANICAL',
  'Full service of both Volvo IPS 900 main engines. Impellers, belts, filters, heat exchangers, zincs. Volvo-authorised technician required.',
  'DRAFT',
  160, 0, 68000, 0,
  NULL, '2026-05-20', '2026-06-05', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-003', 'Generator overhaul (2x Onan 27.5kW)',
  'MECHANICAL',
  'Overhaul of both Onan 27.5kW generators. Service schedule check, injector testing, heat exchanger service, load bank test.',
  'SCOPED',
  96, 0, 34500, 0,
  'Pendennis Engineering', '2026-05-25', '2026-06-08', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000009',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-004', 'Hydraulic system service (furling/winches)',
  'MECHANICAL',
  'Service all hydraulic systems including mast furling, boom vang, and electric winches. Fluid change, filter replacement, pressure testing.',
  'DRAFT',
  80, 0, 19800, 0,
  NULL, '2026-06-01', '2026-06-14', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000010',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-005', 'Bow thruster overhaul',
  'MECHANICAL',
  'Remove and overhaul bow thruster. Inspect tunnel for corrosion, check prop and shaft, replace seals and zincs.',
  'DRAFT',
  48, 0, 14200, 0,
  NULL, '2026-05-22', '2026-05-30', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000011',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-MECH-006', 'Watermakers service & membrane renewal (2x Village Marine)',
  'MECHANICAL',
  'Full service of both Village Marine watermakers. New membranes, pre-filters, high-pressure pump seals. Flush and recommission.',
  'DRAFT',
  40, 0, 11400, 0,
  NULL, '2026-06-10', '2026-06-18', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

-- ─── Electrical ──────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000012',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-ELEC-001', 'House battery bank replacement (Lithium 800Ah)',
  'ELECTRICAL',
  'Replace existing AGM house battery bank with lithium (LiFePO4) 800Ah system. New BMS, cell balancers, and shore power charger upgrade.',
  'SCOPED',
  120, 0, 87500, 0,
  'Pendennis Electrical', '2026-06-15', '2026-07-10', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000013',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-ELEC-002', 'Navigation suite update (B&G Zeus3S + Iridium)',
  'ELECTRICAL',
  'Replace existing navigation equipment with B&G Zeus3S chartplotters (x3), new Iridium satellite communications system, AIS transponder upgrade.',
  'DRAFT',
  80, 0, 43200, 0,
  NULL, '2026-07-01', '2026-07-20', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000014',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-ELEC-003', 'Shore power system GFCI & safety certification',
  'ELECTRICAL',
  'Inspect and certify shore power system. Replace GFCI protection, check earthing continuity, upgrade shore power inlets as required per RINA.',
  'SCOPED',
  40, 0, 8900, 0,
  'Pendennis Electrical', '2026-05-15', '2026-05-22', NULL, NULL,
  true, 'RINA', 'RINA Pt.C Ch.2 Sec.1',
  '2026-04-05T00:00:00Z' ),

-- ─── Rigging ─────────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000015',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-RIG-001', 'Standing rigging replacement — main mast',
  'RIGGING',
  'Full replacement of all main mast standing rigging. 1x19 wire or Dyform equivalent. New swages, toggles and pins throughout. RINA witness required.',
  'SCOPED',
  280, 0, 112000, 0,
  'Cornish Rigging Co.', '2026-06-01', '2026-07-01', NULL, NULL,
  true, 'RINA', 'RINA Pt.B Ch.5',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000016',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-RIG-002', 'Standing rigging replacement — mizzen mast',
  'RIGGING',
  'Full replacement of all mizzen mast standing rigging. Match main mast specification. Coordinate timing with main mast work programme.',
  'DRAFT',
  180, 0, 74000, 0,
  NULL, '2026-06-15', '2026-07-08', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000017',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-RIG-003', 'Running rigging, blocks & clutches service',
  'RIGGING',
  'Inspect all running rigging. Replace halyards, sheets and control lines on condition. Service Harken blocks and Spinlock clutches.',
  'DRAFT',
  120, 0, 28600, 0,
  NULL, '2026-06-20', '2026-07-10', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

-- ─── Safety ──────────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000018',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-SAFE-001', 'Life-saving appliances survey & revalidation',
  'SAFETY',
  'Full LSA survey per RINA requirements. Liferafts, EPIRBs, SARTs, flares, immersion suits, life rings. Revalidate and re-certify all items.',
  'SCOPED',
  48, 0, 16400, 0,
  'Pendennis Safety Services', '2026-05-25', '2026-06-05', NULL, NULL,
  true, 'RINA', 'RINA Pt.F Ch.1',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000019',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-SAFE-002', 'Fixed fire suppression system (Halon/CO2) service',
  'SAFETY',
  'Service and recharge fixed fire suppression system in engine room and generator spaces. Test all manual and automatic release mechanisms.',
  'SCOPED',
  32, 0, 9200, 0,
  'Pendennis Safety Services', '2026-05-28', '2026-06-03', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000020',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-SAFE-003', 'EPIRB, SART & SOLAS equipment renewal',
  'SAFETY',
  'Replace expired EPIRB battery and hydrostatic release. Test both SARTs. Review all SOLAS equipment for validity and renew as required.',
  'SCOPED',
  24, 0, 7800, 0,
  'Pendennis Safety Services', '2026-05-25', '2026-06-01', NULL, NULL,
  true, 'RINA', 'RINA Pt.F Ch.1 Sec.4',
  '2026-04-05T00:00:00Z' ),

-- ─── Interior ────────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000021',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-INT-001', 'Saloon & owner''s cabin joinery repairs',
  'INTERIOR',
  'Repair and refinish saloon overhead joinery and owner''s cabin furniture. Address water ingress damage to overhead panels. French polish and teak oil finish.',
  'DRAFT',
  200, 0, 38000, 0,
  NULL, '2026-07-01', '2026-07-25', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0003-0000-0000-000000000022',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-INT-002', 'Guest cabin soft furnishings (2 cabins)',
  'INTERIOR',
  'New upholstery, curtains, and soft furnishings for both guest cabins. Owner-supplied fabric specification. Coordinate with joinery repairs.',
  'DRAFT',
  80, 0, 24000, 0,
  NULL, '2026-07-10', '2026-07-30', NULL, NULL,
  false, NULL, NULL,
  '2026-04-05T00:00:00Z' ),

-- ─── Class ───────────────────────────────────────────────────────────────────

( 'a1b2c3d4-0003-0000-0000-000000000023',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-CLASS-001', 'RINA 5-year special survey coordination',
  'CLASS',
  'Overall coordination of RINA 5-year special survey. Surveyor attendance fees, travel, class documentation, interim and final certificate renewal.',
  'ACTIVE',
  160, 24, 22000, 4800,
  'RINA', '2026-05-01', '2026-08-15', '2026-05-01', NULL,
  true, 'RINA', 'RINA Pt.A Ch.2',
  '2026-04-05T00:00:00Z' );

-- WP-024 uses extended UUID sequence beyond spec minimum (24th package)
INSERT INTO work_packages (
  id, project_id, wp_number, title, discipline, description, status,
  planned_hours, actual_hours, planned_cost, actual_cost,
  trade_contractor, planned_start, planned_end, actual_start, actual_end,
  is_class_item, class_society, class_item_ref, created_at
) VALUES (
  'a1b2c3d4-0003-0000-0000-000000000024',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WP-CLASS-002', 'Stability booklet update & inclining experiment',
  'CLASS',
  'Perform inclining experiment to update vessel stability booklet following refit changes. RINA approval of updated stability booklet required before delivery.',
  'DRAFT',
  48, 0, 14500, 0,
  'YAM Naval Architecture', '2026-07-20', '2026-08-05', NULL, NULL,
  true, 'RINA', 'RINA Pt.B Ch.4',
  '2026-04-05T00:00:00Z'
) ON CONFLICT DO NOTHING;

-- =============================================================================
-- INSPECTION EVENTS  (15 total — UUIDs ...0004-...000001 through ...000015)
-- =============================================================================

INSERT INTO inspection_events (
  id, project_id, work_package_id,
  inspection_number, title,
  inspector_role, inspector_name,
  scheduled_date, actual_date,
  result, notes,
  is_class_inspection, class_item_ref,
  defect_count, created_at
) VALUES

( 'a1b2c3d4-0004-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000001',
  'INSP-HULL-001', 'Hull thickness gauging — initial survey',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-07', '2026-05-07',
  'CONDITIONAL_PASS',
  'UT readings indicate thinning at frame 22 starboard side — below minimum allowable thickness. All other readings within class limits. Two NCRs raised.',
  true, 'RINA Pt.B Ch.1',
  2, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000002',
  'INSP-HULL-002', 'Keel bolt survey & integrity test',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-09', '2026-05-09',
  'PASS',
  'All keel bolts within specification. Hydraulic load test passed at 1.5x working load. No corrosion or elongation observed.',
  true, 'RINA Pt.B Ch.3 Sec.2',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000003',
  'INSP-STRUCT-001', 'Portside bilge frames inspection — stations 44-52',
  'OWNERS_REP', 'Nadir Balena (YAM)',
  '2026-05-11', '2026-05-11',
  'FAIL',
  'Significant corrosion found at frames 47, 48, 49 portside bilge. Frame 47 shows section loss >30%. Frames 48-49 pitting corrosion with 15-20% section loss. Structural integrity compromised. Three NCRs raised. Escalated to RINA.',
  true, 'RINA Pt.B Ch.2 Sec.1',
  3, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000004',
  'INSP-STRUCT-002', 'Deck hardware inspection — stanchion bases & cleats',
  'YARD_QC', 'James Treloar (Pendennis)',
  '2026-05-20', NULL,
  'PENDING',
  NULL,
  false, NULL,
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000006',
  'INSP-MECH-001', 'Propeller shaft & sterntube survey',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-14', '2026-05-14',
  'PASS',
  'Shaft within dimensional tolerance. Sterntube bearings show acceptable wear — 0.3mm clearance, limit 0.5mm. Seals replaced as precaution. Certificate issued.',
  true, 'RINA Pt.C Ch.1 Sec.7',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000007',
  'INSP-MECH-002', 'Engine room pre-survey walk — mechanical systems',
  'OWNERS_REP', 'Nadir Balena (YAM)',
  '2026-05-06', '2026-05-06',
  'CONDITIONAL_PASS',
  'General engine room condition good. Port engine coolant leak identified at heat exchanger — minor weep, NCR raised. All other systems operational. Recommend service prior to haul-out.',
  false, NULL,
  1, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000014',
  'INSP-ELEC-001', 'Shore power system certification inspection',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-17', NULL,
  'PENDING',
  NULL,
  true, 'RINA Pt.C Ch.2 Sec.1',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000015',
  'INSP-RIG-001', 'Main mast standing rigging pre-removal survey',
  'OWNERS_REP', 'Nadir Balena (YAM)',
  '2026-05-05', '2026-05-05',
  'CONDITIONAL_PASS',
  'Overall rigging condition confirms full replacement necessary. Starboard running backstay swage failure found at lower terminal — safety critical. NCR raised and RINA notified. Upper shrouds show fatigue cracking at swage entry points.',
  false, NULL,
  1, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000009',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000018',
  'INSP-SAFE-001', 'Life-saving appliances initial survey',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-26', NULL,
  'PENDING',
  NULL,
  true, 'RINA Pt.F Ch.1',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000010',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000019',
  'INSP-SAFE-002', 'Fixed fire suppression system inspection',
  'YARD_QC', 'James Treloar (Pendennis)',
  '2026-05-29', '2026-05-29',
  'PASS',
  'Engine room CO2 system fully charged and operational. All manual and automatic release mechanisms tested satisfactorily. Service tag updated.',
  false, NULL,
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000011',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000020',
  'INSP-SAFE-003', 'EPIRB & SART verification inspection',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-27', NULL,
  'PENDING',
  NULL,
  true, 'RINA Pt.F Ch.1 Sec.4',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000012',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000023',
  'INSP-CLASS-001', 'RINA interim survey conference — project kickoff',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-05-02', '2026-05-02',
  'PASS',
  'Interim survey conference completed. RINA survey scope agreed and documented. Survey plan approved. Outstanding items identified: hull gauging, rigging, stability. Next attendance scheduled for hull work.',
  true, 'RINA Pt.A Ch.2',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000013',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000024',
  'INSP-CLASS-002', 'Inclining experiment — stability verification',
  'CLASS_SURVEYOR', 'Marco Ferretti (RINA)',
  '2026-07-22', NULL,
  'PENDING',
  NULL,
  true, 'RINA Pt.B Ch.4',
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000014',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000005',
  'INSP-HULL-003', 'Blasting pre-work condition survey',
  'YARD_QC', 'James Treloar (Pendennis)',
  '2026-06-02', NULL,
  'PENDING',
  NULL,
  false, NULL,
  0, '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0004-0000-0000-000000000015',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000005',
  'INSP-PAINT-001', 'Paint specification review & substrate assessment',
  'OWNERS_REP', 'Nadir Balena (YAM)',
  '2026-05-28', NULL,
  'PENDING',
  NULL,
  false, NULL,
  0, '2026-04-05T00:00:00Z' );

-- =============================================================================
-- CHANGE ORDERS  (inserted FIRST to break circular FK with defect_records)
-- defect_record_id and approval_id set to NULL here; back-filled via UPDATE
-- at the end after both defect_records and owner_approvals are inserted.
-- =============================================================================

INSERT INTO change_orders (
  id, project_id,
  co_number, title, description,
  trigger_type, status,
  cost_delta, schedule_delta_days,
  raised_by, raised_date,
  defect_record_id, approval_id,
  created_at
) VALUES

-- CO-2026-001: Portside bilge frame replacement
( 'a1b2c3d4-0006-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CO-2026-001',
  'NCR-001 Portside bilge frame replacement — stations 47-49',
  'Change order to cover full structural replacement of frames 47, 48 and 49 portside bilge following discovery of severe corrosion (NCR-2026-001). Scope includes: removal of existing corroded frames, fabrication and installation of new steel frames to original scantlings, blast and coat new steelwork, bilge system reinstatement, class witness by RINA. Scope of Work document attached.',
  'DEFECT_DISCOVERY', 'PENDING_APPROVAL',
  47200, 12,
  'Nadir Balena (YAM)', '2026-05-11',
  NULL, NULL,
  '2026-05-11T16:00:00Z' ),

-- CO-2026-002: Hull plate renewal frame 22
( 'a1b2c3d4-0006-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CO-2026-002',
  'NCR-003 Hull plate renewal — frame 22 starboard',
  'Change order for renewal of hull plating at frame 22 starboard as required by RINA following thickness gauging findings (NCR-2026-003). Plate thickness below class minimum. Scope: cut out affected plate section (approx 0.8m x 0.6m with margins), fit new plate to original specification, full-penetration weld, weld test, blast and coat, class witness and sign-off.',
  'DEFECT_DISCOVERY', 'PENDING_APPROVAL',
  31600, 8,
  'Nadir Balena (YAM)', '2026-05-08',
  NULL, NULL,
  '2026-05-08T10:00:00Z' ),

-- CO-2026-003: Running backstay renewal (APPROVED)
( 'a1b2c3d4-0006-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CO-2026-003',
  'NCR-005 Running backstay renewal + associated rigging',
  'Emergency change order for immediate replacement of starboard running backstay following swage failure (NCR-2026-005). As the vessel cannot sail safely, backstay replacement has been pre-approved. Scope expanded to include both running backstays (port and starboard) and associated blocks and turning points given age and condition of original equipment. Cornish Rigging Co. mobilising immediately.',
  'DEFECT_DISCOVERY', 'APPROVED',
  18900, 5,
  'Nadir Balena (YAM)', '2026-05-05',
  NULL, NULL,
  '2026-05-05T12:00:00Z' ),

-- CO-2026-004: Lithium battery upgrade owner request
( 'a1b2c3d4-0006-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CO-2026-004',
  'Owner request — lithium battery upgrade 800Ah to 1200Ah',
  'Owner has requested upgrade of planned lithium battery installation from 800Ah to 1200Ah capacity to support extended offshore passages without engine running. Additional scope: larger BMS, additional cell modules, upgraded inverter/charger from 3kW to 5kW, additional DC distribution panel. Subject to owner approval — draft for review.',
  'OWNER_REQUEST', 'DRAFT',
  52000, 0,
  'Alessandro Ferraro (Owner)', '2026-05-03',
  NULL, NULL,
  '2026-05-03T18:00:00Z' );

-- =============================================================================
-- DEFECT RECORDS  (8 total — UUIDs ...0005-...000001 through ...000008)
-- change_orders rows now exist, so change_order_id FK is satisfied.
-- =============================================================================

INSERT INTO defect_records (
  id, project_id,
  inspection_event_id, work_package_id,
  ncr_number, title, description, location_on_vessel,
  severity, status, root_cause, disposition,
  is_class_defect, class_item_ref,
  discovered_by, discovered_date, closed_date,
  cost_impact, schedule_impact_days,
  change_order_id, created_at
) VALUES

-- NCR-2026-001: Frame corrosion portside bilge
( 'a1b2c3d4-0005-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0004-0000-0000-000000000003',
  'a1b2c3d4-0003-0000-0000-000000000003',
  'NCR-2026-001',
  'Frame corrosion portside bilge — stations 47-49',
  'Severe corrosion identified at structural frames 47, 48 and 49 on the portside bilge. Frame 47 shows >30% section loss. Frames 48-49 exhibit 15-20% section loss with through-pitting in localised areas. Root cause: long-term bilge water accumulation and inadequate coating in inaccessible areas. Structural integrity of hull compromised at these stations. Class notified. Full frame replacement required per RINA instruction.',
  'Portside bilge, frames 47-49 (approx 12m from bow, below cabin sole)',
  'CRITICAL', 'PENDING_APPROVAL', 'CORROSION', 'REPAIR',
  true, 'RINA Pt.B Ch.2 Sec.1',
  'Nadir Balena (YAM)', '2026-05-11', NULL,
  47200, 12,
  'a1b2c3d4-0006-0000-0000-000000000001',
  '2026-05-11T14:30:00Z' ),

-- NCR-2026-002: Deck fitting corrosion
( 'a1b2c3d4-0005-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  NULL,
  'a1b2c3d4-0003-0000-0000-000000000004',
  'NCR-2026-002',
  'Deck fitting corrosion — portside stanchion bases (3 off)',
  'Three portside stanchion bases show significant corrosion at the deck interface. Bedding sealant has failed allowing water ingress beneath the base plates. Backing plates show surface corrosion. Bases must be removed, backing plates assessed and new sealant applied. Stainless steel showing crevice corrosion at base-to-deck interface.',
  'Portside deck, stanchion bases stations 3, 5, 7 (forward of beam)',
  'HIGH', 'IN_PROGRESS', 'CORROSION', 'REPAIR',
  false, NULL,
  'James Treloar (Pendennis)', '2026-05-18', NULL,
  8400, 0,
  NULL,
  '2026-05-18T09:15:00Z' ),

-- NCR-2026-003: Hull plate thinning
( 'a1b2c3d4-0005-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0004-0000-0000-000000000001',
  'a1b2c3d4-0003-0000-0000-000000000001',
  'NCR-2026-003',
  'Hull plate thinning below minimum — frame 22 starboard',
  'Ultrasonic thickness gauging reveals hull plating at frame 22 starboard to be 5.2mm, against RINA minimum allowable of 6.0mm for this plate position. Area approximately 0.6m x 0.4m. Adjacent plating at frames 21 and 23 within limits at 6.4mm and 6.8mm respectively. Root cause: external corrosion accelerated by cathodic protection failure in this zone. Plate renewal required before class certificate can be renewed.',
  'Starboard shell plating, frame 22, approx 0.5m below waterline (8m from bow)',
  'HIGH', 'PENDING_APPROVAL', 'CORROSION', 'REPAIR',
  true, 'RINA Pt.B Ch.1',
  'Marco Ferretti (RINA)', '2026-05-07', NULL,
  31600, 8,
  'a1b2c3d4-0006-0000-0000-000000000002',
  '2026-05-07T16:45:00Z' ),

-- NCR-2026-004: Port engine coolant leak
( 'a1b2c3d4-0005-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0004-0000-0000-000000000006',
  'a1b2c3d4-0003-0000-0000-000000000007',
  'NCR-2026-004',
  'Port engine coolant leak — heat exchanger weep',
  'Minor coolant weep observed at port engine heat exchanger end cap seal. Approximately 2-3ml/hour drip rate. Coolant level has been maintained manually. Heat exchanger is original 2008 equipment and due for replacement as part of engine service. No imminent failure risk but must be rectified before sea trials.',
  'Engine room, port side — Volvo IPS 900 heat exchanger end cap (forward face)',
  'MEDIUM', 'OPEN', 'WEAR', 'REPLACE',
  false, NULL,
  'Nadir Balena (YAM)', '2026-05-06', NULL,
  4200, 0,
  NULL,
  '2026-05-06T11:00:00Z' ),

-- NCR-2026-005: Starboard running backstay swage failure
( 'a1b2c3d4-0005-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0004-0000-0000-000000000008',
  'a1b2c3d4-0003-0000-0000-000000000015',
  'NCR-2026-005',
  'Starboard running backstay swage failure — lower terminal',
  'Cracked swage fitting identified on starboard running backstay lower terminal. Crack propagating circumferentially around wire entry — consistent with fatigue failure from cyclic loading. Wire estimated 12 years old (original). This is a safety-critical defect — backstay failure under load could result in mast loss. Vessel must not be sailed until repaired. Approved immediately for replacement.',
  'Starboard running backstay, lower swage terminal at deck chainplate (aft deck, starboard)',
  'HIGH', 'PENDING_APPROVAL', 'FATIGUE', 'REPLACE',
  false, NULL,
  'Nadir Balena (YAM)', '2026-05-05', NULL,
  18900, 5,
  'a1b2c3d4-0006-0000-0000-000000000003',
  '2026-05-05T10:30:00Z' ),

-- NCR-2026-006: EPIRB battery expired
( 'a1b2c3d4-0005-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  NULL,
  'a1b2c3d4-0003-0000-0000-000000000020',
  'NCR-2026-006',
  'EPIRB battery expired — 14 months overdue for replacement',
  'Primary EPIRB (ACR GlobalFix Pro 406MHz) battery expiry date was February 2025. Battery is now 14 months past expiry. Unit will not function correctly in emergency activation. Hydrostatic release unit also requires replacement (5-year service interval passed). Secondary EPIRB battery within date.',
  'Bridge — port side EPIRB bracket',
  'MEDIUM', 'OPEN', 'WEAR', 'REPLACE',
  false, NULL,
  'Capt. Marcus Webb', '2026-05-04', NULL,
  1800, 0,
  NULL,
  '2026-05-04T08:00:00Z' ),

-- NCR-2026-007: Shore power inlet corrosion
( 'a1b2c3d4-0005-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  NULL,
  'a1b2c3d4-0003-0000-0000-000000000014',
  'NCR-2026-007',
  'Shore power inlet corroded — earthing continuity lost',
  'Portside 63A shore power inlet shows advanced corrosion at earth pin socket. Earthing continuity test failed (>1 ohm, should be <0.1 ohm). Vessel is currently operating without safe shore power earthing — risk of electric shock. Immediate remedy required: inlet replacement and full earth continuity verification. Class (RINA) notified as defect affects certification.',
  'Portside deck box, shore power inlet panel (aft of main saloon hatch)',
  'CRITICAL', 'OPEN', 'CORROSION', 'REPAIR',
  true, 'RINA Pt.C Ch.2 Sec.1',
  'Nadir Balena (YAM)', '2026-05-04', NULL,
  6200, 3,
  NULL,
  '2026-05-04T09:30:00Z' ),

-- NCR-2026-008: Saloon overhead leak
( 'a1b2c3d4-0005-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  NULL,
  NULL,
  'NCR-2026-008',
  'Saloon overhead leak — teak deck seam failure',
  'Water ingress staining visible on saloon overhead lining panel adjacent to main hatch. Teak deck seam compound has failed over approximately 400mm run above this area. Ingress occurs only during heavy rain or when deck is washed down. Cosmetic damage to overhead lining — no structural concern. Address during teak deck seam renewal programme.',
  'Saloon overhead, forward panel, starboard of main companionway hatch',
  'LOW', 'OPEN', 'WEAR', 'REPAIR',
  false, NULL,
  'Capt. Marcus Webb', '2026-04-28', NULL,
  3200, 0,
  NULL,
  '2026-04-28T15:00:00Z' );

-- =============================================================================
-- OWNER APPROVALS  (3 total — UUIDs ...0007-...000001 through ...000003)
-- =============================================================================

INSERT INTO owner_approvals (
  id, project_id,
  approval_number, title, description,
  tier, status,
  requested_by, requested_date,
  approver_name, decision_date, decision_notes,
  change_order_id, cost_amount, deadline,
  created_at
) VALUES

-- APPR-2026-001: CO-001 Frame replacement
( 'a1b2c3d4-0007-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPR-2026-001',
  'Approval: CO-001 Portside bilge frame replacement',
  'Request for owner approval of Change Order CO-2026-001 for portside bilge frame replacement at stations 47-49. This is a class-mandatory repair — RINA will not renew class certificate without completion. Cost: EUR 47,200 additional to agreed budget. Schedule impact: 12 calendar days. Work must commence before 2026-05-25 to maintain overall programme. Supporting documentation: NCR-2026-001, INSP-STRUCT-001 report, Marintek Acciaio quotation.',
  'TIER_2', 'PENDING',
  'Nadir Balena (YAM)', '2026-05-11',
  'Alessandro Ferraro', NULL, NULL,
  'a1b2c3d4-0006-0000-0000-000000000001',
  47200, '2026-05-12',
  '2026-05-11T16:30:00Z' ),

-- APPR-2026-002: CO-002 Hull plate renewal
( 'a1b2c3d4-0007-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPR-2026-002',
  'Approval: CO-002 Hull plate renewal frame 22 starboard',
  'Request for owner approval of Change Order CO-2026-002 for hull plate renewal at frame 22 starboard. RINA-mandatory repair: hull plating found below minimum thickness during class gauging survey. Cost: EUR 31,600 additional to agreed budget. Schedule impact: 8 calendar days. RINA surveyor Marco Ferretti confirms this repair is required for class renewal. Supporting documentation: NCR-2026-003, INSP-HULL-001 gauging report.',
  'TIER_2', 'PENDING',
  'Nadir Balena (YAM)', '2026-05-08',
  'Alessandro Ferraro', NULL, NULL,
  'a1b2c3d4-0006-0000-0000-000000000002',
  31600, '2026-05-15',
  '2026-05-08T11:00:00Z' ),

-- APPR-2026-003: CO-003 Backstay renewal (APPROVED)
( 'a1b2c3d4-0007-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPR-2026-003',
  'Approval: CO-003 Running backstay renewal — safety critical',
  'Emergency approval request for Change Order CO-2026-003 for immediate replacement of running backstays following swage failure on starboard backstay (NCR-2026-005). Safety critical — vessel must not sail until repaired. Approval requested same day as defect discovery. Cost: EUR 18,900. Schedule impact: 5 days (can run concurrently with other work). Cornish Rigging Co. can mobilise within 48 hours pending approval.',
  'TIER_2', 'APPROVED',
  'Nadir Balena (YAM)', '2026-05-05',
  'Alessandro Ferraro', '2026-05-03',
  'Approved. Proceed immediately — rigging safety critical.',
  'a1b2c3d4-0006-0000-0000-000000000003',
  18900, '2026-05-06',
  '2026-05-05T13:00:00Z' );

-- =============================================================================
-- BACK-FILL change_orders circular FK references
-- Now that both defect_records and owner_approvals exist, we can set the
-- back-references that could not be set during the initial INSERT.
-- =============================================================================

UPDATE change_orders SET
  defect_record_id = 'a1b2c3d4-0005-0000-0000-000000000001',
  approval_id      = 'a1b2c3d4-0007-0000-0000-000000000001'
WHERE id = 'a1b2c3d4-0006-0000-0000-000000000001';

UPDATE change_orders SET
  defect_record_id = 'a1b2c3d4-0005-0000-0000-000000000003',
  approval_id      = 'a1b2c3d4-0007-0000-0000-000000000002'
WHERE id = 'a1b2c3d4-0006-0000-0000-000000000002';

UPDATE change_orders SET
  defect_record_id = 'a1b2c3d4-0005-0000-0000-000000000005',
  approval_id      = 'a1b2c3d4-0007-0000-0000-000000000003'
WHERE id = 'a1b2c3d4-0006-0000-0000-000000000003';

-- =============================================================================
-- DOCUMENTS  (12 total — UUIDs ...0008-...000001 through ...000012)
-- =============================================================================

INSERT INTO documents (
  id, project_id,
  doc_number, title, doc_type,
  revision, status,
  file_url, file_size, mime_type,
  uploaded_by, uploaded_date,
  linked_object_type, linked_object_id,
  is_class_document, created_at
) VALUES

-- DOC-001: RINA Class Certificate
( 'a1b2c3d4-0008-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-001',
  'RINA Class Certificate 2021 — Project ZERO',
  'CLASS_CERTIFICATE', 'Rev.0', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Marco Ferretti (RINA)', '2026-04-20',
  'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
  true, '2026-04-20T10:00:00Z' ),

-- DOC-002: Stability Booklet
( 'a1b2c3d4-0008-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-002',
  'Project ZERO Stability Booklet Rev.5',
  'SPECIFICATION', 'Rev.5', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Sarah Mitchell (YAM)', '2026-04-20',
  'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
  true, '2026-04-20T10:30:00Z' ),

-- DOC-003: Hull Survey Plan
( 'a1b2c3d4-0008-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-003',
  'Hull Survey Plan — 5-Year Special Survey',
  'SURVEY_REPORT', 'Rev.1', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Marco Ferretti (RINA)', '2026-05-02',
  'WORK_PACKAGE', 'a1b2c3d4-0003-0000-0000-000000000001',
  true, '2026-05-02T14:00:00Z' ),

-- DOC-004: Pre-Haul Inspection Checklist
( 'a1b2c3d4-0008-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-004',
  'Pre-Haul Inspection Checklist — Project ZERO',
  'SPECIFICATION', 'Rev.2', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Nadir Balena (YAM)', '2026-04-25',
  'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
  false, '2026-04-25T09:00:00Z' ),

-- DOC-005: NCR-001 Photo Evidence
( 'a1b2c3d4-0008-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-005',
  'NCR-001 Frame Corrosion Photo Evidence — Portside Bilge',
  'PHOTO', 'Rev.0', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Nadir Balena (YAM)', '2026-05-11',
  'DEFECT_RECORD', 'a1b2c3d4-0005-0000-0000-000000000001',
  false, '2026-05-11T15:00:00Z' ),

-- DOC-006: CO-001 Scope of Work
( 'a1b2c3d4-0008-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-006',
  'CO-001 Scope of Work — Frame Replacement Stations 47-49',
  'CHANGE_ORDER', 'Rev.1', 'UNDER_REVIEW',
  NULL, NULL, 'application/pdf',
  'Nadir Balena (YAM)', '2026-05-11',
  'CHANGE_ORDER', 'a1b2c3d4-0006-0000-0000-000000000001',
  false, '2026-05-11T17:00:00Z' ),

-- DOC-007: APPR-001 Owner Approval Request
( 'a1b2c3d4-0008-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-007',
  'APPR-001 Owner Approval Request — Frame Replacement',
  'APPROVAL', 'Rev.0', 'DRAFT',
  NULL, NULL, 'application/pdf',
  'Nadir Balena (YAM)', '2026-05-11',
  'OWNER_APPROVAL', 'a1b2c3d4-0007-0000-0000-000000000001',
  false, '2026-05-11T17:30:00Z' ),

-- DOC-008: Main Mast Rigging Specification
( 'a1b2c3d4-0008-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-008',
  'Main Mast Standing Rigging Specification — Cornish Rigging',
  'DRAWING', 'Rev.3', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Tom Polglase (Cornish Rigging)', '2026-04-30',
  'WORK_PACKAGE', 'a1b2c3d4-0003-0000-0000-000000000015',
  false, '2026-04-30T16:00:00Z' ),

-- DOC-009: Lithium Battery System Proposal
( 'a1b2c3d4-0008-0000-0000-000000000009',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-009',
  'Lithium Battery System Proposal — Pendennis Electrical',
  'SPECIFICATION', 'Rev.1', 'DRAFT',
  NULL, NULL, 'application/pdf',
  'Sarah Mitchell (YAM)', '2026-04-28',
  'WORK_PACKAGE', 'a1b2c3d4-0003-0000-0000-000000000012',
  false, '2026-04-28T14:00:00Z' ),

-- DOC-010: Pendennis Project Programme
( 'a1b2c3d4-0008-0000-0000-000000000010',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-010',
  'Pendennis Project Programme Rev.2 — 5-Year Survey 2026',
  'SPECIFICATION', 'Rev.2', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'James Treloar (Pendennis)', '2026-04-22',
  'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
  false, '2026-04-22T11:00:00Z' ),

-- DOC-011: NCR-003 Hull Gauging Report
( 'a1b2c3d4-0008-0000-0000-000000000011',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-011',
  'NCR-003 Hull Gauging Report — Frame 22 Starboard',
  'SURVEY_REPORT', 'Rev.0', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Marco Ferretti (RINA)', '2026-05-07',
  'DEFECT_RECORD', 'a1b2c3d4-0005-0000-0000-000000000003',
  true, '2026-05-07T17:00:00Z' ),

-- DOC-012: Engine Room Inventory & Service History
( 'a1b2c3d4-0008-0000-0000-000000000012',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DOC-012',
  'Engine Room Inventory & Service History — Project ZERO',
  'SPECIFICATION', 'Rev.4', 'APPROVED',
  NULL, NULL, 'application/pdf',
  'Capt. Marcus Webb', '2026-04-20',
  'WORK_PACKAGE', 'a1b2c3d4-0003-0000-0000-000000000007',
  false, '2026-04-20T12:00:00Z' );

-- =============================================================================
-- PROJECT MEMBERS  (8 total — UUIDs ...0009-...000001 through ...000008)
-- =============================================================================

INSERT INTO project_members (
  id, project_id, user_id,
  role, name, email, company,
  created_at
) VALUES

( 'a1b2c3d4-0009-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000001',
  'OWNERS_REP', 'Nadir Balena', 'nadir.balena@gmail.com', 'YAM',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000002',
  'OWNER', 'Alessandro Ferraro', 'owner@projectzero.yacht', 'Private',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000003',
  'CAPTAIN', 'Capt. Marcus Webb', 'captain@projectzero.yacht', 'Project ZERO',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000004',
  'YARD_PM', 'James Treloar', 'j.treloar@pendennis.com', 'Pendennis Shipyard',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000005',
  'CLASS_SURVEYOR', 'Marco Ferretti', 'm.ferretti@rina.org', 'RINA',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000006',
  'NAVAL_ARCHITECT', 'Sarah Mitchell', 's.mitchell@yam.limited', 'YAM',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000007',
  'SUBCONTRACTOR', 'Roberto Caruso', 'r.caruso@marintek.it', 'Marintek Acciaio Srl',
  '2026-04-05T00:00:00Z' ),

( 'a1b2c3d4-0009-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0009-0000-0000-000000000008',
  'SUBCONTRACTOR', 'Tom Polglase', 't.polglase@cornishrigging.co.uk', 'Cornish Rigging Co.',
  '2026-04-05T00:00:00Z' );

-- =============================================================================
-- WORLD MODEL EVENTS  (15 total — UUIDs ...000a-...000001 through ...000015)
-- Chronological audit trail of the project story
-- =============================================================================

INSERT INTO world_model_events (
  id, project_id,
  event_type, object_type, object_id,
  before_state, after_state,
  triggered_by, triggered_at,
  cascade_from_event_id
) VALUES

-- Event 1: Project created
( 'a1b2c3d4-000a-0000-0000-000000000001',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'PROJECT_CREATED', 'PROJECT', 'a1b2c3d4-0002-0000-0000-000000000001',
  NULL,
  '{"name": "5-Year Survey 2026", "phase": "PRE_SURVEY", "yard_name": "Pendennis Shipyard", "budget_locked": 1850000}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-04-20T09:00:00Z',
  NULL ),

-- Event 2: RINA interim survey conference — PASS
( 'a1b2c3d4-000a-0000-0000-000000000002',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'INSPECTION_COMPLETED', 'INSPECTION_EVENT', 'a1b2c3d4-0004-0000-0000-000000000012',
  '{"result": "PENDING"}'::jsonb,
  '{"result": "PASS", "inspector_name": "Marco Ferretti (RINA)", "notes": "Interim survey conference completed. RINA survey scope agreed."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000005',
  '2026-05-02T15:30:00Z',
  NULL ),

-- Event 3: NCR-005 raised — backstay swage failure (first on-board finding)
( 'a1b2c3d4-000a-0000-0000-000000000003',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DEFECT_RAISED', 'DEFECT_RECORD', 'a1b2c3d4-0005-0000-0000-000000000005',
  NULL,
  '{"ncr_number": "NCR-2026-005", "severity": "HIGH", "status": "PENDING_APPROVAL", "title": "Starboard running backstay swage failure — lower terminal", "cost_impact": 18900}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-05T10:30:00Z',
  NULL ),

-- Event 4: CO-003 created (backstay — emergency)
( 'a1b2c3d4-000a-0000-0000-000000000004',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', 'a1b2c3d4-0006-0000-0000-000000000003',
  NULL,
  '{"co_number": "CO-2026-003", "status": "PENDING_APPROVAL", "cost_delta": 18900, "schedule_delta_days": 5, "trigger_type": "DEFECT_DISCOVERY"}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-05T12:00:00Z',
  'a1b2c3d4-000a-0000-0000-000000000003' ),

-- Event 5: APPR-003 approval requested — backstay
( 'a1b2c3d4-000a-0000-0000-000000000005',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPROVAL_REQUESTED', 'OWNER_APPROVAL', 'a1b2c3d4-0007-0000-0000-000000000003',
  NULL,
  '{"approval_number": "APPR-2026-003", "tier": "TIER_2", "status": "PENDING", "cost_amount": 18900, "deadline": "2026-05-06"}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-05T13:00:00Z',
  'a1b2c3d4-000a-0000-0000-000000000004' ),

-- Event 6: APPR-003 APPROVED by owner (same day)
( 'a1b2c3d4-000a-0000-0000-000000000006',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPROVAL_DECISION', 'OWNER_APPROVAL', 'a1b2c3d4-0007-0000-0000-000000000003',
  '{"status": "PENDING"}'::jsonb,
  '{"status": "APPROVED", "approver_name": "Alessandro Ferraro", "decision_date": "2026-05-03", "decision_notes": "Approved. Proceed immediately — rigging safety critical."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000002',
  '2026-05-05T14:15:00Z',
  'a1b2c3d4-000a-0000-0000-000000000005' ),

-- Event 7: CO-003 status updated to APPROVED
( 'a1b2c3d4-000a-0000-0000-000000000007',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CHANGE_ORDER_APPROVED', 'CHANGE_ORDER', 'a1b2c3d4-0006-0000-0000-000000000003',
  '{"status": "PENDING_APPROVAL"}'::jsonb,
  '{"status": "APPROVED", "approval_id": "a1b2c3d4-0007-0000-0000-000000000003"}'::jsonb,
  '00000000-0000-0000-0000-000000000000',
  '2026-05-05T14:16:00Z',
  'a1b2c3d4-000a-0000-0000-000000000006' ),

-- Event 8: Engine room walk — CONDITIONAL_PASS, NCR-004 raised
( 'a1b2c3d4-000a-0000-0000-000000000008',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'INSPECTION_COMPLETED', 'INSPECTION_EVENT', 'a1b2c3d4-0004-0000-0000-000000000006',
  '{"result": "PENDING"}'::jsonb,
  '{"result": "CONDITIONAL_PASS", "defect_count": 1, "notes": "Port engine coolant leak identified at heat exchanger — minor weep, NCR raised."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-06T11:00:00Z',
  NULL ),

-- Event 9: Hull gauging inspection — CONDITIONAL_PASS, 2 NCRs
( 'a1b2c3d4-000a-0000-0000-000000000009',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'INSPECTION_COMPLETED', 'INSPECTION_EVENT', 'a1b2c3d4-0004-0000-0000-000000000001',
  '{"result": "PENDING"}'::jsonb,
  '{"result": "CONDITIONAL_PASS", "defect_count": 2, "notes": "UT readings indicate thinning at frame 22 starboard — below minimum. Two NCRs raised."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000005',
  '2026-05-07T17:00:00Z',
  NULL ),

-- Event 10: NCR-003 raised — hull plate thinning
( 'a1b2c3d4-000a-0000-0000-000000000010',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DEFECT_RAISED', 'DEFECT_RECORD', 'a1b2c3d4-0005-0000-0000-000000000003',
  NULL,
  '{"ncr_number": "NCR-2026-003", "severity": "HIGH", "status": "PENDING_APPROVAL", "title": "Hull plate thinning below minimum — frame 22 starboard", "cost_impact": 31600, "is_class_defect": true}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000005',
  '2026-05-07T17:30:00Z',
  'a1b2c3d4-000a-0000-0000-000000000009' ),

-- Event 11: Structural inspection — FAIL, 3 NCRs
( 'a1b2c3d4-000a-0000-0000-000000000011',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'INSPECTION_COMPLETED', 'INSPECTION_EVENT', 'a1b2c3d4-0004-0000-0000-000000000003',
  '{"result": "PENDING"}'::jsonb,
  '{"result": "FAIL", "defect_count": 3, "notes": "Significant corrosion at frames 47-49 portside bilge. Structural integrity compromised. Escalated to RINA."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-11T14:00:00Z',
  NULL ),

-- Event 12: NCR-001 raised — critical frame corrosion
( 'a1b2c3d4-000a-0000-0000-000000000012',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'DEFECT_RAISED', 'DEFECT_RECORD', 'a1b2c3d4-0005-0000-0000-000000000001',
  NULL,
  '{"ncr_number": "NCR-2026-001", "severity": "CRITICAL", "status": "PENDING_APPROVAL", "title": "Frame corrosion portside bilge — stations 47-49", "cost_impact": 47200, "schedule_impact_days": 12, "is_class_defect": true}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-11T14:30:00Z',
  'a1b2c3d4-000a-0000-0000-000000000011' ),

-- Event 13: WP-003 status escalated to EXPANDED due to corrosion findings
( 'a1b2c3d4-000a-0000-0000-000000000013',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'WORK_PACKAGE_STATUS_CHANGED', 'WORK_PACKAGE', 'a1b2c3d4-0003-0000-0000-000000000003',
  '{"status": "ACTIVE", "planned_cost": 42000}'::jsonb,
  '{"status": "ACTIVE", "planned_cost": 42000, "note": "Scope expanded — corrosion at stations 47-49 confirmed. CO-001 raised."}'::jsonb,
  '00000000-0000-0000-0000-000000000000',
  '2026-05-11T16:00:00Z',
  'a1b2c3d4-000a-0000-0000-000000000012' ),

-- Event 14: CO-001 created — frame replacement
( 'a1b2c3d4-000a-0000-0000-000000000014',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'CHANGE_ORDER_CREATED', 'CHANGE_ORDER', 'a1b2c3d4-0006-0000-0000-000000000001',
  NULL,
  '{"co_number": "CO-2026-001", "status": "PENDING_APPROVAL", "cost_delta": 47200, "schedule_delta_days": 12, "trigger_type": "DEFECT_DISCOVERY"}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-11T16:00:00Z',
  'a1b2c3d4-000a-0000-0000-000000000012' ),

-- Event 15: APPR-001 approval request sent to owner
( 'a1b2c3d4-000a-0000-0000-000000000015',
  'a1b2c3d4-0002-0000-0000-000000000001',
  'APPROVAL_REQUESTED', 'OWNER_APPROVAL', 'a1b2c3d4-0007-0000-0000-000000000001',
  NULL,
  '{"approval_number": "APPR-2026-001", "tier": "TIER_2", "status": "PENDING", "cost_amount": 47200, "deadline": "2026-05-12", "note": "Awaiting owner decision — RINA mandatory repair."}'::jsonb,
  'a1b2c3d4-0009-0000-0000-000000000001',
  '2026-05-11T16:30:00Z',
  'a1b2c3d4-000a-0000-0000-000000000014' );

-- =============================================================================
-- END OF SEED FILE
-- =============================================================================
