# YAM — what to build next

Written after the 6 Oct 2026 audit (branch `claude/lucid-ptolemy-kj9j7a`).
Ordered by impact over effort. Most items are a day or less.

## 0. Do now (no code)

| | What | Why | Effort |
|---|---|---|---|
| 0.1 | ~~Merge and deploy~~ | Done — PR #33, production build READY | — |
| 0.3 | Re-run the Lucky Bird job list in the agent | It should file ~10 work packages in one parallel turn, with live progress | 2 min |

## Digital twin track (agreed order, Oct 2026)

1. ~~Schedule data and Actions~~ — migration 026: baselines, FS/SS dependencies with lag,
   reschedule / link / unlink / baseline Actions, all in the audit log.
2. ~~Schedule page~~ — `/app/schedule`: forecast bars with plan ghost and baseline, critical path,
   change-order delay, markers for inspections, owner gates and NCRs; drag to reschedule with Undo.
3. ~~Agent scheduling~~ — `get_schedule` tool on the same engine as the chart
   (`supabase/functions/agent/schedule.ts`), and a live mini-Gantt under replies that touch the plan.
4. ~~Parts model~~ — migration 027 and `/app/parts`: a tree of systems and components that belongs
   to the vessel (or the property project), with make, model, serial and location; links from work
   packages, NCRs, inspections, change orders and documents; the part's record across every
   project; chips on work packages and NCRs; Gantt grouped by system; agent `get_parts` and part
   Actions.
5. **Next on this track.** Messages and photos attached to a part; part condition and service
   intervals (next service due → a work package proposed by the agent); drawings and manuals
   on the part; a property asset record so a building's parts outlive its project too.

## 1. Next — reliability (1–2 weeks)

1. **Batch Action for job lists.** `action_create_work_packages(p_items jsonb)`: one transaction, so a
   list is filed whole or not at all. Today the agent issues one call per item; a failure halfway
   leaves half a list.
2. **Preview before the agent writes in bulk.** For three or more writes, return a proposed list
   ("10 work packages, these disciplines") with Confirm/Edit, then commit. A wrong guess at
   discipline is cheaper to fix before it is in the audit log.
3. **Error states on every page.** *Half done:* a page that crashes now shows a retry screen inside the shell instead of a blank app (`ErrorBoundary`). Still open: a failed *query* shows "Loading…" or "Project not found".
   Add one shared `<QueryError retry>` and use it on all list and detail pages.
4. **Documents: store the path, sign on demand.** `file_url` holds a one-year signed URL. It is a
   bearer link that bypasses membership checks, and every document breaks a year after upload.
5. **CI on pull requests.** typecheck + lint + build + the agent harness from this audit (mock
   Supabase + mock Anthropic + Playwright). The repo has no tests at all; the only workflow is the
   GitHub Pages deploy being retired.
6. **Retire GitHub Pages.** Remove `deploy.yml`, `CNAME`, `public/404.html` and the `?redirect=`
   script once `curl -sI https://yam.limited` shows `x-vercel-id`.

## 2. Then — product (2–6 weeks)

1. **Jobs inside a work package.** The Lucky Bird list mixes real packages ("new loop system for
   Genua") with ten-minute tasks ("remove old windex"). A checklist of jobs under a package fits that
   better than ten separate packages. Needs one table, one Action and a checklist UI.
2. **Notifications for action items.** "Nothing emails them" — the sidebar badge is the only
   reminder. Send a daily digest email of open items plus an instant email on mention (Supabase
   Edge Function + Resend, or a pg_cron job).
3. **Capture from the boat.** Installable PWA, camera → NCR with photo in two taps, queue offline and
   sync on reconnect. Most findings start as a photo on a phone.
4. **Agent memory per project.** Store conversations server-side (per project, per user) instead of
   `sessionStorage`, so a thread survives a closed tab and a teammate can see what was asked.
5. **Cost & latency telemetry for the agent.** Log turns, tokens, cache hits and duration per request
   to a table. Needed before choosing a model or effort level on evidence.

## 3. Later

- **Model choice.** The agent runs `claude-opus-5`. Opus 5.5 costs less ($4/$20 vs $5/$25 per MTok)
  but defaults to `medium` effort and always thinks. Decide after the telemetry in 2.5, using an eval
  of ~20 real prompts.
- **Translate page prose.** Navigation and enums are translated; page text is English only.
- **Owner portal.** A read-only, approvals-first view for owners who should never see the yard's
  working detail.
- **Exports.** Weekly owner report (PDF) built from events and approvals; change-order register as XLSX.

## What this audit fixed (for reference)

- Agent stuck on "Reading the world model…": auth-lock deadlock in `AuthContext`. Requests never left
  the browser.
- Agent: streamed progress, Stop button, bounded waits, per-project threads, a correct cascade
  drawing. The function (v6, deployed) takes enums from the project's vocabulary, gives `uuid[]` an
  array schema, drops nulls so SQL defaults apply, caches its prompt and files lists in parallel.
- Realtime never delivered anything (the publication was empty). Fixed in migration 021.
- Security: `mention_context` was callable by anyone; anon EXECUTE was revoked on definer functions;
  storage is scoped to project members (023, applied).
- Dates: deadlines no longer show OVERDUE from 02:00 on their own day; "today" is local.
- Login no longer pre-fills a personal email. Sign-out clears cached data.
