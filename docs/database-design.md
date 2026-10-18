# Database design

Migrations live in `supabase/migrations/` (applied in filename order, additive). Types: `src/types/database.ts` (`pnpm gen:types`).

## Entity overview

| Table | Purpose | Written by |
|---|---|---|
| `profiles` | 1:1 with `auth.users`; email (synced), display name | trigger (create/sync); user may edit `display_name` only |
| `user_roles` | **Trusted role** (`user`/`admin`) | trigger / SQL / service role only |
| `user_settings` | timezone (validated IANA), week start | trigger (create); user edits those two columns |
| `admin_user_access` | which users an admin may read | trigger / SQL only |
| `role_audit_log` | append-only role history | trigger only; admin-readable |
| `categories` | user labels (unique per user, case-insensitive) | owner |
| `goals`, `milestones` | optional goals; tasks link via `tasks.goal_id` | owner |
| `tasks` | the underlying work item (title, notes, priority, category, goal, deadline, RRULE) | owner |
| `task_occurrences` | one scheduled instance of a task; owns **status** and **completed_at** | owner (completed_at by trigger) |
| `task_events` | append-only log: created, priority/deadline change, occurrence created, status change, reschedule | trigger only |
| `time_sessions` | tracked time per task (optionally per occurrence) | owner |

## Key decisions

- **Task vs occurrence.** Status lives on the occurrence, never the task, so each day/recurrence instance is independently trackable.
- **Rescheduling keeps history.** `original_date` is immutable; `scheduled_date` is the current date; every change writes a `rescheduled` event with `from_date`/`to_date`.
- **Carry-forward.** Close the old occurrence as `incomplete`, insert a new occurrence with `carried_from_occurrence_id`. The old day's record is untouched. (The application layer will implement this as one atomic RPC/transaction in a later phase.)
- **Recurrence.** `tasks.recurrence_rule` stores an RRULE; the app materialises occurrences. A partial unique index `(task_id, original_date) WHERE carried_from_occurrence_id IS NULL` makes generation idempotent.
- **Server-managed fields.** `completed_at` is set/cleared by trigger on status change and cannot be set by clients. `updated_at` is trigger-maintained. `user_id`, `task_id`, `original_date` etc. are immutable (`forbid_update_of`).
- **Cross-user integrity independent of RLS.** Child tables reference parents with composite FKs `(parent_id, user_id)`, so a row can't point at another user's category/goal/task/occurrence.
- **Time tracking.** `ended_at IS NULL` = running timer. A GiST exclusion constraint forbids overlapping sessions per user (hence at most one running timer). `started_at` for manual entries is client-supplied (trade-off: no future-date check, since non-immutable CHECKs are fragile).
- **Time zones.** Instants are `timestamptz`; calendar days are `date`. The user's IANA zone is in `user_settings.timezone` and defines "today" in application code.
- **Why not `tasks.status`.** Avoids two sources of truth and keeps history accurate.

## Deletion behaviour

| Delete | Effect |
|---|---|
| auth user | cascades profile, role, settings, and all their data |
| task | cascades occurrences, task_events, time_sessions (hard delete = deliberate owner action; use `archived_at` to retire a task and keep history) |
| occurrence | events/sessions keep rows with `occurrence_id` set NULL; `carried_from_occurrence_id` references set NULL |
| category / goal | tasks detached (`SET NULL`) |
| goal | milestones cascade |

## Security model

- RLS enabled on all 12 application tables. Default Supabase privileges are explicitly revoked, then minimal grants added (column-level for `profiles` and `user_settings`).
- Owner access: `user_id = (select auth.uid())`. Admin: **read-only** via `private.admin_can_read(user_id)` = caller has role `admin` **and** a row in `admin_user_access`. No policy gives an admin write access to others' data.
- Helpers `private.is_admin()` / `private.admin_can_read()` are `SECURITY DEFINER`, `STABLE`, `search_path = ''`, fully schema-qualified, owned by the migration role (bypasses RLS ⇒ no policy recursion), `EXECUTE` revoked from `PUBLIC`/`anon` and granted to `authenticated` only. The `private` schema is not exposed by the Data API.
- Trigger functions (`log_*`, `audit_role_change`, `handle_auth_user_change`, `provision_user`) are `SECURITY DEFINER` with `EXECUTE` revoked from everyone; events/audit rows can't be inserted by clients (no INSERT grant or policy).
- `user_roles` has no INSERT/UPDATE/DELETE grant for `authenticated`; role changes happen only via triggers, SQL editor, or service role.
- The service-role key appears nowhere in `src/`. `src/lib/supabase/server.ts` is user-scoped and `server-only`.
- Known limitation: admin *reads* are not audited (Postgres doesn't log SELECT per row). Add API-layer logging in the admin phase if required.

## Verification status

- `scripts/test-db.sh` applies all migrations to a throwaway **plain PostgreSQL 17** container with a small Supabase stub (`supabase/tests/support/00_supabase_stub.sql`: roles, `auth.users`, `auth.uid()`), then runs `supabase/tests/rls.test.sql` (≈70 assertions: ownership, admin read-only, forgery attempts, anon, provisioning, domain behaviour). Result at time of writing: PASS. A mutation check (making the SELECT policy `using (true)`) correctly made the suite fail.
- **Not yet verified:** against a real Supabase project/local stack (`supabase start`) — PostgREST/JWT role switching, the real `auth` schema, hosted-Postgres privilege differences (creating a trigger on `auth.users` from a migration, default privileges). Run `supabase db reset && psql ... -f supabase/tests/rls.test.sql` (stub file not needed there) before relying on it in production.
- Generated types come from the same plain-Postgres schema (`pnpm gen:types`).
