# YAM — Yacht Architectural Management

Premium yacht project management and owner representation. The repository holds
both halves of [yam.limited](https://yam.limited):

| Route | What it is | Needs a backend? |
| --- | --- | --- |
| `/` | Public marketing site | No |
| `/ontology` | Public refit-process ontology (credibility artifact) | No |
| `/login`, `/auth/callback` | Supabase magic-link sign-in | Yes |
| `/app/*` | The authenticated world model — work packages, inspections, NCRs, change orders, owner approvals, documents, team — for whichever of your projects is selected | Yes |

The public pages render with no backend configured. Only `/app/*` needs Supabase.

`/app/*` is multi-project: the top bar switches between every project you are a
member of and can start a new one, and the team page adds people to it by email.
Someone invited appears on the team immediately, before they have ever signed
in — the distance between the invitation and their first visit is a fact worth
keeping. A project is not necessarily a vessel. `PROPERTY` projects model buildings with
the same work packages, findings, change orders and approvals — and their own
vocabulary: the phase ladder runs pre-survey → document gathering → survey →
compliance review → remediation → certification, the disciplines are planning,
cadastral, energy and landscape, and documents are filed as *visura catastale*,
*planimetria*, *permesso di costruire*, *sanatoria*, *agibilità* and *APE*
rather than as "Other". That vocabulary lives in `ontology_vocabulary`, so a new
vertical is rows in the registry rather than a schema change.

The interface speaks English, Italian, French, Spanish and German, chosen from
the top bar and remembered per browser. Translation covers the application
chrome and every enum that appears across screens — navigation, project types,
phases, roles, statuses, severities, disciplines. Page prose is still English;
the language menu shows each language's measured coverage rather than implying
it is complete.

For architecture, the object ontology, and the session log, see
[`YAM-KNOWLEDGE.md`](YAM-KNOWLEDGE.md).

## Tech stack

Vite · React 18 · TypeScript · Tailwind CSS v3 · shadcn/ui (Radix) ·
TanStack Query · Supabase (Postgres + Auth + Realtime + Storage) ·
React Router.

## Local development

```sh
npm ci
cp .env.example .env   # fill in the Supabase URL + anon key
npm run dev            # http://localhost:8080
```

Without a `.env` the dev server still runs — you get the public pages, and
`/app/*` reports that it is unconfigured rather than crashing.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on :8080 |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `npm run lint` | ESLint |

### Types are generated, not written

`src/lib/database.types.ts` is generated from the live schema and **must not be
edited by hand**. `src/lib/types.ts` derives every enum and row type from it, so
`Discipline` *is* the Postgres enum rather than a copy of it.

Regenerate after any migration:

```sh
supabase gen types typescript --project-id xgpdfefxarllgykjbppn \
  > src/lib/database.types.ts
```

Skipping this is not cosmetic. Migration 018 added four values to the
`discipline` enum, the hand-written union did not learn about them,
`Record<Discipline, …>` still typechecked with nine keys, and the first property
work package white-screened the Work Packages page.

`strict` is on. It was off until the generated types landed, which hid the
nullability the schema actually declares — thirty-one sites divided by or
formatted a nullable column, and one had already shipped as "NaN% used" on every
newly created project. `src/lib/format.ts` is where that now lives.

> **Use `npm run typecheck`, never a bare `tsc --noEmit`.** The root
> `tsconfig.json` is a solution file (`"files": []` plus project references), so
> `tsc --noEmit` type-checks *nothing* and always exits 0. Duplicate exports
> reached `main` and broke production for four months behind exactly that gap.

## Deployment

**[yam.limited](https://yam.limited) is served by GitHub Pages**, built and
published by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on
every push to `main` (or a manual *Run workflow*). The pipeline is
`typecheck → build → upload → deploy`; the type check gates the build.

- The `CNAME` file (`yam.limited`) is copied into `dist/` by the workflow, and
  `.nojekyll` stops Pages running Jekyll over the output.
- **Settings → Pages → Build and deployment → Source must be "GitHub Actions".**
  If it is set to "Deploy from a branch" instead, Pages serves the repository
  root — where `index.html` is the Vite *source* file pointing at
  `/src/main.tsx`. The browser refuses that with *"Expected a
  JavaScript-or-Wasm module script but the server responded with a MIME type of
  application/octet-stream"* and the site is a white page, while every workflow
  run still reports success. The last step of the deploy job now fetches
  yam.limited and fails the run if it is not serving the bundle that was just
  published.
- `vercel.json` is **not** part of the live deployment. A Vercel project
  (`project-0`) does build this repo, but it has no custom domain attached and
  only serves preview URLs. If it is ever promoted to production it needs its
  own copy of the environment variables below.

### Required repository secrets

Vite inlines `VITE_*` variables **at build time**, so they must exist in CI — a
local `.env` has no effect whatsoever on the deployed bundle. Set both under
*Settings → Secrets and variables → Actions*:

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://xgpdfefxarllgykjbppn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the `anon` key from *Supabase → Project Settings → API* |

The `anon` key is designed to be public — it ships inside the client bundle and
is protected by row-level security, not by secrecy.

**Changing a secret does not rebuild the site.** Push to `main`, or re-run the
latest workflow, for a new value to reach production.

If either is missing the build still succeeds and the public pages deploy
normally, but every `/app/*` route loads without data and the workflow logs a
warning. The guard lives in
[`src/lib/supabase.ts`](src/lib/supabase.ts) (`isSupabaseConfigured`) — without
it, `createClient` throws at module load and takes down *every* route,
including the marketing homepage.

### Database

Schema, migrations and seed data are checked in at the repository root and are
applied by hand in the Supabase SQL editor, in this order:

1. `supabase-schema.sql` — tables, enums, indexes, RLS enabled
2. `supabase-migration-001-permissions.sql` — permissive RLS policies
3. `supabase-migration-002-storage.sql` — `project-documents` bucket
4. `supabase-migration-003-drop-members-fk.sql`
5. `supabase-migration-004-drop-event-fk.sql`
6. `supabase-seed-v2.sql` — Project ZERO demo data
7. `supabase-migration-005-contact-inquiries.sql` — contact form storage
8. `supabase-migration-006-actions-layer.sql` — first `SECURITY DEFINER` Actions
9. `supabase-migration-007-actions-remaining.sql` — the rest of the Actions
10. `supabase-migration-008-lock-write-path.sql` — revokes direct table writes
11. `supabase-migration-009-ontology-registry.sql` — the self-describing registry
12. `supabase-migration-010-public-ontology.sql` — registry readable by `anon`
13. `supabase-migration-011-work-package-actions.sql` — Actions that plan the work
14. `supabase-migration-012-role-permissions.sql` — roles become permissions
15. `supabase-migration-013-messages-and-immutability.sql` — conversation, and nothing gets deleted
16. `supabase-migration-014-multi-project.sql` — reads scoped to project membership; Actions stop guessing the project
17. `supabase-migration-015-closure-notes-and-corrections.sql` — closing an NCR requires a reason; a closed NCR can still be corrected
18. `supabase-migration-016-actions-take-a-project.sql` — every Action takes an explicit project and checks the role held *on it*
19. `supabase-migration-017-membership-lifecycle.sql` — projects can be staffed; invited, arrived and departed are all recorded
20. `supabase-migration-018-vocabulary-per-project-type.sql` — phases, disciplines, document types and root causes become per-vertical

Migrations 006–008 are the important ones. After 008 the `authenticated` and
`anon` roles hold **zero** `INSERT`/`UPDATE`/`DELETE` grants on the domain
tables: the only way to change anything is to call an Action via
`supabase.rpc()`. That is what makes the cascade rules and the audit trail
properties of the database rather than conventions the client is trusted to
follow. See `YAM-KNOWLEDGE.md` §13.

Migration 010 is the one exception to "everything needs a login": the three
`ontology_*` registry tables are readable by `anon`, because the public
`/ontology` page renders the object model from them. That publishes the *shape*
of the system — type names, link names, Action signatures — and nothing else.
Every domain table still returns zero rows to an anonymous caller, which is
worth re-checking after any policy change:

```sql
set local role anon;
select count(*) from defect_records;  -- must be 0
select count(*) from ontology_object_types;  -- must be 10
```

After migration 013, `anon` and `authenticated` hold **`SELECT` and nothing
else** on every table — 008 had left `TRUNCATE` granted, which bypasses RLS
entirely. Worth re-checking after any schema change:

```sql
select grantee, string_agg(distinct privilege_type, ',') as privs
  from information_schema.role_table_grants
 where grantee in ('anon','authenticated') and table_schema = 'public'
 group by grantee;   -- must be exactly: SELECT
```

After migration 014 every read policy is `USING (is_project_member(project_id))`
rather than `USING (true)`. Magic-link sign-up is still unrestricted — anyone who
can receive email can create an account — but an account that belongs to no
project now reads zero rows from every domain table. Worth re-checking with a
second address after any policy change:

```sql
-- signed in as an address with no project_members row
select count(*) from defect_records;   -- must be 0
select count(*) from messages;         -- must be 0
select count(*) from work_packages;    -- must be 0
```

### Edge Functions

Two Deno functions live in `supabase/functions/` and are deployed to the
Supabase project (they are **not** part of the GitHub Pages build):

| Function | Purpose |
| --- | --- |
| `contact-inquiry` | Validates the public contact form, writes it to `contact_inquiries`, then sends a notification via Resend |
| `agent` | The world-model agent — reads the ontology registry, exposes it to Claude as tools, runs the tool loop |

Both need secrets set under *Supabase → Project Settings → Edge Functions →
Secrets* (these are server-side and never reach the browser):

| Secret | Used by |
| --- | --- |
| `RESEND_API_KEY` | `contact-inquiry` |
| `ANTHROPIC_API_KEY` | `agent` |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform.

The `agent` function deliberately builds its Supabase client from **the caller's
JWT, not the service-role key**. Every tool it runs therefore executes with
exactly the signed-in user's permissions — the write guard from migration 008
applies to it unchanged, and `world_model_events` records the human as the
actor. Swapping in the service-role key would silently remove every one of those
guarantees.

### Client-side routing on Pages

GitHub Pages has no server-side SPA rewrite — it serves `public/404.html` for
any path that is not a real file. That page stashes the requested path in
`?redirect=` and bounces to `/`, where an inline script in `index.html` restores
it with `history.replaceState` before the router boots.

**Both halves are required.** Dropping either one silently sends every deep
link — including the magic-link `/auth/callback` — to the homepage.

## Performance notes

Things that are load-bearing and easy to undo by accident:

- **The hero ASCII animation lives in `public/sailing-ascii.txt`**, not in a
  module. It is ~2.6 MB of frame data; importing it back into the bundle
  reintroduces a 3.5 MB JavaScript payload on the marketing page. It is fetched
  after first paint and cached at module scope.
- `AsciiVideo` writes frames through a ref with `textContent`. Rendering them
  through `useState` puts an 18 kB text node into React's reconciler 24 times a
  second.
- **Every route except the landing page is `React.lazy`-loaded** in `App.tsx`,
  so marketing visitors never download the authenticated app. React, Supabase
  and TanStack Query are split into separate cacheable vendor chunks in
  `vite.config.ts`.
