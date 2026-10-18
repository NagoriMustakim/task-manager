# Time tracking

Migration: `20261018160000_time_tracking.sql` (apply after the lifecycle migrations).

## Model (`time_sessions`)
`user_id`, `task_id`, `occurrence_id`, `started_at`, `ended_at` (NULL = running), generated `duration_seconds`, `note`, `source` (`timer`/`manual`), `edited_at`, `created_at`, `updated_at`. Instants are `timestamptz`; the display timezone never changes what is stored.

Recorded vs estimated are separate: **Est.** (task estimate chip) is a plan; **recorded** is the sum of *finished* sessions. A running timer has no duration and is never counted in totals, analytics or the "recorded" chip.

## Server authority and safety
- Clients have **no INSERT/UPDATE privilege** on `time_sessions`; they can read and delete their own rows (RLS). Creation and edits go through `SECURITY DEFINER` functions that filter on `auth.uid()`: `start_timer`, `stop_timer`, `add_time_entry`, `update_time_entry`. Timer start/stop timestamps come from the database clock.
- **One running timer per user** (policy), enforced by the exclusion constraint `time_sessions_no_overlap` (no overlapping sessions at all) plus a per-user advisory lock. Starting a timer on another task **switches**: the current one is stopped at that same instant and saved.
- **Duplicate requests:** `start_timer` on the task already running returns the existing session; `stop_timer` on an already-stopped session returns it unchanged; the UI also ignores clicks while a request is in flight.
- **Validation:** end > start, end not in the future (1 min skew allowed), at most 24h per entry (CHECK), manual entries not older than 1 year, notes ≤ 500 chars. A timer left running >24h must be stopped with a corrected end time.
- Timers can't start on rescheduled (moved) entries, done tasks or archived tasks. Admins have read-only access via the existing policies.

## Reliability in the UI
- Elapsed = (browser clock + server offset) − `started_at`. The offset (server time − browser time) is captured on every server response, so a wrong device clock cannot skew it.
- The active timer is loaded server-side on every page, so reload/restart restores it. The client re-syncs from the server on tab visibility, window focus and `online`, so sleep, throttled intervals, or a stop/start on another device are picked up.
- A failed stop keeps the timer displayed (it is still running on the server) and re-syncs.
- Midnight: stored as one session; reports split it at local midnights (`splitByDay`), correct for 23/25-hour DST days.

## Where
Start/stop button and live clock on each task row; a global bar with Stop on every page; click "recorded" on a row for the entries popover (add past entry, edit, delete; datetime-local inputs are interpreted in your timezone). Editing marks the entry "edited".

## Analytics (`/analytics`)
Today, yesterday, this week (your week-start day), month and year totals; time per task and per category (month); estimated vs recorded (year); tasks consistently over estimate (≥3 tracked entries, ≥ 2/3 over). All use timezone-correct local-day boundaries. No AI recommendations.

## Verification
Executed: `pnpm test` (103 tests; timezone/DST/midnight splitting, range totals, estimate logic, input validation), typecheck, build.

**Not executed (needs your database):** the RPCs, constraints, privileges and RLS. Please check, with two accounts A (user) and B (user) and an admin:
1. A starts a timer on task X, reload: it is still running with the correct elapsed time. Start on task Y: X is saved, Y runs. Double-click Start/Stop: no duplicates or errors.
2. As A in the SQL editor with A's JWT claims (or via the API): `insert into time_sessions ...` and `update time_sessions ...` fail (permission denied); `start_timer(<B's occurrence>)` fails "task not found"; `update_time_entry(<B's entry>)` fails.
3. A adds a past entry overlapping another: rejected. Entry ending in the future / >24h: rejected. Entry 23:30→00:45 shows split across two days in analytics.
4. Admin can read A's sessions but every write function fails for A's rows.
5. Change timezone in Settings: stored sessions don't change; period totals re-bucket.
