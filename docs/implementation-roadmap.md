# Implementation Roadmap — Personal Task Manager

Status: planning only. Repository was empty at audit time (2026-10-18); no code exists yet.

## Stack and versions (verified via `npm view`, 2026-10-18)

| Package | Version | Note |
|---|---|---|
| next | 16.4.2 | App Router, Node 22 compatible |
| tailwindcss | 4.3.3 | CSS-first config (`@theme`), no `tailwind.config.js` by default |
| @supabase/supabase-js | 2.118.0 | |
| @supabase/ssr | 0.12.7 | Cookie-based auth for App Router; use `getClaims()`/`getUser()` server-side, never trust `getSession()` alone |
| @google/genai | 2.30.0 | Gemini, server-only (AI assistant) |

Tooling: Node 22.19, npm 10.9, pnpm available (choose **pnpm**). Supabase CLI is **not** installed; use `npx supabase` or install it in Phase 0. Re-verify APIs against official docs at each phase start (Next 16 changes: async request APIs, `proxy.ts` replacing `middleware.ts`).

## Design tooling

- `ui-ux-pro-max`: **not installed**. `frontend-design`: present in the official marketplace (`~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design`) but **not installed**. Installed plugins: claude-mem, canva only.
- Action in Phase 0: ask the user to run `/plugin install frontend-design@claude-plugins-official`, then read it. Meanwhile use the built-in `artifact-design` and `dataviz` skills as references (dataviz for Phase 6 analytics). Do not claim these were used until loaded.
- Direction: Linear-inspired, light default (dark optional later), Inter/Geist via `next/font`, 13–14px compact rows, 1px subtle borders, neutral palette + single accent, status colors with non-color cues, visible focus rings, WCAG AA.

## Cross-cutting rules

- TypeScript `strict`, `noUncheckedIndexedAccess`. Feature modules: `src/features/<name>/{components,actions,queries,schema.ts}`. Files small.
- Zod validation at every server boundary (Server Actions / Route Handlers).
- RLS on **every** table, enabled in the same migration that creates it. Policies use `(select auth.uid())`. Indexes on all policy columns.
- Secrets: only `NEXT_PUBLIC_SUPABASE_URL` / publishable key reach the browser. `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` only in server-only modules (`import "server-only"`), Vercel env vars, `.env.local` git-ignored; commit `.env.example`.
- Tests: Vitest (unit), Playwright (e2e), pgTAP or SQL-based RLS tests. Report only what was executed.
- Optimistic UI with undo (toast) for all destructive/bulk mutations.

## Key design decisions (resolve in the named phase)

1. **Occurrence model** (Phase 3): `tasks` (definition) vs `task_occurrences` (per-date instance with its own status). Carry-forward creates a new occurrence and marks the old one `incomplete`, preserving history. Recurring tasks materialize occurrences lazily/ahead by a window, never rewrite past rows.
2. **Time zones**: store `timestamptz`; store a per-user IANA timezone in `profiles`; "day" is a `date` column computed in the user's zone.
3. **Admin access**: `profiles.role` in (`user`,`admin`) set only via service role / SQL, never client-writable. Admin read access via explicit RLS policies using a `security definer` `is_admin()` function, read-only, with an audit log table. Admin must never be able to write user data.
4. **Auth**: email+password and magic link first; OAuth optional.

## Phases

### Phase 0 — Foundation
Scaffold Next.js (TS strict, Tailwind 4, ESLint, Prettier, Vitest, Playwright), `docs/`, `.env.example`, `.gitignore`, git init, Supabase project link + local CLI, design tokens, app shell, install design skill.
**Acceptance:** `pnpm lint`, `typecheck`, `test`, `build` pass (executed and reported); app shell renders responsive at 375/768/1280; no secrets committed.

### Phase 1 — Auth, profiles, isolation
Supabase SSR clients (browser/server/proxy), sign up/in/out, session refresh, protected routes, `profiles` table + trigger, roles, timezone.
**Acceptance:** unauthenticated users redirected; RLS test proves user A cannot read/write user B's profile; role cannot be self-escalated.

### Phase 2 — Core tasks and daily view
`categories`, `tasks` schema + RLS; statuses New/Pending/Done/Incomplete; priority; quick-add (global `c`/`/`), inline edit, keyboard nav, status toggle, undo; today view + date navigation.
**Acceptance:** create/edit/complete a task with ≤2 interactions; undo works; RLS tests pass; keyboard-only operable; Playwright happy path green.

### Phase 3 — Scheduling, occurrences, carry-forward, recurrence
Schedule/deadline fields, `task_occurrences`, bulk select + carry-forward, recurrence rules (RRULE subset), historical day review that stays accurate after carry-forward/edit.
**Acceptance:** carrying forward does not alter past day's record; recurring task generates correct occurrences across DST; unit tests for recurrence; bulk action undoable.

### Phase 4 — Time tracking
`time_entries`, start/stop timer per task, manual entry, single running timer, resume after reload.
**Acceptance:** totals match entries; overlapping timers prevented in DB (exclusion/partial unique index); RLS tested.

### Phase 5 — Analytics
Day/week/month/year/custom range: completion rate, time by category/priority, streaks. SQL views/RPC with `security_invoker`. Charts per `dataviz` skill.
**Acceptance:** numbers reconcile with raw data in tests; ranges respect user timezone; accessible charts with table fallback.

### Phase 6 — Goals, milestones, reviews
`goals`, `milestones`, task↔goal links; morning planning flow; end-of-day and weekly review flows.
**Acceptance:** goal progress derives from linked tasks; reviews persist and are viewable historically.

### Phase 7 — Reminders and exports
In-app + web push/email reminders (Vercel Cron → server route, secret-guarded); CSV/JSON export of the user's own data.
**Acceptance:** cron endpoint rejects unauthenticated calls; export contains only caller's rows (tested).

### Phase 8 — Admin dashboard
`/admin` gated by role (server-checked, not UI-only), user list, read-only per-user tasks/analytics, audit log of admin views.
**Acceptance:** normal user gets 403/404 on admin routes and RLS blocks direct queries; admin cannot mutate user data; access is logged.

### Phase 9 — AI planning assistant
Server actions calling the Gemini API (@google/genai) server-side with streaming, tool-use limited to the caller's data via user-scoped Supabase client, rate limiting, prompt-injection-safe handling of task text, user-confirmed actions only. Model ID from GEMINI_MODEL.
**Acceptance:** key absent from client bundle (grep build output); assistant cannot read other users' data; changes require confirmation.

### Phase 10 — Hardening and launch
Accessibility audit, performance budgets, error monitoring, rate limits, backups, Vercel deployment with env config, full RLS regression suite, docs.
**Acceptance:** Lighthouse a11y ≥ 95; all suites green; production env verified.

## Risks

- Occurrence model is the hardest-to-change decision; get it right in Phase 3 before analytics depend on it.
- RLS mistakes silently leak data; every migration ships with policy tests.
- Admin visibility conflicts with strict isolation; mitigated by read-only, logged, role-gated design.
- Time zone/DST bugs in recurrence and day boundaries.
- Next 16 / Tailwind 4 / `@supabase/ssr` APIs differ from older tutorials; consult current docs.
- AI cost/abuse: rate limits and per-user quotas required.

## Next phase to run

**Phase 0 — Foundation.**

## Progress log

- **Database & architecture foundation (done 2026-10-18):** migrations in `supabase/migrations/`, RLS test suite (`pnpm test:db`, passing on plain Postgres only), generated types, Supabase SSR clients (`src/lib/supabase/*`, `src/proxy.ts`), `docs/database-design.md`, `docs/account-provisioning.md`. Minimal Next.js scaffold added (no Tailwind/UI yet). Remaining Phase 0 items: Tailwind/design tokens, lint/Vitest/Playwright, git init.
- **Core daily task experience (2026-10-18):** app shell (sidebar / tablet rail / mobile tab bar), Today, Yesterday, Upcoming, All Tasks on real Supabase data, quick-add, inline editing, keyboard shortcuts, command palette, optimistic updates with rollback and undo. Requires migration `20261018140000_occurrence_times_and_create_rpc.sql`. Calendar, Analytics, My Activity and Settings are honest "not available yet" pages. Verified by typecheck/build only; not exercised against a database.
- **Task lifecycle (2026-10-18):** reschedule-by-new-occurrence, history views, rollover review, recurrence, timezone. See docs/task-lifecycle.md.
- **Time tracking (2026-10-18):** server-authoritative timer RPCs, entries editor, global timer bar, time analytics. See docs/time-tracking.md.
- **Analytics, reviews, goals (2026-10-18):** see docs/analytics.md.
- **Reminders, goals, routines, exports (2026-10-18):** see docs/reminders-routines-exports.md. **AI assistant:** docs/ai-assistant.md.
