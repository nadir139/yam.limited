# YAM — Maritime Intelligence Platform
## Knowledge Base · Session Log · Development Roadmap

> Last updated: April 2026 (Session 6)  
> Primary repo: `nadir139/yam.limited` (deployed via Vercel)  
> Live URL: `yam.limited`  
> App URL: `yam.limited/app/dashboard`  
> Supabase project: `ihippazqdkwssxnfzlwx.supabase.co`

---

## 1. What This Is

YAM is a **maritime intelligence platform** — not a project management tool. The distinction is critical.

A PM tool tracks tasks. YAM maintains a **world model of the vessel's reality**: every survey finding, change order, owner approval, and document is a typed object linked to other objects. The system propagates state changes automatically. Stakeholders get what they need to decide, not a status update.

The two intellectual frameworks underpinning the architecture:

### Jack Dorsey / Block framework
> *"We are not the first to try to move beyond traditional hierarchy. What they lacked was a technology capable of actually performing the coordination functions that hierarchy exists to provide. AI is that technology."*

Applied to YAM:
- **World model** = the live, continuously updated state of the project (Supabase as the event-sourced store)
- **Honest signal** = survey findings and NCRs (a frame is either to spec or it isn't — these are facts)
- **Intelligence layer** = cascade rules that propagate state changes without human relay (NCR → CO → OwnerApproval triggered automatically)
- **Capabilities** = the 10 atomic object types (Vessel, Project, WorkPackage, etc.) — not products, building blocks
- **Interfaces** = role-based dashboards (Owner, Owner's Rep, Yard PM, Class Surveyor, Captain)
- **No middle management** = the world model routes context to each stakeholder. The Owner's Rep focuses on edge decisions only.

### Palantir Foundry framework
- **Ontology-first** = the 10 object types ARE the schema of reality, everything else derives from them
- **Actions on objects** = not forms, typed operations (`RaiseDefectRecord`, `ApproveChangeOrder`, `CloseNCR`) with preconditions and cascade effects
- **Workshops** = each role gets a composed view built from the same objects, not a separate system
- **The cascade** = one defect → 8 object state changes, automatically, traceably

---

## 2. Current System Architecture

```
yam.limited/              ← public marketing site
yam.limited/ontology      ← public domain credibility artifact (Palantir pitch)
yam.limited/login         ← Supabase magic link auth + role selector
yam.limited/app/*         ← authenticated world model (all routes below)
```

### App routes
| Route | Page | Purpose |
|-------|------|---------|
| `/app/dashboard` | Dashboard | World model overview — stats, Needs Attention, Recent Activity, phase timeline |
| `/app/project` | ProjectOverview | Vessel + project detail, quick-link counts |
| `/app/work-packages` | WorkPackageList | Survey scope, filterable by discipline/status |
| `/app/work-packages/:id` | WorkPackageDetail | WP detail + linked inspections/defects/documents |
| `/app/inspections` | InspectionList | Survey events, inspector role, result badges |
| `/app/defects` | DefectList | NCR tracker with severity/status, table+card toggle |
| `/app/defects/:id` | DefectDetail | Full NCR + cascade chain visualization |
| `/app/change-orders` | ChangeOrderList | CO cards with cost/schedule delta |
| `/app/approvals` | ApprovalQueue | Owner approval queue with Approve/Reject dialogs |
| `/app/documents` | DocumentLibrary | Linked document store |
| `/app/team` | TeamView | Stakeholder roles + permissions |

### Tech stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v3
- **UI components**: shadcn/ui (full set — all Radix primitives)
- **Data**: Supabase (PostgreSQL + Realtime + Storage + Auth)
- **State**: React Query (@tanstack/react-query) for server state
- **Auth**: Supabase magic link (OTP) — role stored in localStorage by email key
- **Deployment**: Vercel (auto-deploy on push to main)
- **Design tokens**: Deep navy primary (`hsl(215 50% 23%)`), teal accent (`hsl(185 60% 40%)`)

### Key source files
```
src/
  lib/
    types.ts          ← ALL TypeScript types (the ontology in code)
    db.ts             ← Supabase query/mutation functions
    query-hooks.ts    ← React Query hooks wrapping db.ts
    intelligence.ts   ← Cascade rules engine (pure functions)
    actions.ts        ← Typed action definitions
    mock-data.ts      ← Seed data reference (kept for fallback)
    supabase.ts       ← Supabase client
  contexts/
    AuthContext.tsx   ← Supabase auth context (magic link)
  components/
    layout/
      AppShell.tsx    ← Desktop/mobile shell (JS-based responsive, not Tailwind)
      Sidebar.tsx     ← Navy sidebar, live badge counts from query hooks
      Topbar.tsx      ← Project name, phase badge, theme toggle
    actions/
      RaiseDefectForm.tsx          ← NCR creation with cascade preview
      RecordInspectionResult.tsx   ← Set PASS/CONDITIONAL_PASS/FAIL + inline NCR prompt
      UploadDocumentForm.tsx       ← Drag-and-drop file upload → Supabase Storage
  pages/
    auth/Login.tsx    ← Email + role selector → magic link flow
    dashboard/        ← World model overview
    [all other pages as above]
```

### SQL files in repo root
```
supabase-schema.sql                        ← Full schema (run first on new Supabase project)
supabase-seed.sql                          ← Original minimal seed (superseded by v2)
supabase-seed-v2.sql                       ← Full Project ZERO synthetic dataset (run this)
supabase-migration-001-permissions.sql     ← Open RLS policies (auth_all)
supabase-migration-002-storage.sql         ← project-documents bucket + 4 RLS policies
supabase-migration-003-drop-members-fk.sql ← Drops project_members.user_id FK (allows synthetic team data)
supabase-migration-004-drop-event-fk.sql   ← Drops world_model_events.triggered_by FK (allows synthetic events)
```

---

## 3. The 10 Object Types (The Ontology)

| Object | Key Fields | Links To |
|--------|-----------|----------|
| **Vessel** | hullId, flagState, classNotation, LOA, GT | Project, SystemComponent |
| **Project** | phase, budgetLocked, plannedDelivery, classSociety | Vessel, WorkPackage, ChangeOrder |
| **WorkPackage** | discipline, status, plannedHours, plannedCost, isClassItem | Project, Subcontractor, InspectionEvent |
| **ChangeOrder** | triggerType, costDelta, scheduleDelta, approvalStatus | Project, DefectRecord, OwnerApproval |
| **InspectionEvent** | inspectorRole, result, isClassInspection | WorkPackage, DefectRecord, OwnerApproval |
| **DefectRecord** | severity, status, rootCause, disposition, costImpact | InspectionEvent, ChangeOrder, SystemComponent |
| **OwnerApproval** | tier (1/2/3), status, deadline, costAmount | ChangeOrder, InspectionEvent, Project |
| **SystemComponent** | equipmentClass, maker, serial, installFrame | Vessel, WorkPackage, DefectRecord |
| **Document** | docType, revision, status, linkedObjectType/Id | WorkPackage, OwnerApproval |
| **WorldModelEvent** | eventType, objectType, before/afterState, cascadeFromEventId | All objects (append-only audit log) |

### Approval tiers
- **Tier 1**: < €10,000 — quick sign-off
- **Tier 2**: €10,000–€50,000 — owner rep + owner
- **Tier 3**: > €50,000 — full owner decision

---

## 4. The Change Order Cascade (Core Intelligence Insight)

The single most important demo moment. One finding triggers 8 connected object state changes automatically.

```
[Survey Finding — Day 1]
Frame corrosion at stations 47–49, portside bilge
           ↓
1. DefectRecord (NCR-2026-047)        NEW → OPEN
2. InspectionEvent (INSP-HULL-003)    PASS → CONDITIONAL_PASS  
3. WorkPackage (WP-STRUCT-002)        SCOPED → EXPANDED (+78h, material order)
4. WorkPackage (WP-COAT-001)          SCHEDULED → ON_HOLD (blocked by steel)
5. ChangeOrder (CO-2026-009)          — → CREATED (+€47,200, +12 days)
6. Project (PROJ-TESSERA-2026)        ON_SCHEDULE → DELAYED (delivery +12d)
7. OwnerApproval (APPR-2026-031)      — → PENDING (Tier 2, decision in 48h)
8. Subcontractor (Marintek Acciaio)   MOBILIZED → SCHEDULE_REVISED
```

**What to say in the Pendennis/Damen demo:**
> "Standard MES systems capture task completion. This system captures object state. When that NCR is raised, the system already knows coating is blocked, the owner needs to decide in 48 hours, and the delivery date has moved — without anyone sending a single email."

---

## 5. Project ZERO — Live Test Project

| Field | Value |
|-------|-------|
| Vessel name | Project ZERO |
| Type | Sailing Yacht Ketch |
| LOA | 55.0m |
| Beam | 10.2m |
| Draft | 4.8m |
| Flag | Cayman Islands |
| Class | RINA |
| Year built | 2008 |
| Builder | Perini Navi |
| Project type | 5-Year Survey 2026 |
| Yard | Pendennis Shipyard, Falmouth |
| Planned start | 01 May 2026 |
| Planned delivery | 15 August 2026 |
| Budget | €1,850,000 + €185,000 contingency |
| Current phase | Pre-Survey |

### Supabase fixed UUIDs (seed data)
```
vessel:   a1b2c3d4-0001-0000-0000-000000000001
project:  a1b2c3d4-0002-0000-0000-000000000001
```
See `supabase-seed.sql` for all object UUIDs.

---

## 6. Auth Flow

1. User visits `yam.limited/login`
2. Enters email + selects role (Owner's Rep, Owner, Captain, Yard PM, Class Surveyor)
3. Clicks "Send Magic Link" → Supabase sends OTP email
4. User clicks link → redirected to `/app/dashboard`
5. Role stored in `localStorage` keyed by email (`yam_role_{email}`)
6. Supabase session persists across refreshes

**To add a new stakeholder**: Give them the URL and tell them to sign in with their email + correct role.

---

## 7. Supabase Schema Notes

- All tables have RLS enabled
- Current policy: `auth_all` — any authenticated user can read/write all tables
- This is phase 1 — intentionally open for demo
- Phase 2 will add per-role, per-project RLS (project_members table ready)
- World model events table is append-only (no DELETE policy)
- SQL files in repo root:
  - `supabase-schema.sql` — full schema (run first on new Supabase project)
  - `supabase-migration-001-permissions.sql` — open RLS policies
  - `supabase-seed.sql` — Project ZERO seed data

---

## 8. Growth Strategy Context

YAM positions at the intersection no one occupies:
- Shipyard-floor operational knowledge (change orders, QC, yard management)
- Owner-side representation (knows what armators actually need)
- Coding + data modeling (can prototype, not just describe)
- European base (Fincantieri, Leonardo, NATO/EU programs)

### Target clients (priority order)
1. **Fincantieri Ingenium** — Italian, accessible, digital twin / MES validation
2. **Capgemini Engineering** — day-rate SME subcontracting (fastest revenue)
3. **Palantir** — after Foundry certification + published domain artifact
4. **EU/NATO programs** — EDF, Horizon Europe subcontracting (slow but large)

### The pitch to Pendennis / Damen
YAM is not selling software — it's demonstrating what a domain-expert-led intelligence system looks like. The app is proof. The ontology page is the explainer. The cascade demo is the moment that lands.

---

## 9. Completed Work (Session Log)

### Session 6 — Seed Data v2 + Inspection Actions + File Upload

#### Richer synthetic seed data (`supabase-seed-v2.sql`)
- 24 work packages across disciplines: Hull, Structural, Mechanical, Electrical, Rigging, Interior, Paint, Safety, Class
- 15 inspections with mixed results (PASS, CONDITIONAL_PASS, FAIL, PENDING)
- 8 defects: NCR-001 (CRITICAL frame corrosion), NCR-002 (HIGH deck fitting), NCR-003 (HIGH hull thinning), NCR-004 (MEDIUM engine coolant), NCR-005 (HIGH backstay swage failure), NCR-006 (MEDIUM EPIRB expired), NCR-007 (CRITICAL shore power earthing), NCR-008 (LOW saloon leak)
- 4 change orders: CO-001 (€47,200 frame replacement, PENDING), CO-002 (€31,600 hull plate, PENDING), CO-003 (€18,900 backstay, APPROVED), CO-004 (€52,000 battery upgrade, DRAFT)
- 3 approvals: APPR-001 and APPR-002 (PENDING Tier 2), APPR-003 (APPROVED Tier 2)
- 12 documents, 8 team members, 15 world model events
- Circular FK fix: change_orders inserted first with NULL back-refs, defect_records second, then UPDATE change_orders to set correct IDs
- System events use nil UUID `00000000-0000-0000-0000-000000000000` for triggered_by

#### Supabase Storage (`supabase-migration-002-storage.sql`)
- Private bucket `project-documents`, 50MB limit, allowed MIME types (PDF, images, office docs)
- 4 RLS policies: auth_upload, auth_select, auth_update, auth_delete (authenticated users only)
- Signed URLs with 1-year expiry stored as `file_url` in documents table

#### FK constraint migrations
- `supabase-migration-003-drop-members-fk.sql` — drops `project_members.user_id` FK so synthetic team members (RINA surveyors, Pendennis PMs) can be seeded without real Supabase auth accounts
- `supabase-migration-004-drop-event-fk.sql` — drops `world_model_events.triggered_by` FK for same reason

#### `RecordInspectionResult` (`src/components/actions/RecordInspectionResult.tsx`)
- Props: `{ inspection: InspectionEvent, onSuccess?: () => void }`
- Three toggle buttons: PASS (green), CONDITIONAL_PASS (amber), FAIL (red)
- Actual date picker, notes textarea (required for non-PASS results)
- After submit: shows result summary; if FAIL or CONDITIONAL_PASS, shows inline prompt to raise NCR via `RaiseDefectForm` pre-linked to the inspection
- Wired into `InspectionList` — each row has a "Record Result" button (shown for PENDING inspections)
- Uses `useUpdateInspection` mutation

#### `UploadDocumentForm` (`src/components/actions/UploadDocumentForm.tsx`)
- Props: `{ linkedObjectType?, linkedObjectId?, defaultDocType?, label? }`
- Drag-and-drop zone + hidden file input fallback
- Auto-fills document title from filename (strips extension, normalises separators)
- Doc type selector (10 types), "Class Required Document" checkbox
- Upload progress shown via mutation `isPending` state; success screen shows uploaded doc title
- Wired into: DocumentLibrary header, WorkPackageDetail documents tab, DefectDetail evidence section

#### `db.ts` additions
- `updateInspection(id, updates)` — patches inspection_events, returns updated record
- `uploadDocument(file, meta)` — uploads to `project-documents` bucket, gets 1-year signed URL, calls `createDocument`
- `nextNumber` extended to support `documents` table / `DOC` prefix

#### `query-hooks.ts` additions
- `useUpdateInspection()` — invalidates `inspections` + `world_model_events` on success
- `useUploadDocument()` — calls `db.uploadDocument`, invalidates `documents` + `world_model_events`

#### `DefectDetail` additions
- Evidence & Documents section: lists docs linked to the defect, file size, Open link
- UploadDocumentForm scoped to `DEFECT_RECORD` / `PHOTO` default

---

### Session 5 — Actions Layer + Intelligence Layer
- **Auth callback fixed**: Added `/auth/callback` route + `vercel.json` SPA rewrites — magic link now lands correctly in the app
- **RaiseDefectForm** (`src/components/actions/RaiseDefectForm.tsx`):
  - Modal form with full NCR fields
  - Cascade preview: shows warning when HIGH/CRITICAL + cost impact → "will auto-create CO + Approval"
  - On save: creates DefectRecord, evaluates cascade rules, auto-creates ChangeOrder + OwnerApproval if triggered
  - Result screen shows the full cascade chain (NCR → CO → Approval) with real data
  - Wired into DefectList toolbar and WorkPackageDetail defects tab
- **DefectDetail status actions**:
  - "Mark In Progress" button (OPEN → IN_PROGRESS)
  - "Close NCR" button with dialog + closure notes (→ CLOSED, sets closed_date)
- **Dashboard Advance Phase button**:
  - 3 gate checks: no critical NCRs, no Tier-2+ pending approvals, no WPs on hold
  - Button shows locked state when gates fail; unlocked when all pass
  - Advances project.phase in DB, logs WorldModelEvent
- **Supabase Realtime** (`src/hooks/useRealtimeSync.ts`):
  - Subscribes to postgres_changes on 6 tables
  - Invalidates React Query cache on any remote change
  - All browser sessions see live badge updates without polling
  - Wired into AppShell — active whenever user is authenticated
- **db.ts additions**: `createApproval`, `updateChangeOrder`, `updateProject`, `nextNumber` (sequential NCR/CO/APPR numbering)
- **query-hooks.ts additions**: `useCreateDefectWithCascade` (full cascade in one mutation), `useAdvancePhase`

### Session 1 — Strategy
- Full Yam.Limited growth strategy document (Naval Domain Expert → Defense/Maritime Tech)
- Tier 1/2 service lines, approach strategies for Palantir/Fincantieri/Leonardo
- Pitch templates and collaboration models

### Session 2 — Ontology Page
- Built `yam.limited/ontology` — interactive naval refit ontology
- 10 entity type cards with expand/collapse TypeScript interface blocks
- 6-phase refit lifecycle with M/Y TESSERA demo project
- Change Order Cascade visualization (trigger → 8 state changes)
- Committed and deployed

### Session 3 — App Build
- Scaffolded `yam-app` (Vite + React + TypeScript + Tailwind + Supabase)
- Built complete app: all 13 pages, AppShell, Sidebar, Topbar
- Intelligence layer (cascade rules, blocking detection)
- Project ZERO mock seed data
- Supabase schema SQL (10 tables + RLS)

### Session 4 — Integration
- Merged `yam-app` into `yam.limited` (one codebase, one deployment)
- Added `RefitIntelligence` section to marketing homepage
- DigitalLogbook kept separate (external `digital-logbook.com`)
- Fixed sidebar (inline style was overriding `md:block`)
- Wired Supabase magic link auth
- Replaced all mock data with live Supabase queries
- Schema + seed SQL deployed to Supabase
- App live at `yam.limited/app/dashboard`

---

## 10. Active To-Do List (Next Session)

### Priority 1 — Demo readiness
- [ ] **Role-based view restrictions** — Owner sees only Dashboard + Approvals + Documents; Yard PM sees WPs + Inspections; Captain sees Dashboard + Documents. Gate on role stored in localStorage.
- [ ] **Survey Status Report PDF export** — "Survey Status Report" one-click export in RINA/BV/Lloyd's format: vessel details, WP summary table, open NCR list, pending approvals, phase timeline. Use `react-pdf` or `jsPDF`.
- [ ] **Demo script** — 10-min walkthrough: login → dashboard → raise NCR → cascade fires → approve in queue → phase advances

### Priority 2 — Intelligence layer
- [ ] **Claude API on RaiseDefectForm** — when user types defect description, call Claude API to suggest: severity, root cause category, recommended disposition. Show as "AI Suggestion" inline badge that user can accept or override.
- [ ] **Mobile / iPad test** — sidebar drawer on tablet (currently JS responsive but untested on real device)

### Priority 3 — Multi-stakeholder
- [ ] **Invite flow** — Owner's Rep adds stakeholder by email → creates project_member record → Supabase sends magic link
- [ ] **Per-role RLS** — `supabase-migration-005-role-rls.sql` (after invite flow is proved)

### Phase 2 (after demo)
- [ ] **Multi-project support** — project selector in Topbar, project_id scoping on all queries
- [ ] **Notification system** — email when OwnerApproval created (Supabase Edge Function → Resend)
- [ ] **CO scope drafting** — Claude API on ChangeOrder form to suggest scope description from linked NCR text
- [ ] **Enter real Project ZERO data** — replace synthetic seed with actual survey scope documents when available

---

## 11. Key Technical Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| One codebase (yam.limited) not two apps | Single deployment, consistent auth, no CORS, easier demo |
| Mock data kept as fallback | Allows offline dev + demonstrates data shape clearly |
| Magic link auth (no password) | Right security model for multi-stakeholder maritime context. Yard PMs don't want passwords |
| Open RLS in phase 1 | Unblocks demo. Per-role enforcement added after shape is proven |
| Event-sourced world_model_events | Full audit trail — required for class society compliance |
| JS-based responsive sidebar | Tailwind `md:block` was overridden by inline style in production build — pure JS is reliable |
| React Query for all data | Handles caching, background refetch, optimistic updates. No Redux needed |
| snake_case types match Supabase | Zero transformation layer — DB columns map directly to TypeScript fields |

---

## 12. Credentials & Config

| Item | Value |
|------|-------|
| Supabase URL | `https://ihippazqdkwssxnfzlwx.supabase.co` |
| Vercel project | `project-0-coral.vercel.app` |
| GitHub repo | `nadir139/yam.limited` |
| Dev branch convention | `claude/[description]-[hash]` |
| Deploy branch | `main` (auto-deploy via Vercel) |

> ⚠️ Supabase anon key is in `.env.local` (gitignored) and Vercel environment variables. Do not commit to git.

---

*This file is the single source of truth for the YAM development context. Update it at the end of each session.*
