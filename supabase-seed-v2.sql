-- ─── YAM Project ZERO — Seed Data v2 ─────────────────────────────────────────
-- Full realistic dataset for a 55m ketch 5-year survey at Pendennis, 2026
-- Run after: supabase-schema.sql + supabase-migration-001-permissions.sql

-- Clean slate
TRUNCATE TABLE world_model_events CASCADE;
TRUNCATE TABLE owner_approvals CASCADE;
TRUNCATE TABLE change_orders CASCADE;
TRUNCATE TABLE defect_records CASCADE;
TRUNCATE TABLE inspection_events CASCADE;
TRUNCATE TABLE documents CASCADE;
TRUNCATE TABLE project_members CASCADE;
TRUNCATE TABLE work_packages CASCADE;
TRUNCATE TABLE projects CASCADE;
TRUNCATE TABLE vessels CASCADE;

-- ─── VESSEL ──────────────────────────────────────────────────────────────────
INSERT INTO vessels (id, name, hull_id, vessel_type, loa, beam, draft, gross_tonnage,
  flag_state, class_society, class_number, year_built, build_yard, created_at)
VALUES (
  'a1b2c3d4-0001-0000-0000-000000000001',
  'Project ZERO', 'HIN-PNV-2008-055', 'Sailing Ketch',
  55.0, 10.2, 4.8, 498,
  'Cayman Islands', 'RINA', 'RINA-2008-KY-1247', 2008,
  'Perini Navi, Viareggio',
  '2026-04-01T00:00:00Z'
);

-- ─── PROJECT ─────────────────────────────────────────────────────────────────
INSERT INTO projects (id, vessel_id, name, project_type, phase, yard_name, yard_location,
  planned_start, planned_delivery, actual_start, actual_delivery,
  budget_locked, budget_spent, budget_contingency,
  class_society, survey_due_date, created_at)
VALUES (
  'a1b2c3d4-0002-0000-0000-000000000001',
  'a1b2c3d4-0001-0000-0000-000000000001',
  '5-Year Survey 2026', 'FIVE_YEAR_SURVEY', 'PRE_SURVEY',
  'Pendennis Shipyard', 'Falmouth, Cornwall, UK',
  '2026-05-01', '2026-08-15', NULL, NULL,
  1850000, 127400, 185000,
  'RINA', '2026-09-30',
  '2026-04-01T00:00:00Z'
);

-- ─── WORK PACKAGES ───────────────────────────────────────────────────────────
INSERT INTO work_packages (id, project_id, wp_number, title, discipline, description,
  status, planned_hours, actual_hours, planned_cost, actual_cost,
  trade_contractor, planned_start, planned_end, actual_start, actual_end,
  is_class_item, class_society, class_item_ref, created_at)
VALUES
-- Hull & Structural
('a1b2c3d4-0003-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-HULL-001','Hull Survey & Ultrasonic Thickness Gauging','HULL',
 'Full underwater hull survey including UT gauging at 200 measurement points per RINA rules. Identify all areas below minimum plate thickness.',
 'SCOPED',240,18,28000,4200,'Pendennis Survey Team',
 '2026-05-05','2026-05-12',NULL,NULL,
 TRUE,'RINA','RINA Pt.B Ch.1 Sec.3','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-HULL-002','Keel Bolt Survey & Torque Testing','STRUCTURAL',
 'Extract and inspect keel bolts (18 off), check for corrosion and crevice attack. Torque test all remaining bolts per RINA requirements.',
 'SCOPED',120,0,18500,0,'Pendennis Survey Team',
 '2026-05-08','2026-05-14',NULL,NULL,
 TRUE,'RINA','RINA Pt.B Ch.3 Sec.2','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-STRUCT-001','Structural Frames Survey — Portside Bilge','STRUCTURAL',
 'Inspection of structural frames and longitudinals stations 40–55 portside bilge. Discovered corrosion requiring steel replacement. Scope expanded.',
 'EXPANDED',380,42,42000,18600,'Marintek Acciaio Srl',
 '2026-05-10','2026-06-05',NULL,NULL,
 TRUE,'RINA','RINA Pt.B Ch.3 Sec.6','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-HULL-003','Deck Hardware Removal, Inspection & Rebed','HULL',
 'Remove all deck hardware (cleats, fairleads, stanchion bases, winch bases). Inspect underlying deck structure, repair voids, rebed all fittings with Sikaflex.',
 'SCOPED',280,0,31000,0,'Pendennis Boatyard',
 '2026-05-18','2026-06-08',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-COAT-001','Underwater Hull Blasting & Antifouling System','PAINT',
 'Full grit blast to Sa2.5, epoxy primer 3 coats, antifouling application. Boot topping and waterline refinish. Copper coat system specified by owner.',
 'ON_HOLD',480,0,95000,0,'Pendennis Paint Shop',
 '2026-06-10','2026-07-05',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-HULL-004','Propeller Shaft & Sterntube Survey','MECHANICAL',
 'Withdraw both propeller shafts. Inspect bearings, shaft seals, cutless bearings. Measure shaft deflection. Replace sterntube seals.',
 'SCOPED',160,0,22000,0,'Pendennis Engineering',
 '2026-05-15','2026-05-25',NULL,NULL,
 TRUE,'RINA','RINA Pt.C Ch.1 Sec.7','2026-04-01T00:00:00Z'),

-- Mechanical
('a1b2c3d4-0003-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-MECH-001','Main Engine Service — 2x Volvo IPS 900','MECHANICAL',
 'Complete 1500h service on both main engines. Impellers, belts, filters, heat exchanger inspection, injector service, valve clearance check.',
 'DRAFT',320,0,68000,0,'South West Marine Engines',
 '2026-06-01','2026-06-20',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-MECH-002','Generator Overhaul — 2x Northern Lights 27.5kW','MECHANICAL',
 'Top-end overhaul both generators. Head gaskets, injectors, fuel system clean, battery replacement, load test to rated output.',
 'SCOPED',180,0,34500,0,'Marine Generator Services Ltd',
 '2026-06-05','2026-06-25',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000009','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-MECH-003','Hydraulic System Service — Furling & Deck Winches','MECHANICAL',
 'Service hydraulic power pack, clean reservoir, replace filters, check all deck machinery. Boom vang cylinder rebuild.',
 'DRAFT',140,0,19800,0,'Lewmar Service Centre',
 '2026-06-15','2026-06-30',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000010','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-MECH-004','Bow & Stern Thruster Overhaul','MECHANICAL',
 'Remove both tunnel thrusters. Inspect tunnels for corrosion. Motor bearing replacement, prop inspection, refit with new anodes.',
 'DRAFT',120,0,28400,0,'Pendennis Engineering',
 '2026-05-20','2026-06-05',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000011','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-MECH-005','Watermakers Service — 2x Village Marine 1800GPD','MECHANICAL',
 'Annual service, membrane integrity test, carbon filter replacement. HP pump rebuild on unit 2 (high hours). Remineralisation cartridge replacement.',
 'DRAFT',80,0,11400,0,'Village Marine Europe',
 '2026-06-20','2026-07-01',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

-- Electrical
('a1b2c3d4-0003-0000-0000-000000000012','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-ELEC-001','House Battery Bank Replacement — Lithium 800Ah','ELECTRICAL',
 'Remove existing AGM bank (640Ah, 10 years old). Install Victron LiFePO4 800Ah with BMS, battery monitor, and Cerbo GX integration.',
 'SCOPED',160,0,87500,0,'Yacht Electrical Solutions',
 '2026-06-10','2026-06-30',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000013','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-ELEC-002','Navigation Suite Update','ELECTRICAL',
 'B&G Zeus3S chartplotter replacement (existing 2014 units). Iridium GO! Exec satphone. AIS Class B transponder replacement. Radar dome service.',
 'DRAFT',120,0,43200,0,'Yacht Electronics SW',
 '2026-07-01','2026-07-20',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000014','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-ELEC-003','Shore Power GFCI Certification & Safety Audit','ELECTRICAL',
 'Full shore power system audit. GFCI installation at main distribution board. Galvanic isolator test and replacement. RINA electrical survey.',
 'SCOPED',60,0,8900,0,'Marine Electrical Services',
 '2026-05-12','2026-05-18',NULL,NULL,
 TRUE,'RINA','RINA Pt.C Ch.2 Sec.4','2026-04-01T00:00:00Z'),

-- Rigging
('a1b2c3d4-0003-0000-0000-000000000015','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-RIG-001','Standing Rigging Replacement — Main Mast','RIGGING',
 'Full replacement 1x19 wire standing rigging main mast (10 years, per manufacturer recommendation). Swage inspection revealed backstay failure.',
 'ACTIVE',320,48,112000,12400,'Cornish Rigging Co.',
 '2026-05-06','2026-06-15',NULL,NULL,
 TRUE,'RINA','RINA Pt.B Ch.4 Sec.2','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000016','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-RIG-002','Standing Rigging Replacement — Mizzen Mast','RIGGING',
 'Full replacement 1x19 wire standing rigging mizzen. All swages, toggles, turnbuckles renewed. Mast head fitting inspection.',
 'DRAFT',220,0,74000,0,'Cornish Rigging Co.',
 '2026-06-20','2026-07-20',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000017','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-RIG-003','Running Rigging, Blocks & Clutches Service','RIGGING',
 'Replace halyards and sheets (UV degradation). Inspect and service all Harken blocks. Clutch bank service, friction pads replacement.',
 'DRAFT',160,0,28600,0,'Pendennis Rigging',
 '2026-07-01','2026-07-25',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

-- Safety
('a1b2c3d4-0003-0000-0000-000000000018','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-SAFE-001','Life-Saving Appliances Survey & Revalidation','SAFETY',
 'RINA LSA survey: liferaft revalidation (2x 12-person), immersion suit inspection, flare pack renewal, MOB equipment check, harness and tether inspection.',
 'SCOPED',80,0,16400,0,'Safety at Sea Ltd',
 '2026-05-20','2026-05-28',NULL,NULL,
 TRUE,'RINA','RINA LSA Ch.1','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000019','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-SAFE-002','Fixed Fire Suppression System Service','SAFETY',
 'Service Kidde Argonite fixed fire suppression system in engine room. Weight check all cylinders, nozzle inspection, detection head test.',
 'SCOPED',40,0,9200,0,'Maritime Fire Protection Ltd',
 '2026-05-22','2026-05-26',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000020','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-SAFE-003','EPIRB, SART & SOLAS Equipment Renewal','SAFETY',
 'Replace expired EPIRB (ACR GlobalFix Pro — battery expired). SART test. Navtex replacement. Registration update with flag state (Cayman).',
 'SCOPED',24,0,7800,0,'Safety at Sea Ltd',
 '2026-05-20','2026-05-22',NULL,NULL,
 TRUE,'RINA','RINA LSA Ch.3','2026-04-01T00:00:00Z'),

-- Interior
('a1b2c3d4-0003-0000-0000-000000000021','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-INT-001','Saloon & Owner''s Cabin Joinery Repairs','INTERIOR',
 'Repair overhead leak damage in saloon (teak deck seam failure). Refinish affected joinery panels, replace stained upholstery fabric.',
 'DRAFT',200,0,38000,0,'Pendennis Interior',
 '2026-07-10','2026-08-01',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000022','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-INT-002','Guest Cabin Soft Furnishings Renewal','INTERIOR',
 'Replace soft furnishings in both guest cabins. New mattresses, headboard panels, curtains, throw pillows per owner specification.',
 'DRAFT',120,0,24000,0,'Pendennis Interior',
 '2026-07-15','2026-08-05',NULL,NULL,
 FALSE,NULL,NULL,'2026-04-01T00:00:00Z'),

-- Class coordination
('a1b2c3d4-0003-0000-0000-000000000023','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-CLASS-001','RINA 5-Year Special Survey Coordination','CLASS',
 'Coordination of all class survey activities with RINA surveyor Marco Ferretti. Opening meeting, survey schedule, interim certificates, closing survey.',
 'ACTIVE',80,12,22000,3200,'YAM — Nadir Balena',
 '2026-05-01','2026-08-10',NULL,NULL,
 TRUE,'RINA','RINA Class Survey Programme','2026-04-01T00:00:00Z'),

('a1b2c3d4-0003-0000-0000-000000000024','a1b2c3d4-0002-0000-0000-000000000001',
 'WP-CLASS-002','Stability Booklet Update & Inclining Experiment','CLASS',
 'Updated stability booklet required following refit changes (battery bank, rigging). Inclining experiment to verify lightship KG.',
 'DRAFT',60,0,14500,0,'Bureau Veritas Marine Consulting',
 '2026-07-20','2026-08-05',NULL,NULL,
 TRUE,'RINA','RINA Pt.B Ch.3 Sec.9','2026-04-01T00:00:00Z');

-- ─── INSPECTION EVENTS ───────────────────────────────────────────────────────
INSERT INTO inspection_events (id, project_id, work_package_id, inspection_number, title,
  inspector_role, inspector_name, scheduled_date, actual_date, result, notes,
  is_class_inspection, class_item_ref, defect_count, created_at)
VALUES
('a1b2c3d4-0004-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000001',
 'INSP-HULL-001','Hull Thickness Gauging — Initial Survey',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-06','2026-05-06',
 'CONDITIONAL_PASS',
 'Thickness readings within limits overall. Two areas require attention: Frame 22 starboard (plate below minimum per Rule table) and portside bilge stations 47-49 (general corrosion). Class conditional: resolve NCR-2026-003 and NCR-2026-001 before issuing continuance.',
 TRUE,'RINA Pt.B Ch.1 Sec.3',2,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000002',
 'INSP-HULL-002','Keel Bolt Survey & Torque Testing',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-08',NULL,
 'PENDING',NULL,
 TRUE,'RINA Pt.B Ch.3 Sec.2',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000003',
 'INSP-STRUCT-001','Portside Bilge Frames — YAM Initial Inspection',
 'OWNERS_REP','Nadir Balena (YAM)','2026-05-05','2026-05-05',
 'FAIL',
 'Frame corrosion found at stations 47-49 portside bilge. General plate pitting across stations 42-52. Active corrosion at bilge-longitudinal intersection. Steel replacement required before paint. NCR raised, Marintek Acciaio engaged.',
 FALSE,NULL,3,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000004',
 'INSP-HULL-003','Deck Hardware Pre-Removal Condition Survey',
 'YARD_QC','James Treloar (Pendennis)','2026-05-15',NULL,
 'PENDING',NULL,
 FALSE,NULL,0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000006',
 'INSP-MECH-001','Propeller Shaft & Sterntube Survey',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-16',NULL,
 'PENDING',NULL,
 TRUE,'RINA Pt.C Ch.1 Sec.7',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000007',
 'INSP-MECH-002','Engine Room Pre-Survey Walk',
 'OWNERS_REP','Nadir Balena (YAM)','2026-05-04','2026-05-04',
 'CONDITIONAL_PASS',
 'Generally good condition. Port engine coolant showing pink discolouration — possible heat exchanger failure. Service provider engaged to investigate.',
 FALSE,NULL,1,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000014',
 'INSP-ELEC-001','Shore Power System — RINA Certification Inspection',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-14',NULL,
 'PENDING',NULL,
 TRUE,'RINA Pt.C Ch.2 Sec.4',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000015',
 'INSP-RIG-001','Main Mast Standing Rigging Pre-Removal Survey',
 'OWNERS_REP','Nadir Balena (YAM)','2026-05-06','2026-05-06',
 'CONDITIONAL_PASS',
 'Standing rigging overall at end of service life (10 years). Starboard running backstay: swage terminal at lower end shows crack propagation — IMMEDIATE SAFETY CONCERN. NCR-2026-005 raised. Other rigging to be replaced per programme.',
 FALSE,NULL,1,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000009','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000018',
 'INSP-SAFE-001','Life-Saving Appliances — RINA Annual Survey',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-20',NULL,
 'PENDING',NULL,
 TRUE,'RINA LSA Ch.1',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000010','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000019',
 'INSP-SAFE-002','Fixed Fire Suppression System Survey',
 'YARD_QC','James Treloar (Pendennis)','2026-05-22','2026-05-03',
 'PASS',
 'Kidde Argonite system in good condition. All cylinders above minimum weight. Detection heads tested and functional. Service sticker current. Certificate of compliance issued.',
 FALSE,NULL,0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000011','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000020',
 'INSP-SAFE-003','EPIRB & SART Verification',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-21',NULL,
 'PENDING',NULL,
 TRUE,'RINA LSA Ch.3',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000012','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000023',
 'INSP-CLASS-001','RINA Opening Survey Conference',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-05-02','2026-05-02',
 'PASS',
 'Opening survey conference held at Pendennis offices. Survey programme agreed. Class records reviewed. No outstanding conditions from previous survey. Survey window confirmed 1 May – 15 Aug 2026.',
 TRUE,'RINA Class Survey Programme',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000013','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000024',
 'INSP-CLASS-002','Inclining Experiment',
 'CLASS_SURVEYOR','Marco Ferretti (RINA)','2026-07-22',NULL,
 'PENDING',NULL,
 TRUE,'RINA Pt.B Ch.3 Sec.9',0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000014','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000005',
 'INSP-COAT-001','Blasting Pre-Work Assessment',
 'YARD_QC','James Treloar (Pendennis)','2026-06-08',NULL,
 'PENDING',NULL,
 FALSE,NULL,0,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0004-0000-0000-000000000015','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0003-0000-0000-000000000014',
 'INSP-ELEC-002','Shore Power Earthing Continuity — YAM Pre-Inspection',
 'OWNERS_REP','Nadir Balena (YAM)','2026-05-03','2026-05-03',
 'FAIL',
 'Shore power inlet showing green corrosion product on earthing bus. Continuity test failed (earthing conductor resistance >0.5 ohm, limit 0.1 ohm). Vessel isolated from shore power — safety critical. NCR-2026-007 raised.',
 FALSE,NULL,1,'2026-04-01T00:00:00Z');

-- ─── CHANGE ORDERS (insert before defects to allow FK references) ─────────────
INSERT INTO change_orders (id, project_id, co_number, title, description,
  trigger_type, status, cost_delta, schedule_delta_days,
  raised_by, raised_date, defect_record_id, approval_id, created_at)
VALUES
('a1b2c3d4-0006-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'CO-2026-001',
 'NCR-001: Portside Bilge Frame Replacement — Stations 47-49',
 'Replacement of corroded structural frames and associated plating at portside bilge stations 47-49. Steel work by Marintek Acciaio Srl. Includes sandblasting, new frame fabrication, weld inspection.',
 'DEFECT_DISCOVERY','PENDING_APPROVAL',47200,12,
 'Nadir Balena (YAM)','2026-05-06',
 'a1b2c3d4-0005-0000-0000-000000000001',
 'a1b2c3d4-0007-0000-0000-000000000001',
 '2026-05-06T10:30:00Z'),

('a1b2c3d4-0006-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'CO-2026-002',
 'NCR-003: Hull Plate Renewal — Frame 22 Starboard',
 'Renewal of hull plating below minimum thickness at frame 22 starboard (area approx 0.8m x 1.2m). Includes temporary staging, steel supply, welding and weld test.',
 'DEFECT_DISCOVERY','PENDING_APPROVAL',31600,8,
 'Nadir Balena (YAM)','2026-05-07',
 'a1b2c3d4-0005-0000-0000-000000000003',
 'a1b2c3d4-0007-0000-0000-000000000002',
 '2026-05-07T09:00:00Z'),

('a1b2c3d4-0006-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'CO-2026-003',
 'NCR-005: Running Backstay Replacement — Safety Critical',
 'Immediate replacement of starboard running backstay (4:1 purchase system). New Dyneema SK99 backstay, new hardware. Port side replaced preventatively.',
 'DEFECT_DISCOVERY','APPROVED',18900,5,
 'Nadir Balena (YAM)','2026-05-06',
 'a1b2c3d4-0005-0000-0000-000000000005',
 'a1b2c3d4-0007-0000-0000-000000000003',
 '2026-05-06T14:00:00Z'),

('a1b2c3d4-0006-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'CO-2026-004',
 'Owner Request: House Battery Upgrade — 800Ah → 1200Ah LiFePO4',
 'Owner requests upgrade from specified 800Ah to 1200Ah Victron LiFePO4 system. Additional 400Ah bank, upgraded inverter/charger, new cabling run to bow thruster.',
 'OWNER_REQUEST','DRAFT',52000,0,
 'Alessandro Ferraro (Owner)','2026-05-04',
 NULL,NULL,
 '2026-05-04T00:00:00Z');

-- ─── OWNER APPROVALS ─────────────────────────────────────────────────────────
INSERT INTO owner_approvals (id, project_id, approval_number, title, description,
  tier, status, requested_by, requested_date, approver_name,
  decision_date, decision_notes, change_order_id, cost_amount, deadline, created_at)
VALUES
('a1b2c3d4-0007-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'APPR-2026-001',
 'Approval: CO-2026-001 Portside Bilge Frame Replacement',
 'Authorisation required for emergency structural steel replacement. Scope: frames and plating stations 47-49 portside bilge. Contractor: Marintek Acciaio Srl. Cost: €47,200 net. Schedule impact: +12 days.',
 'TIER_2','PENDING',
 'Nadir Balena (YAM)','2026-05-06',
 NULL,NULL,NULL,
 'a1b2c3d4-0006-0000-0000-000000000001',47200,'2026-05-12','2026-05-06T10:30:00Z'),

('a1b2c3d4-0007-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'APPR-2026-002',
 'Approval: CO-2026-002 Hull Plate Renewal Frame 22 Starboard',
 'RINA class condition: hull plate below minimum thickness at frame 22 starboard. Renewal required for continuance of class. Cost: €31,600. Schedule: +8 days overlap with structural work.',
 'TIER_2','PENDING',
 'Nadir Balena (YAM)','2026-05-07',
 NULL,NULL,NULL,
 'a1b2c3d4-0006-0000-0000-000000000002',31600,'2026-05-14','2026-05-07T09:00:00Z'),

('a1b2c3d4-0007-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'APPR-2026-003',
 'Approval: CO-2026-003 Running Backstay Replacement (Safety Critical)',
 'Immediate safety item. Cracked swage terminal on starboard running backstay — structural failure risk under load. Approved for immediate action.',
 'TIER_2','APPROVED',
 'Nadir Balena (YAM)','2026-05-06',
 'Alessandro Ferraro','2026-05-06',
 'Approved without delay. Safety-critical item. Proceed immediately. Cornish Rigging to expedite.',
 'a1b2c3d4-0006-0000-0000-000000000003',18900,'2026-05-10','2026-05-06T14:00:00Z');

-- ─── DEFECT RECORDS ──────────────────────────────────────────────────────────
INSERT INTO defect_records (id, project_id, inspection_event_id, work_package_id,
  ncr_number, title, description, location_on_vessel,
  severity, status, root_cause, disposition,
  is_class_defect, class_item_ref, discovered_by, discovered_date, closed_date,
  cost_impact, schedule_impact_days, change_order_id, created_at)
VALUES
('a1b2c3d4-0005-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000003','a1b2c3d4-0003-0000-0000-000000000003',
 'NCR-2026-001',
 'Frame Corrosion — Portside Bilge Stations 47-49',
 'Active general corrosion on frames and longitudinals portside bilge, stations 47-49. Pitting corrosion up to 4mm depth on 6mm plate. Bilge-longitudinal intersection shows crevice corrosion with material loss. Replacement of frames F47, F48, F49 and associated plating required.',
 'Portside bilge, frames 47-49, waterline to garboard',
 'CRITICAL','PENDING_APPROVAL','CORROSION','REPAIR',
 TRUE,'RINA Pt.B Ch.3 Sec.6',
 'Nadir Balena (YAM)','2026-05-05',NULL,
 47200,12,'a1b2c3d4-0006-0000-0000-000000000001',
 '2026-05-05T09:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000004','a1b2c3d4-0003-0000-0000-000000000004',
 'NCR-2026-002',
 'Deck Fitting Corrosion — Portside Stanchion Bases (3 off)',
 'Three stanchion bases portside midship showing extensive corrosion at deck level. Bedding compound failed, water ingress causing aluminium/stainless galvanic corrosion. Bases must be removed, deck inspected and repaired before refit.',
 'Portside deck, midship stanchion bases 4, 5, 6',
 'HIGH','IN_PROGRESS','CORROSION','REPAIR',
 FALSE,NULL,
 'James Treloar (Pendennis)','2026-05-03',NULL,
 8400,0,NULL,
 '2026-05-03T00:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000001','a1b2c3d4-0003-0000-0000-000000000001',
 'NCR-2026-003',
 'Hull Plate Below Minimum Thickness — Frame 22 Starboard',
 'UT gauging at frame 22 starboard recorded minimum plate thickness of 3.8mm against RINA minimum 4.5mm for this vessel. Area: approx 0.8m x 1.2m centred on frame 22. RINA class condition issued — plate renewal required before class continuance.',
 'Starboard shell plating, frame 22, approx 0.4m above keel',
 'HIGH','PENDING_APPROVAL','CORROSION','REPAIR',
 TRUE,'RINA Pt.B Ch.1 Sec.3',
 'Marco Ferretti (RINA)','2026-05-06',NULL,
 31600,8,'a1b2c3d4-0006-0000-0000-000000000002',
 '2026-05-06T11:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000006','a1b2c3d4-0003-0000-0000-000000000007',
 'NCR-2026-004',
 'Port Engine Coolant Discolouration — Heat Exchanger Suspected',
 'Port engine coolant reservoir showing pink discolouration indicating possible heat exchanger failure (coolant-seawater mixing). Engine temperature stable but coolant consumption elevated. Engine to be investigated before 1500h service commences.',
 'Engine room, port engine cooling system',
 'MEDIUM','OPEN','WEAR','REPLACE',
 FALSE,NULL,
 'Nadir Balena (YAM)','2026-05-04',NULL,
 4200,0,NULL,
 '2026-05-04T00:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000008','a1b2c3d4-0003-0000-0000-000000000015',
 'NCR-2026-005',
 'Starboard Running Backstay Swage Failure — Safety Critical',
 'Crack propagation found at lower swage terminal of starboard running backstay. Crack length approx 18mm on 22mm wire. Failure mode is hydrogen embrittlement / fatigue. IMMEDIATE HAZARD — backstay removed from service. Vessel must not sail until replaced.',
 'Starboard running backstay, lower swage terminal',
 'CRITICAL','PENDING_APPROVAL','FATIGUE','REPLACE',
 FALSE,NULL,
 'Nadir Balena (YAM)','2026-05-06',NULL,
 18900,5,'a1b2c3d4-0006-0000-0000-000000000003',
 '2026-05-06T13:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000011','a1b2c3d4-0003-0000-0000-000000000020',
 'NCR-2026-006',
 'EPIRB Battery Expired — 14 Months Overdue',
 'ACR GlobalFix Pro EPIRB battery expiry date: March 2025. Currently 14 months past expiry — unit non-compliant and cannot be relied upon for distress signalling. Replacement battery or new unit required before departure.',
 'Pilothouse EPIRB mounting bracket',
 'MEDIUM','OPEN','WEAR','REPLACE',
 TRUE,'RINA LSA Ch.3',
 'Nadir Balena (YAM)','2026-05-04',NULL,
 1800,0,NULL,
 '2026-05-04T00:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'a1b2c3d4-0004-0000-0000-000000000015','a1b2c3d4-0003-0000-0000-000000000014',
 'NCR-2026-007',
 'Shore Power Earthing Continuity Failure — Safety Critical',
 'Shore power inlet earthing bus showing corrosion product and failed continuity test (>0.5 ohm, limit 0.1 ohm). Vessel isolated from shore power. Risk of undetected earth fault and electric shock in water. RINA class condition — must be resolved before shore power reconnection.',
 'Shore power inlet box, port side transom',
 'CRITICAL','OPEN','CORROSION','REPAIR',
 TRUE,'RINA Pt.C Ch.2 Sec.4',
 'Nadir Balena (YAM)','2026-05-03',NULL,
 6200,3,NULL,
 '2026-05-03T00:00:00Z'),

('a1b2c3d4-0005-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 NULL,'a1b2c3d4-0003-0000-0000-000000000021',
 'NCR-2026-008',
 'Saloon Overhead Leak — Teak Deck Seam Failure',
 'Water ingress through saloon overhead lining tracked to teak deck seam failure directly above. Failed seam compound over approx 400mm run. Staining to overhead lining and one bulkhead panel. Interior repair to follow deck seam rectification.',
 'Saloon overhead, centred over dining table',
 'LOW','OPEN','MOISTURE_INGRESS','REPAIR',
 FALSE,NULL,
 'Capt. Marcus Webb','2026-05-01',NULL,
 3200,0,NULL,
 '2026-05-01T00:00:00Z');

-- ─── DOCUMENTS ───────────────────────────────────────────────────────────────
INSERT INTO documents (id, project_id, doc_number, title, doc_type, revision, status,
  file_url, file_size, mime_type, uploaded_by, uploaded_date,
  linked_object_type, linked_object_id, is_class_document, created_at)
VALUES
('a1b2c3d4-0008-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-001','RINA Class Certificate 2021 — Project ZERO',
 'CLASS_CERTIFICATE','Rev.1','APPROVED',NULL,NULL,NULL,
 'Marco Ferretti (RINA)','2021-09-15','PROJECT','a1b2c3d4-0002-0000-0000-000000000001',TRUE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-002','Project ZERO Stability Booklet Rev.5',
 'SPECIFICATION','Rev.5','APPROVED',NULL,NULL,NULL,
 'Sarah Mitchell (YAM)','2021-09-15','PROJECT','a1b2c3d4-0002-0000-0000-000000000001',TRUE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-003','Hull Survey Plan — 5-Year Special Survey',
 'SURVEY_REPORT','Rev.0','APPROVED',NULL,NULL,NULL,
 'Nadir Balena (YAM)','2026-04-20','WORK_PACKAGE','a1b2c3d4-0003-0000-0000-000000000001',TRUE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-004','Pendennis Project Programme Rev.2',
 'SPECIFICATION','Rev.2','APPROVED',NULL,NULL,NULL,
 'James Treloar (Pendennis)','2026-04-25','PROJECT','a1b2c3d4-0002-0000-0000-000000000001',FALSE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-005','NCR-001 Frame Corrosion — Photo Evidence Pack',
 'PHOTO','Rev.0','APPROVED',NULL,NULL,NULL,
 'Nadir Balena (YAM)','2026-05-05','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000001',FALSE,'2026-05-05T09:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-006','CO-001 Scope of Work — Frame Replacement',
 'CHANGE_ORDER','Rev.0','UNDER_REVIEW',NULL,NULL,NULL,
 'Nadir Balena (YAM)','2026-05-06','CHANGE_ORDER','a1b2c3d4-0006-0000-0000-000000000001',FALSE,'2026-05-06T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-007','APPR-001 Owner Approval Request Pack',
 'APPROVAL','Rev.0','DRAFT',NULL,NULL,NULL,
 'Nadir Balena (YAM)','2026-05-06','OWNER_APPROVAL','a1b2c3d4-0007-0000-0000-000000000001',FALSE,'2026-05-06T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-008','Main Mast Standing Rigging Specification',
 'DRAWING','Rev.1','APPROVED',NULL,NULL,NULL,
 'Cornish Rigging Co.','2026-04-28','WORK_PACKAGE','a1b2c3d4-0003-0000-0000-000000000015',FALSE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000009','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-009','Lithium Battery System Proposal — Victron 1200Ah',
 'SPECIFICATION','Rev.0','DRAFT',NULL,NULL,NULL,
 'Yacht Electrical Solutions','2026-05-04','WORK_PACKAGE','a1b2c3d4-0003-0000-0000-000000000012',FALSE,'2026-05-04T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000010','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-010','NCR-003 Hull Gauging Report — Frame 22 Stbd',
 'SURVEY_REPORT','Rev.0','APPROVED',NULL,NULL,NULL,
 'Marco Ferretti (RINA)','2026-05-06','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000003',TRUE,'2026-05-06T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000011','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-011','Engine Room Inventory & Service History',
 'SPECIFICATION','Rev.3','APPROVED',NULL,NULL,NULL,
 'Capt. Marcus Webb','2026-04-15','WORK_PACKAGE','a1b2c3d4-0003-0000-0000-000000000007',FALSE,'2026-04-01T00:00:00Z'),

('a1b2c3d4-0008-0000-0000-000000000012','a1b2c3d4-0002-0000-0000-000000000001',
 'DOC-2026-012','NCR-005 Backstay Swage Failure — Photo Report',
 'PHOTO','Rev.0','APPROVED',NULL,NULL,NULL,
 'Nadir Balena (YAM)','2026-05-06','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000005',FALSE,'2026-05-06T00:00:00Z');

-- ─── PROJECT MEMBERS ─────────────────────────────────────────────────────────
INSERT INTO project_members (id, project_id, user_id, role, name, email, company, created_at)
VALUES
('a1b2c3d4-0009-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'user-nadir-001','OWNERS_REP','Nadir Balena','nadir.balena@gmail.com','YAM — Yacht Architectural Management','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'user-owner-001','OWNER','Alessandro Ferraro','owner@projectzero.yacht','Private','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'user-captain-001','CAPTAIN','Capt. Marcus Webb','captain@projectzero.yacht','S/Y Project ZERO','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'user-yard-001','YARD_PM','James Treloar','j.treloar@pendennis.com','Pendennis Shipyard Ltd','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'user-rina-001','CLASS_SURVEYOR','Marco Ferretti','m.ferretti@rina.org','RINA Services S.p.A.','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'user-na-001','NAVAL_ARCHITECT','Sarah Mitchell','s.mitchell@yam.limited','YAM — Yacht Architectural Management','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'user-steel-001','SUBCONTRACTOR','Roberto Caruso','r.caruso@marintek.it','Marintek Acciaio Srl','2026-04-01T00:00:00Z'),

('a1b2c3d4-0009-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 'user-rig-001','SUBCONTRACTOR','Tom Polglase','t.polglase@cornishrigging.co.uk','Cornish Rigging Co.','2026-04-01T00:00:00Z');

-- ─── WORLD MODEL EVENTS ──────────────────────────────────────────────────────
INSERT INTO world_model_events (id, project_id, event_type, object_type, object_id,
  before_state, after_state, triggered_by, triggered_at, cascade_from_event_id)
VALUES
('a1b2c3d4-000a-0000-0000-000000000001','a1b2c3d4-0002-0000-0000-000000000001',
 'PROJECT_CREATED','PROJECT','a1b2c3d4-0002-0000-0000-000000000001',
 NULL,'{"phase":"PRE_SURVEY","name":"5-Year Survey 2026"}',
 'user-nadir-001','2026-04-01T09:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000002','a1b2c3d4-0002-0000-0000-000000000001',
 'INSPECTION_COMPLETED','INSPECTION_EVENT','a1b2c3d4-0004-0000-0000-000000000012',
 '{"result":"PENDING"}','{"result":"PASS","actual_date":"2026-05-02"}',
 'user-rina-001','2026-05-02T11:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000003','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000008',
 NULL,'{"ncr_number":"NCR-2026-008","severity":"LOW","status":"OPEN"}',
 'user-captain-001','2026-05-01T16:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000004','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000004',
 NULL,'{"ncr_number":"NCR-2026-004","severity":"MEDIUM","status":"OPEN"}',
 'user-nadir-001','2026-05-04T09:30:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000005','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000002',
 NULL,'{"ncr_number":"NCR-2026-002","severity":"HIGH","status":"OPEN"}',
 'user-yard-001','2026-05-03T10:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000006','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000007',
 NULL,'{"ncr_number":"NCR-2026-007","severity":"CRITICAL","status":"OPEN"}',
 'user-nadir-001','2026-05-03T14:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000007','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000001',
 NULL,'{"ncr_number":"NCR-2026-001","severity":"CRITICAL","status":"OPEN"}',
 'user-nadir-001','2026-05-05T09:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000008','a1b2c3d4-0002-0000-0000-000000000001',
 'CHANGE_ORDER_CREATED','CHANGE_ORDER','a1b2c3d4-0006-0000-0000-000000000001',
 NULL,'{"co_number":"CO-2026-001","cost_delta":47200,"status":"PENDING_APPROVAL"}',
 'user-nadir-001','2026-05-05T10:30:00Z','a1b2c3d4-000a-0000-0000-000000000007'),

('a1b2c3d4-000a-0000-0000-000000000009','a1b2c3d4-0002-0000-0000-000000000001',
 'APPROVAL_CREATED','OWNER_APPROVAL','a1b2c3d4-0007-0000-0000-000000000001',
 NULL,'{"approval_number":"APPR-2026-001","tier":"TIER_2","status":"PENDING"}',
 'user-nadir-001','2026-05-05T10:30:00Z','a1b2c3d4-000a-0000-0000-000000000007'),

('a1b2c3d4-000a-0000-0000-000000000010','a1b2c3d4-0002-0000-0000-000000000001',
 'INSPECTION_COMPLETED','INSPECTION_EVENT','a1b2c3d4-0004-0000-0000-000000000003',
 '{"result":"PENDING"}','{"result":"FAIL","actual_date":"2026-05-05","defect_count":3}',
 'user-nadir-001','2026-05-05T11:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000011','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_CREATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000005',
 NULL,'{"ncr_number":"NCR-2026-005","severity":"CRITICAL","status":"OPEN"}',
 'user-nadir-001','2026-05-06T13:00:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000012','a1b2c3d4-0002-0000-0000-000000000001',
 'CHANGE_ORDER_CREATED','CHANGE_ORDER','a1b2c3d4-0006-0000-0000-000000000003',
 NULL,'{"co_number":"CO-2026-003","cost_delta":18900,"status":"PENDING_APPROVAL"}',
 'user-nadir-001','2026-05-06T14:00:00Z','a1b2c3d4-000a-0000-0000-000000000011'),

('a1b2c3d4-000a-0000-0000-000000000013','a1b2c3d4-0002-0000-0000-000000000001',
 'APPROVAL_CREATED','OWNER_APPROVAL','a1b2c3d4-0007-0000-0000-000000000003',
 NULL,'{"approval_number":"APPR-2026-003","tier":"TIER_2","status":"PENDING"}',
 'user-nadir-001','2026-05-06T14:00:00Z','a1b2c3d4-000a-0000-0000-000000000011'),

('a1b2c3d4-000a-0000-0000-000000000014','a1b2c3d4-0002-0000-0000-000000000001',
 'APPROVAL_DECIDED','OWNER_APPROVAL','a1b2c3d4-0007-0000-0000-000000000003',
 '{"status":"PENDING"}','{"status":"APPROVED","decision_date":"2026-05-06","approver_name":"Alessandro Ferraro"}',
 'user-owner-001','2026-05-06T16:30:00Z',NULL),

('a1b2c3d4-000a-0000-0000-000000000015','a1b2c3d4-0002-0000-0000-000000000001',
 'DEFECT_STATUS_UPDATED','DEFECT_RECORD','a1b2c3d4-0005-0000-0000-000000000002',
 '{"status":"OPEN"}','{"status":"IN_PROGRESS"}',
 'user-yard-001','2026-05-07T08:00:00Z',NULL);
