# YAM — Maritime Intelligence Platform
## Knowledge Base · Session Log · Development Roadmap

> Last updated: April 2026  
> Primary repo: `nadir139/yam.limited` (deployed via GitHub Pages -- see section 12)  
> Live URL: `yam.limited`  
> App URL: `yam.limited/app/dashboard`  
> Supabase project: `xgpdfefxarllgykjbppn` -- provisioned and live (see section 12)

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
- **Write path**: all mutations go through **Actions** — `SECURITY DEFINER`
  Postgres functions called via `supabase.rpc()`. The client holds no
  INSERT/UPDATE/DELETE grant on any table, so Actions are not the preferred
  write path, they are the only one. See §13.
- **State**: React Query (@tanstack/react-query) for server state
- **Auth**: Supabase magic link (OTP) — role stored in localStorage by email key
- **Deployment**: GitHub Pages (auto-deploy on push to `main`); Vercel builds the
  same repo but serves preview URLs only
- **Design tokens**: Deep navy primary (`hsl(215 50% 23%)`), teal accent (`hsl(185 60% 40%)`)

### Key source files
```
src/
  lib/
    types.ts          ← ALL TypeScript types (the ontology in code)
    db.ts             ← reads via PostgREST; writes via rpc() to Actions
    query-hooks.ts    ← React Query hooks wrapping db.ts
    supabase.ts       ← Supabase client + `isSupabaseConfigured` guard
  contexts/
    AuthContext.tsx   ← Supabase auth context (magic link)
  components/
    layout/
      AppShell.tsx    ← Desktop/mobile shell (JS-based responsive, not Tailwind)
      Sidebar.tsx     ← Navy sidebar, live badge counts from query hooks
      Topbar.tsx      ← Project name, phase badge, theme toggle
  pages/
    auth/Login.tsx    ← Email + role selector → magic link flow
    dashboard/        ← World model overview
    [all other pages as above]
```

---

## 3. The 10 Object Types (The Ontology)

> ⚠️ **Superseded — historical.** This was the design sketch. The built system
> has **nine** object types, and they live in `ontology_object_types` (migration
> 009), which is the only authoritative list. The differences: `SystemComponent`
> was never built; `Subcontractor` became `Stakeholder` over `project_members`;
> `WorldModelEvent` is the audit log rather than an object type in the registry.
> Read the registry, or §14–15, before quoting anything below.

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

> ⚠️ **Superseded — historical.** The eight-step chain below was an aspiration,
> written against a demo vessel (`M/Y TESSERA`, `NCR-2026-047`) that does not
> exist in any database. What is actually built cascades **three** objects —
> Defect → Change Order → Owner Approval — gated on
> `severity in ('HIGH','CRITICAL') and coalesce(cost_impact, 0) > 0`. See §13
> and the `/ontology` Cascade tab, which quotes the live rule. The pitch below
> is still the right pitch; do not quote its object IDs as if they were real.

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

### Immediate
- [ ] **Enter real Project ZERO data** — replace seed data with actual survey scope from real documents
- [ ] **InspectionList action** — "Record Inspection Result" form (set result to PASS/FAIL/CONDITIONAL_PASS)

### Document management
- [ ] **File upload** — wire Supabase Storage for actual PDF/image uploads (currently UI placeholder only)
- [ ] **Document link to object** — ensure every uploaded doc is linked to its NCR/CO/WP

### Multi-stakeholder
- [ ] **Role-based view restrictions** — Owner sees only Dashboard + Approvals + Documents
- [ ] **Invite flow** — Owner's Rep adds stakeholder by email, creates project_member record
- [ ] **Per-role RLS** — `supabase-migration-002-role-rls.sql`

### Demo preparation (Pendennis / Damen)
- [ ] **Demo script** — 10-min walkthrough: login → dashboard → raise NCR → cascade fires → approve in queue → phase advances
- [ ] **Export report** — "Survey Status Report" PDF (RINA/BV/Lloyd's format)
- [ ] **Mobile test** — sidebar drawer on iPad

### Phase 2 features (after demo)
- [ ] **Claude API integration** — NCR root cause suggestion, CO scope drafting, risk summary
- [ ] **Multi-project support** — project selector in Topbar
- [ ] **Notification system** — email when OwnerApproval created (Supabase Edge Function → Resend)

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
| Supabase project | `yam-limited` — ref `xgpdfefxarllgykjbppn`, region `eu-central-1` |
| Supabase URL | `https://xgpdfefxarllgykjbppn.supabase.co` |
| Production host | **GitHub Pages** via `.github/workflows/deploy.yml` |
| Custom domain | `yam.limited`, from the `CNAME` file copied into `dist/` |
| Vercel project | `project-0` — builds the same repo, **preview URLs only, no custom domain** |
| GitHub repo | `nadir139/yam.limited` |
| Dev branch convention | `claude/[description]-[hash]` |
| Deploy branch | `main` |

> ⚠️ **History:** the project `ihippazqdkwssxnfzlwx` named by earlier revisions of
> this file never existed on the account, and its anon key was never set as a CI
> secret — so *every* production build from the Supabase cutover (`5cdfbc0`) until
> `eecb204` shipped without credentials and white-screened, because `createClient`
> throws on a missing URL. The client now degrades gracefully instead.
>
> **`yam-limited` (`xgpdfefxarllgykjbppn`) replaces it**, provisioned July 2026 with
> the full schema, all four migrations, the `project-documents` storage bucket, and
> `supabase-seed-v2.sql` loaded (1 vessel, 1 project, 24 work packages, 15
> inspections, 8 NCRs, 4 change orders, 3 approvals, 12 documents, 8 members, 15
> world-model events). `/app/*` needs `VITE_SUPABASE_URL` and
> `VITE_SUPABASE_ANON_KEY` set as **GitHub Actions secrets** — Vite inlines them at
> build time, so a local `.env` does not affect the deployed bundle.

> ⚠️ **RLS is deliberately permissive.** Migration 001 replaced the per-role
> policies with `auth_all` (`USING (true)`) on every table, so *any* authenticated
> user can read and write everything. Combined with unrestricted magic-link
> sign-up, anyone who can receive email can sign in and edit the demo data. This is
> the documented "phase 2 deferred" state, and it is required for the demo to work
> at all — the seeded `project_members` rows carry synthetic UUIDs that never match
> a real `auth.uid()`, so a membership-scoped policy would show an empty app.
> Restricting sign-up (allowlist) is the prerequisite for tightening this.

> ⚠️ Both GitHub Pages and Vercel build this repo on every push to `main`. Only
> Pages serves the custom domain — Vercel needs its own env vars if it is ever
> promoted to production.

---

*This file is the single source of truth for the YAM development context. Update it at the end of each session.*

---

## 13. The Actions Layer (added July 2026)

### Why

Until this change, `authenticated` held **33 direct INSERT/UPDATE/DELETE grants**
across the public schema. Any signed-in user could mutate any row straight from
the browser, and Workspace sign-up is unrestricted. Two consequences:

1. **Cascade rules were advisory.** The NCR → CO → Approval chain was
   orchestrated as ~8 sequential writes from `query-hooks.ts`, with no
   transaction around them. A failure at step 5 left a change order with no
   approval, pointing at a defect whose status was never updated.
2. **Provenance was forgeable.** `world_model_events` was written by the client,
   with `triggered_by` supplied by the caller. A client could stamp any actor,
   or skip the event entirely. Provenance you can forge is not provenance.

### What replaced it

Every mutation is now an **Action**: a `SECURITY DEFINER` Postgres function
called via `supabase.rpc()`. Migration 008 revokes all direct write grants, so
Actions are the only way to change anything. `SELECT` is retained — reads still
go through PostgREST under the existing RLS policies.

| Action | Cascades |
|---|---|
| `action_raise_defect` | → Change Order → Owner Approval (when HIGH/CRITICAL with cost impact) |
| `action_decide_approval` | → Change Order status |
| `action_update_defect_status` | — |
| `action_record_inspection_result` | recomputes `defect_count` |
| `action_advance_project_phase` | — |
| `action_register_document` | — |

Properties this buys:

- **Atomicity.** Each Action is one transaction. Half-built cascades are now impossible.
- **Unforgeable actor.** `triggered_by` comes from `auth.uid()`; the display name
  is resolved from `project_members` by JWT email. Neither is client-supplied.
- **Mandatory audit trail.** The `world_model_events` row is written in the same
  transaction as the mutation, so a write cannot exist without its event.
- **Agent-ready.** An agent given execute rights on these functions is safe by
  construction — there is no other write path for it to misuse.

Two behaviours changed as a side effect, both fixes:
- Approving an approval now moves its Change Order to APPROVED. Previously the CO
  stayed stuck in PENDING_APPROVAL forever.
- Approvals can only be decided once; closed NCRs cannot be reopened.

### Deleted

`src/lib/intelligence.ts` and `src/lib/actions.ts` are gone. The cascade rules
they held now live in the database, which is where they are enforced. Keeping a
second TypeScript copy that nothing called was a live risk of the two drifting —
particularly the approval tier thresholds, now solely in
`approval_tier_for_cost()`.

### The ontology registry

Migration 009 adds `ontology_object_types`, `ontology_links` and
`ontology_actions` — the object model as data the system can read about itself.
`ontology_actions` doubles as an agent tool manifest: name, description,
parameter schema, and which object types each Action cascades to. Verified
against `information_schema` so the registry cannot silently drift from the
functions it describes.

These tables are **descriptive, not authoritative** — the real tables and the
real Actions are the system; this describes them.

### The registry now drives the public page

Migration 010 opens the three `ontology_*` tables to `anon` so `/ontology` can
render from them. It also closes a gap 008 left: those tables were created in
009, *after* the write lockdown, so they had picked up Supabase's default
`grant all`. Nothing was exploitable — RLS was on with SELECT-only policies —
but the registry is what the agent builds its tool manifest from, and it should
not have been one permissive policy away from editable. 010 revokes the writes.

---

## 14. The Agent (added July 2026)

`supabase/functions/agent/index.ts`, surfaced at `/app/agent`.

### The design decision that matters

The function creates its Supabase client from **the caller's JWT**, not the
service-role key:

```ts
const supabase = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } },
})
```

Everything follows from that one line. The agent inherits exactly the signed-in
user's permissions — no more. It cannot write directly to a table, because §13
revoked those grants from `authenticated` and the agent *is* `authenticated`.
When it calls an Action, `auth.uid()` inside that function resolves to the human,
so `world_model_events` records them as the actor, not "the agent". There is no
second write path for it to reach for, and no privilege for it to escalate to.

If someone ever swaps in `SUPABASE_SERVICE_ROLE_KEY` to "fix" a permissions
error, all of that is gone at once: RLS off, write guard off, provenance
meaningless. That is the single change to never make to this file.

### Tools are generated, not hardcoded

On each request the function reads `ontology_object_types`, `ontology_links` and
`ontology_actions`, then builds:

- `list_objects` / `get_object` — table names come from the registry, never from
  the model, so a hallucinated table name resolves to nothing rather than to a
  query
- `get_event_history` — the append-only log, so the agent can explain *why*
  something is in the state it is in
- one tool per `ontology_actions` row where `is_agent_usable` — JSON Schema
  derived from the `parameters` JSONB, description carrying the cascade note

Adding an Action in SQL and registering it makes it available to the agent
without touching TypeScript. The registry is the tool manifest.

### Loop shape

Manual agentic loop, `MAX_TURNS = 8`. Two details that are easy to get wrong:

- the **entire** `response.content` array is pushed back as the assistant turn,
  not just the text — thinking blocks must be replayed verbatim or the next
  request is rejected
- all parallel `tool_result` blocks go into **one** user message; splitting them
  teaches the model to stop parallelising

Model is `claude-opus-5` with adaptive thinking, `output_config.effort: "high"`,
and server-side fallbacks enabled so a refusal is re-routed rather than returned.

### Configuration

`ANTHROPIC_API_KEY` must be set under *Project Settings → Edge Functions →
Secrets*. Without it the function returns
`{ error: "The agent is not configured on this project." }` with HTTP 500 — it
fails closed and says so, rather than degrading silently.

### What this does not yet do

- No conversation memory. Each request starts from an empty message list; the
  UI shows history but does not send it. Multi-turn follow-ups ("and what about
  the other one?") will not resolve.
- No streaming. The console waits for the complete response.
- No cost or rate limiting per user.

---

## 15. The /ontology page (rewritten July 2026)

### What was wrong with it

The page was a hardcoded array, and it had drifted badly. It documented ten
"entity types" including `SystemComponent` and `DocumentRevision`, which were
never built, and walked through a cascade on `M/Y TESSERA` / `NCR-2026-047` —
a vessel and a defect that do not exist. The public claim and the running
system had nothing to do with each other.

### What it does now

Reads `ontology_object_types`, `ontology_links` and `ontology_actions` at page
load and renders from them. Three tabs:

- **Object Graph** — an SVG of the nine types and eleven links. Hovering isolates
  a node's edges; clicking pins it and fills a detail panel with its links in
  both directions and the Actions that target it.
- **Actions** — all six, with their real parameter schemas expanded from the
  registry's `parameters` JSONB, and which object types each one cascades to.
- **Cascade** — the gate condition quoted from `action_raise_defect`
  (`severity in ('HIGH','CRITICAL') and coalesce(cost_impact, 0) > 0`) and the
  tier thresholds from `approval_tier_for_cost()`.

The counts in the hero are `types.length` / `links.length` / `actions.length`,
so the page cannot advertise a number the database does not agree with.

### The fallback

`FALLBACK_ONTOLOGY` in `src/lib/ontology.ts` mirrors migration 009. It is used
when Supabase is unconfigured, unreachable, or returns a partial result — a
marketing page must never render empty. It is a fallback, not a source of
truth; when it and the database disagree the database is right and this is
stale. Update it if 009's seed data changes.

### Graph layout

Node positions are hand-placed in `LAYOUT`, not force-simulated. Nine nodes is
few enough that a deliberate composition beats a solver, and fixed positions do
not jitter between renders. The arrangement is load-bearing: the structural
spine runs down the left, and the cascade turns the corner across the top
right. A type present in the registry but missing from `LAYOUT` is still drawn,
in a spare row, so the graph cannot silently under-report the model.

Edge labels are offset perpendicular to their line and anchored toward the side
they were pushed. Centring them on the line makes the halo that keeps them
readable erase the arrow underneath.
