# Working on yam.limited

## Standing instructions from the owner

- **Ship every change through a PR, then merge it.** Push to the working branch, open a PR
  against `main`, and merge it once checks pass. Vercel deploys `main` to production.
- **Supabase changes are pre-approved.** Apply migrations, deploy Edge Functions and run SQL on
  project `xgpdfefxarllgykjbppn` without asking first. Still verify each change and test
  destructive SQL inside a rolled-back transaction before running it for real.
- Commit every migration applied to the live database as `supabase-migration-NNN-*.sql`,
  even ones applied by hand. Migration 020 once lived only in the database.

## Known limits

- `storage.objects` is owned by `supabase_storage_admin`. The `postgres` role (SQL editor and
  MCP) cannot alter its policies, so Storage policy changes go through the dashboard
  (Storage → Policies). See migration 023.
- The cloud sandbox cannot reach `*.supabase.co` or `yam.limited` over HTTP. Verify through
  the Supabase MCP (logs, SQL) and the Vercel MCP (deployment state) instead.

## Checks before pushing

`npm run typecheck`, `npm run lint` (0 errors) and `npx vite build`. Architecture and history
are in `YAM-KNOWLEDGE.md`; priorities are in `ROADMAP.md`.
