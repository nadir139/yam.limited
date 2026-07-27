# YAM — Yacht Architectural Management

Premium yacht project management and owner representation. The repository holds
both halves of [yam.limited](https://yam.limited):

| Route | What it is | Needs a backend? |
| --- | --- | --- |
| `/` | Public marketing site | No |
| `/ontology` | Public refit-process ontology (credibility artifact) | No |
| `/login`, `/auth/callback` | Supabase magic-link sign-in | Yes |
| `/app/*` | **Project ZERO** — the authenticated world model: work packages, inspections, NCRs, change orders, owner approvals, documents, team | Yes |

The public pages render with no backend configured. Only `/app/*` needs Supabase.

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

> ⚠️ RLS is intentionally permissive (`USING (true)` on every table) and
> magic-link sign-up is unrestricted, so anyone who can receive email can sign
> in and edit the demo data. See `YAM-KNOWLEDGE.md` §12 for why this cannot be
> tightened without first gating sign-up.

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
