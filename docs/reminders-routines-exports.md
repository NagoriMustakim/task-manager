# Reminders, goals, routines and exports

Migrations (apply in order): `20261018190000_event_recurrence_changed.sql`, `20261018190100_reminders_routines.sql`.

## Reminders (in-app)
**What exists:** a bell (top right) with an inbox, plus a toast when a new reminder appears. While the app is open **and visible**, the browser asks the server about once a minute (and on focus) which reminders are due; the server evaluates them (`src/features/reminders/evaluate.ts`) and stores new ones.

**What is NOT delivered:** nothing reaches you when the app is closed. A row in `notifications` means "waiting in the in-app inbox", not "sent to your phone/email". No email, push or background job is configured.

| Reminder | Fires when | Dedupe key |
|---|---|---|
| Task start | within N minutes before a timed, open task starts (and up to 60 min after) | `start:<occurrence>:<date>` |
| Deadline | open task whose deadline is within N days; again on the day | `deadline:<task>:<deadline>:soon\|today` |
| Overdue high priority | high/urgent open occurrences scheduled before today, max 5/day | `overdue:<occurrence>:<date>` |
| Morning planning | after your morning time, for 4 h | `morning:<date>` |
| End-of-day review | after your end-of-day time, for 5 h | `eod:<date>` |
| Weekly review | on your chosen weekday after your time, for 8 h | `weekly:<week start>` |

**No duplicates:** inserts use `unique (user_id, dedupe_key)` with `ON CONFLICT DO NOTHING`, so several tabs, retries or repeated checks cannot create a second copy. **Preferences** (Settings → Reminders): master switch, each type on/off, lead minutes, deadline window, review times and weekly day. Times are interpreted in your configured timezone (default `Asia/Kolkata`). Notifications older than 30 days are removed automatically; "Clear" deletes your inbox.

### If you want background delivery later (not built; needs setup)
Verified on Vercel's docs (2026-10): Cron Jobs are available on all plans, up to 100 per project. **Hobby: once per day only, with ±59 min timing**, expressions that run more often fail the deploy. **Pro/Enterprise: down to once per minute.** So timed "starts in 10 minutes" reminders in the background need Vercel **Pro** (or an external scheduler) *and* a delivery channel: email (e.g. Resend/SES) or web push (VAPID keys, a service worker and a `push_subscriptions` table). The evaluator is pure and already takes `now`/preferences, so a cron route could reuse it. Until that is configured, in-app is the only channel.

## Goals and milestones
Weekly / monthly / open-ended goals with description and optional target; tasks link from a task's details (Goal); progress counts **logical instances** (task + original date) once, so rescheduled work is never double counted (same rule as analytics). Milestones have optional due dates and show **done / overdue / upcoming** (overdue = due before today and not completed). **Current / History** tabs: a goal moves to History when completed, archived, or its week/month has ended; history cards show final progress and milestones. Linked tasks can be unlinked from the goal card.

## Routines (repeating tasks)
`/routines` lists repeating tasks with the last 30 days as per-occurrence chips (done / missed / incomplete / moved / today / upcoming), a **Missed occurrences** review (mark done, move, mark incomplete, with undo) and **Change schedule**. Every occurrence is its own row with its own status and event history (marking one done, missing it, or rescheduling it never touches another).

**Editing the rule going forward** (`update_recurrence`): applies from a chosen date (today or later). Past occurrences, and any future occurrence you already touched (status change, time tracked, moved), are never modified or deleted; only untouched future ones are removed and regenerated under the new rule. The change is logged as a `recurrence_changed` event (old rule -> new rule). Generation stays bounded (60 days ahead, 90 days back-fill) and idempotent.

## Exports
`Export` page and `GET /api/export/{tasks|occurrences|history|time|daily|weekly}?from=&to=` → UTF-8 CSV with BOM, CRLF, RFC 4180 quoting, `Content-Disposition: attachment; filename="tracker-<kind>_<from>_to_<to>.csv"`, `Cache-Control: private, no-store`, `X-Row-Count`.
- Filters: tasks → created in range; occurrences → scheduled in range; history → events in range; time → sessions overlapping the range; daily/weekly → computed with the same rules as analytics. Max range 366 days, 50,000 rows (otherwise a clear error). Dates/times use the user's timezone. Empty ranges download a header-only file and the UI says so.
- **Formula injection:** text cells beginning (after whitespace/control chars) with `= + - @`, tab or CR get a leading apostrophe; real numbers are untouched.
- **Authorization:** the session is checked on the server; `subject=<user id>` is honoured only for an administrator holding a read grant for that user, verified before any query (and every query filters by that `user_id`). Errors never include internals.
- **Gap:** an audit log of administrator exports does not exist yet. It belongs with the admin dashboard work, which has not been built.

## Verification
Executed: `pnpm test` (253 tests): reminder evaluation (lead times, expiry, timezones, dedupe keys, preferences, empty day), CSV escaping/formula injection/quoting/filenames/ranges, daily and weekly report rows (rates recomputed from sums, Sunday/Monday weeks, empty input), export route authorization and behaviour with mocks (anonymous, normal user asking for another user, admin with/without grant, malformed ids, date filters, empty dataset, row cap, hidden internal errors), routine occurrence independence and rule-change semantics, milestone states and goal history. Typecheck and build.

**Not executed (needs your database):** the migrations/RPCs and RLS (notification inserts, `update_recurrence`), the polling bell, and all pages in a browser. Suggested checks: set a task start 5 minutes ahead and watch the bell; reload and confirm no duplicate; disable reminders and confirm nothing new; change a routine's rule and confirm past chips are unchanged; download each export, open in a spreadsheet, and confirm a task titled `=1+1` shows as text; as a second user, request `/api/export/tasks?subject=<other id>` and expect 403.
