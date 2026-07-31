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

### Conversation memory (added after first testing)

The first build sent no history: every request started from an empty message
list. In testing this was fatal, not cosmetic. Across five turns the agent
re-asked for the same severity, cost and location three times, took **zero**
Actions, and finally replied that the NCRs "don't exist yet… I'd have to invent
the substance of them" — one message after being given every detail. It was
also the hidden cause of the verbosity, since each answer had to re-establish
the whole project from scratch.

The console now sends the prior turns (12 max, 4000 chars each, error bubbles
dropped) and `sanitizeHistory` coerces them into alternating roles. The history
is client-supplied, so it is not trusted as a record of what happened — only as
context the user chose to re-send. That is the same trust level as the prompt,
and every tool remains bounded by the caller's own permissions, so a forged
history grants nothing. It is bounded for cost, not for safety.

### Object links and the cascade chain

`ObjectIndex` collects every row the agent reads, keyed by its human number
(`NCR-2026-001` → `{type, id, label}`), and the response carries it as `index`.
The console linkifies any of those numbers appearing in the reply, so the agent
writing "NCR-2026-001" produces a clickable chip into the record. Derived from
tool results rather than asked of the model, so a link can never point at
something that does not exist.

`changed` carries what an Action touched, in order: its own target first, then
whatever the cascade produced. The console draws that as connected nodes.
Prose describing that recording one thing created two others is exactly the
part a reader skims — the whole argument for a world model over a task list
should not be buried in a paragraph.

### What this does not yet do

- No streaming. The console waits for the complete response.
- No cost or rate limiting per user.
- No Action creates a work package, or re-links an existing defect onto one.
  Both were asked for in testing and both hit a wall.

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

---

## 16. Planning the work (migration 011)

### The gap

The Actions layer could record what went wrong but not plan the work. You could
raise an NCR, record an inspection result and decide an approval — but nothing
created a work package, and nothing created an inspection. The job list could be
seeded and never grown, which made the system a defect tracker bolted to a fixed
scope rather than a model of the project. Testing the agent surfaced it twice in
one conversation: it was asked to create an HVAC work package and to re-file an
NCR under it, and had no tool for either.

### What 011 adds

| Action | Does |
| --- | --- |
| `action_create_work_package` | Adds scope. Starts DRAFT. |
| `action_update_work_package` | Progresses it, books actuals. |
| `action_schedule_inspection` | Books an attendance *before* it happens. |
| `action_link_defect_to_work_package` | Attaches an open NCR to the scope it hits. |

Registering them in `ontology_actions` is what makes them available to the
agent — no TypeScript change. The `/ontology` page picked them up for the same
reason.

### Two guards worth keeping

**A work package cannot go COMPLETE while open NCRs are linked to it**, and the
rejection names them (`Cannot complete WP-MECH-007: open NCRs against it
(NCR-2026-007)`). This is the clearest demonstration of why defects and scope
belong in one model: the database refuses a claim the project's own records
contradict, instead of leaving someone to notice later. The UI surfaces that
message verbatim rather than rewording it.

**A closed NCR cannot be re-linked.** A settled record may already have an
approval granted against it; re-filing it under different scope rewrites
history.

### Numbering

`WP-<ABBREV>-<seq>` / `INSP-<ABBREV>-<seq>`, sequence taken from the highest
suffix sharing the same *prefix* — not per discipline. The seed is not perfectly
consistent (WP-HULL-002 is a STRUCTURAL package), so numbering follows the
numbers that exist rather than the category they ought to belong to.
`discipline_abbrev()` holds the mapping; an inspection with no work package
falls back to `INSP-CLASS-` or `INSP-GEN-`.

### Partial updates

In `action_update_work_package` a null parameter means "leave this field alone",
so the Action can overwrite a value but never clear one. `actual_start` and
`actual_end` are filled from the status when the caller omits them: a package
that is ACTIVE started, one that is COMPLETE ended.

---

## 17. Object pages and recorded history (July 2026)

### The 404

`WorkPackageList` navigated to `/work-packages/${id}` — missing the `/app`
prefix — so every work package row fell through to NotFound. It was the only
occurrence of that mistake, but a second dead link existed alongside it:
`ChangeOrderList` linked to `/app/change-orders/:id`, a route that was never
registered. Both are fixed; `ChangeOrderDetail` is new.

### ObjectHistory

`src/components/ObjectHistory.tsx` renders the complete recorded history of one
object from `world_model_events`, oldest first, showing only the fields that
actually changed as `before → after` with the actor and timestamp. Events
carrying `cascade_from_event_id` are marked as consequences rather than
decisions.

`fetchObjectEvents` is deliberately unbounded, unlike `fetchEvents` (which caps
at 20 for the dashboard): an object's own page should show everything that ever
happened to it. Nothing here is a changelog someone maintains — every Action
writes its event in the same transaction as its mutation, so the history cannot
drift from what actually happened.

It is mounted on the work package, change order and NCR detail pages. Objects
created by the original seed have no events, and the empty state says so rather
than implying nothing happened.

### A type that was wrong

`WorldModelEvent` was missing `triggered_by_name`, which the table has and every
Action writes. The name is resolved from `project_members` at write time rather
than joined at read time, so history still reads correctly after someone leaves
the project.

---

## 18. The chat as the working surface (July 2026)

The agent console is intended to be where most work happens — the user says what
they want, the agent does it. Three things blocked that.

### The conversation was lost on every navigation

Clicking an object reference navigated away, and the console's turns lived only
in component state. Coming back gave a blank page with no way to resume: no
memory, no history, nothing to scroll. Turns are now persisted to
`sessionStorage` (`yam.agent.turns`) and restored on mount — per tab, cleared
when the tab closes, which matches the lifetime of a working conversation. A
**Clear conversation** control appears once there is something to clear.

The scroll-to-bottom effect skips its first run when a conversation was
restored, so returning to the page leaves you where the thread was rather than
yanking you to the end.

### Objects now open inside the chat

Clicking a reference toggles an inline panel under that turn instead of
navigating: key fields, and the actions that object supports —
approve/reject for an Owner Approval, a status select for an NCR or work
package. Several can be open at once, they close independently, and an
external-link icon still opens the full record for anyone who wants it.

Panels read from the lists React Query already holds, so opening one costs no
round trip and reflects changes made anywhere else in the app. `ChatObjectPanel`
is keyed by object type; a type it does not know renders its number and a link
rather than failing.

Inspections are the one case that needed a form rather than a control — result,
date and notes — so `InlineInspectionResult` expands in place instead of opening
the full dialog, which would have sent the user out of the chat. Notes are
required for anything other than a pass, enforced by the field itself. After a
FAIL or CONDITIONAL_PASS it offers to raise the NCR, through `RaiseDefectForm`;
that one is a dialog rather than a route change, so the conversation survives it.
Amending an already-recorded result is allowed, because
`action_record_inspection_result` allows it and every amendment lands in the
object's history.

### Markdown was rendering as literal asterisks

The agent writes `**bold**` and `- ` bullets and the console printed them raw.
`renderInline` handles exactly that subset, building React nodes — never
injected HTML, since the reply is model output.

---

## 19. Roles become permissions (migration 012)

### What "role" used to mean

Nothing. The user picked one at sign-in and it was stored in `localStorage`
under `yam_role_<email>`. No Action ever read it, and anyone could change their
own role from the browser console. The Actions layer made the write path
*auditable* but not *authorised*: it recorded who did something, never whether
they were allowed to.

### What it means now

`current_actor_role()` resolves the role from `project_members` by the verified
JWT email. `action_permissions(action_key, role)` holds the matrix as data, and
every Action begins with `perform require_permission('<its own name>')`.

The matrix is a table rather than a `CASE` statement so it can be read by the
`/ontology` page and the agent, and changed without a deploy. Reading it is
public; writing it is granted to nobody.

### The shape of the matrix

- **Anyone on the project can raise an NCR, upload a document, and post.**
  Reporting a problem is never gated. A system that makes bad news hard to file
  gets the bad news late, which is the failure this product exists to prevent.
- **Recording a survey result** is the class surveyor, yard QC and owner's rep.
- **Scope and money** — creating and updating work packages, re-linking NCRs —
  is the owner's rep, yard PM and naval architect. Not the captain, not
  subcontractors, not class.
- **Approvals** are the owner and the owner's rep, and `require_approval_authority`
  adds the rule the tiers always implied but never enforced: Tier 3 (over
  €50,000) is the owner's decision alone.
- **Advancing the project phase** is the owner's rep only.

### How the guard was applied

Ten functions each needed one line. Rather than re-emitting ten bodies by hand,
where a transcription slip would silently change behaviour, the migration reads
each definition from `pg_catalog` and inserts the call after its outer `begin`.
Verified first that every `action_*` function contains exactly one occurrence of
that marker, and afterwards that each contains exactly one guard. Re-creating
the function proves it still compiles. The block is idempotent — a second run
inserts nothing.

### ⚠️ Behaviour change

An authenticated user whose email is not in `project_members` can now call **no
Action at all**; they get `You are not a member of this project`. Reads are
unaffected, so they can still see everything — that is the pre-existing RLS
looseness recorded in §12, not something 012 introduced.

### The client

`AuthContext` resolves name and role from `project_members`; the sign-in screen
no longer asks for a role, because it was never the user's to choose.
`usePermissions()` exposes `can('action_x')`, used to hide controls a role
cannot use. That is courtesy, not security: every Action re-checks, and a client
that skips the check is refused by Postgres.

---

## 20. Conversation, and immutability (migration 013)

### TRUNCATE was open

Migration 008 revoked `INSERT`/`UPDATE`/`DELETE` from `anon` and
`authenticated` and missed `TRUNCATE`, which Supabase grants by default.
`TRUNCATE` **bypasses row-level security entirely** — a holder of the public
anon key could have emptied `defect_records` in one statement and no policy
would have been consulted. Closed, along with `TRIGGER` and `REFERENCES`, and
`ALTER DEFAULT PRIVILEGES` now stops new tables picking the grants back up —
which is exactly how 009's registry tables ended up writable.

Both roles now hold `SELECT` and nothing else, on all 15 tables. The check is in
the README; run it after any schema change.

### Messages

`messages` uses the same polymorphic link documents use, so a thread hangs off
the object it concerns. That is the whole point: "what did the yard say about
the chiller" is answerable because the conversation is attached to the chiller's
work package rather than filed in a room called `#general`.

Registered in `ontology_object_types` as MESSAGE, which means the agent's
`list_objects MESSAGE` and `get_object` tools are **generated, not written** —
the payoff from building the tool manifest off the registry. Conversation
therefore enters the world model rather than sitting beside it.

**Append-only by construction.** No Action edits or deletes a message, and
neither role holds `UPDATE` or `DELETE` on the table. A message is a statement
someone made at a time; unmaking it would make the record a worse witness than a
notebook. `action_post_message` is permitted to all seven roles — excluding
anyone would leave a hole exactly where the site knowledge lives.

### `kind`, and learning from side quests

`UNPLANNED_WORK` is the load-bearing one. The extra half-day someone spends
re-bedding a flange "while we were in there" is invisible in every system that
only tracks the plan, and it is precisely what you want to know before scoping
the next survey. Tagged, it collects on `/app/messages` under **Unplanned
work**, with the object it happened against, as a list you can read at the end
of a job.

The others: `DECISION` so the reason survives the person who took it,
`MEETING_NOTE`, `HANDOVER`, `NOTE`.

### The hook for meetings

`source` is `APP | MEETING | EMAIL`, and `meeting_ref` groups an import. A
transcript arrives as messages with `source = MEETING` sharing a ref, and lands
in the same thread as what people typed. The column and the read path exist; the
video integration does not.

### Where threads appear

Work package and change order detail pages (a Conversation tab), the NCR page (a
card), and `/app/messages` for the project channel plus the unplanned-work view.

---

## 21. More than one project (migration 014)

Until 014 the app was Project ZERO with the seams painted over. Two habits made
that structural rather than cosmetic.

### Every read policy was `USING (true)`

Any signed-in address could read every row of every project. With one demo
project that reads as a permissive demo; with a real second project on the same
database it is a data breach waiting for a second tenant. Reads are now
`USING (is_project_member(project_id))`, and `projects` and `vessels` get the
two special cases they need — `projects` keys on `id`, and a vessel is visible
through the project that refits it.

Verified by signing a second address in and counting: zero rows from every
domain table.

### The Actions guessed the project

Every creating Action resolved its project as `select id from projects order by
created_at limit 1` — "the first project that exists". Harmless with one.
Silently wrong with two: an NCR raised on the Sardinia property would have been
filed against the ketch, and nothing would have looked broken.

`resolve_project(p_explicit uuid)` replaces the guess. Given null it looks up
the caller's memberships, and **raises rather than picking** when there is more
than one. Refusing beats guessing here: a wrong project assignment is invisible
for weeks.

### Role was checked on the wrong project

Migration 012's guard was `require_permission('action_x')` — does the caller
hold a role permitting this *anywhere*. `require_permission_for_object` resolves
the object's own project first, so a YARD_PM on one project cannot act on
another project's objects.

### A DO block that silently did nothing

The first attempt at rewriting those guards looped over a 2-D array and sliced
it `pairs[i:i][1:3]`, which matches nothing in Postgres. The block ran, threw no
error, and changed not one function. It was caught only because the result was
verified afterwards — which is the entire argument for verifying afterwards. The
replacement is one explicit `rewrite_action_guard()` call per function, each
returning what it did.

### Still to do

`action_raise_defect`, `action_register_document` and
`action_advance_project_phase` still hardcode
`'a1b2c3d4-0002-0000-0000-000000000001'`. Each needs a `p_project_id` threaded
through `resolve_project()`, which changes its signature and therefore the
client and the registry with it. The client still hardcodes `PROJECT_ID` in
`src/lib/db.ts` (11 call sites) and has no project switcher.

---

## 22. The reason, and the correction (migration 015)

Reported from use, not found by review, and the most instructive bug in the
project so far.

Someone raised an NCR for a light in the master cabin, closed it, and typed
"forget about the light, it was the switch actually" into the closure notes box.
Asked about that NCR afterwards, the agent reported €30, one day, closed, no
comment — every word true of the row, and none of it true of the job.

### The note was never sent

`DefectDetail.tsx` collected `closeNotes` into React state; the mutate call
omitted it. `action_update_defect_status` had no notes parameter to send it to.
In a system whose entire claim is that nothing is lost, the single most
important fact about a closure was discarded at the browser — invisibly, because
the field looked like it worked. That text is gone. It was never written
anywhere; there was nothing to recover.

The note is now part of the Action, and **required** for `CLOSED` and
`DISPUTED` — the two transitions that end an argument. It is written to
`world_model_events.after_state.reason` *and* posted as a message on the NCR's
thread, so the agent picks it up with the rest of the record rather than only
when it thinks to read the audit log.

### The numbers could not be corrected

Even with the note, the figures were stuck. The cost and duration on an NCR are
an estimate made in its first five minutes; closing was terminal; €30 and one
day stayed €30 and one day forever. The project totals were built on guesses
nobody could correct, so the agent's only remaining move was to file a prose
note saying the record was wrong.

`action_amend_defect_impact` corrects cost, schedule, root cause and
description, **including on a closed NCR** — closing ends the status, not the
record. It is not an edit: the old values go into the event's `before_state`,
the reason is required, and the change is posted to the thread. What was first
believed stays recoverable alongside what turned out to be true, which is the
difference between an ontology and a spreadsheet.

Guards, all verified inside a rolled-back transaction: no reason → refused,
nothing to change → refused, negative cost → refused, close without a note →
refused.

### The agent could not see any of it

Both fixes would have been useless on their own, because the agent had no tool
that read one object's history. `get_event_history` returns the *project's* last
N events, newest first — an NCR's own story was reachable only by luck. Hence
`get_object_story(object_type, id)`: the row, its events oldest-first, and every
message on its thread, in one call. The system prompt now says a row is not the
whole record, and to read the story before reporting what anything cost.

### Where it appears

A required closure-notes field on the NCR page and a staged reason prompt in the
chat panel (the select no longer fires straight into a refusal). "Correct
impact" opens `AmendDefectImpact` — a dialog on the NCR page, expanded in place
in the chat. `ObjectHistory` pulls `reason` out of the diff and renders it as a
quote, because it is why the other fields moved, not another field that moved.

---

## 23. Finishing multi-project (migration 016, and the client)

§21 scoped the reads and rewrote the object-scoped Actions, then stopped. This
is the rest, and it turned up two holes that were invisible from the interface.

### `resolve_project` trusted its argument

```sql
if p_explicit is not null then
  return p_explicit;    -- no membership check
end if;
```

Unreachable with one project. With two it is an escalation: name any project's
uuid and the Action writes into it. It now verifies membership before returning.

### Six Actions asked the wrong question

`action_raise_defect`, `action_register_document`,
`action_advance_project_phase`, `action_create_work_package`,
`action_schedule_inspection` and `action_post_message` all called the
one-argument `require_permission(key)` — "does this caller hold a permitting
role *anywhere*". A YARD_PM on the ketch could have raised NCRs against
somebody else's property. It is the same bug §21 fixed for the object-scoped
Actions and never applied to the creating ones.

Each now takes `p_project_id`, defaulting to null so a single-project user is
unaffected, and guards with `require_permission(key, resolve_project(p_project_id))`.
The one-argument `require_permission(text)` is **dropped**, not merely unused:
leaving it would let the next Action written pick the wrong one by autocomplete.

### The probe found what review did not

Dropping `current_actor_role()` broke two callers the `action\_%` scan missed,
because neither is an Action:

- `action_post_message` declared `v_role user_role := current_actor_role()` in
  its DECLARE block, which the rewrite left alone.
- `require_approval_authority` — the Tier-3 owner gate called from
  `action_decide_approval`. Between one migration and the next, **every owner
  approval failed outright.**

Both were caught by running the Actions inside a rolled-back transaction with
a faked JWT claim, not by reading the diff. Changing anything underneath an
Action means exercising the Action.

```sql
begin;
create temp table probe(t text, outcome text);
grant all on probe to authenticated;
-- set up rows as superuser, then:
set local role authenticated;
set local request.jwt.claims = '{"email":"...","sub":"...","role":"authenticated"}';
-- ... do $$ begin perform action_x(...); ... exception when others then ...
select * from probe;
rollback;
```

Six probes, all passing: writing into a project you are not in is refused;
reading one returns zero rows; posting without naming a project when you are on
two is refused; naming the second project files it there with the role you hold
*there*; NCR numbering restarts per project (`NCR-2026-001` on a fresh project,
not `-013`); work packages likewise.

### PROPERTY

`project_type` gained `PROPERTY`. A building has no vessel, no class society
and no haul-out, but it carries exactly the same work packages, findings,
change orders and approvals — which is the argument for one ontology rather
than a second product. `projects.vessel_id` stopped being `NOT NULL` in §21;
this is what makes use of it.

### The client

`PROJECT_ID` was a module constant in `db.ts` referenced by eleven queries.
Every read now takes the project explicitly and every cache key carries it:
`['defects', projectId]`. That last part is not cosmetic — without it, React
Query would serve the ketch's NCRs under the property's heading for the moment
between switching and refetching.

- `ProjectContext` holds the list (RLS-filtered) and the selection, persisted
  per user email rather than globally, and falls back to the first project when
  the stored one is no longer readable.
- `useMyRole()` asks about the **active** project. `AuthUser` no longer carries
  a role at all: a role is held on a project, not by a person, and storing one
  would have to pick.
- "Signed in, member of nothing" is a real state and gets its own screen
  (`NoProjects`) rather than eleven empty tables.

### The agent

The system prompt hardcoded "Project ZERO, a 55m sailing ketch undergoing a
RINA 5-year special survey at Pendennis Shipyard". It is now built from the
project row, and told explicitly that not every project is a boat.

The client sends `projectId`; the function does not trust it, but neither does
it need a branch to check it — `projects` is read through the caller's own JWT
under a membership-scoped policy, so a project that is not theirs simply
returns no row. Every read tool filters on the project, and `p_project_id` is
injected by the dispatcher and **hidden from the tool schema**: exposing it
would offer the model a decision it has no basis for.

`action_create_project` is registered but `is_agent_usable = false`. An agent
that can create a project can create somewhere to hide work.

---

## 24. Language

Five languages — English, Italian, French, Spanish, German — with no i18n
framework. i18next brings a plugin system, a resource loader and a backend;
what this needs is a flat dictionary per language, a lookup that falls back to
English, and `{placeholder}` interpolation. That is about forty lines in
`src/lib/i18n.tsx`.

**English is the fallback, not the key.** A missing Italian string renders the
English sentence, never `project.emptyTitle` — a half-translated app should
look unfinished, not broken.

Coverage is **measured, not claimed**: `translationCoverage()` counts how many
of English's keys each dictionary actually has, and the language menu shows a
percentage for anything under 95%. Nobody picks German expecting the whole app
and quietly gets half of it.

What is translated: the application chrome and every enum that appears across
screens — navigation, project types, phases, roles, statuses, severities,
disciplines. Those carry the most weight per string, because they appear on
nearly every page. Page prose and form copy are still English.

Terminology follows trade usage rather than dictionaries: *non conformità* for
NCR in Italian, *varo/alaggio* for haul out, *pruebas de mar* in Spanish,
*Klassifikationsgesellschaft* in German. For the Italian property vertical,
*difformità* is the word a technician actually uses for an unpermitted
balcony — not *difetto*.

Detection order: stored choice → `navigator.languages` → English. Read in an
effect rather than a `useState` initialiser, because this module is imported by
the marketing bundle and touching `localStorage` during module evaluation
breaks any environment without it.

---

## 25. What rendering the app caught that building it did not

The multi-project rewrite type-checked and built cleanly, and was still wrong in
three places. All three were found by putting the authenticated shell in a
browser with stubbed data — none is the kind of thing a compiler can see.

### `Project ZERO — World Model Overview`

Hard-coded as the Dashboard subtitle, and on the login page. Correct for the
demo, wrong for every project after it. Now `vessel name — project name`.

### `NaN% used`

`Math.round((budget_spent / budget_locked) * 100)` is `NaN` when both are zero,
and `action_create_project` defaults the budget to zero. So the very first
thing a newly created project showed was **NaN% used** — the Sardinia property
would have opened on it. Now reads "Not set" until a budget exists.

### The switcher named the wrong thing

The project row is called "5-Year Survey 2026"; everyone working on it calls it
"Project ZERO", which is the *vessel*. A switcher showing only the project name
would have been accurate and unrecognisable. `fetchMyProjects` now joins the
vessel name and the subtitle leads with it.

### Two harness artifacts that were NOT bugs

The first run also showed "Phase 0 of 7" and a blank phase label. Both came
from the stub returning a JSON array where PostgREST returns a bare object for
`.single()` — so every field was `undefined`. Worth recording because the
temptation was to "fix" the app. **A test double that is wrong about the
protocol manufactures bugs that do not exist.** The stub now honours the
`Accept: application/vnd.pgrst.object+json` header.

### Why there is no test harness checked in

Simulating a Supabase session from the outside does not work: planting a
session in `localStorage` or calling `setSession()` makes supabase-js hang
before it issues a single request, and chasing that is testing supabase-js
rather than this app. The harness that worked mounted the tree with a supplied
auth context, which needed `AuthContext` exported. That export was reverted
with the harness — an unused export added for a deleted test is exactly the
kind of thing that rots. Re-add it the same way when this is needed again.

### Known limitation: the phases are vessel-shaped

A PROPERTY project still shows the vessel phase ladder — Pre-Survey, **Haul
Out**, Structural, Systems, Interior, **Sea Trials**, Delivered — and offers
"Advance to Haul Out" on a building. `project_phase` is one enum for every
project type. Making it per-type changes the enum, `action_advance_project_phase`
and the timeline component together, so it is deliberately not smuggled in
here. It is the first thing to fix for the property vertical.
