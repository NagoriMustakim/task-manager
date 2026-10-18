# Task lifecycle, history and recurrence

Migrations: `20261018150000_event_type_reschedule_undone.sql`, `20261018150100_lifecycle.sql` (apply in order).

## Statuses
New, Pending, Done, Incomplete live on **occurrences** (`task_occurrences.status`). Nothing is changed automatically: no auto-Done, and unfinished tasks are never silently turned Incomplete.

## Rescheduling keeps history
- Rescheduling **never edits** the original occurrence's date or status. `reschedule_occurrences()` inserts a **new** occurrence on the destination date (`carried_from_occurrence_id` -> old, same `original_date`) and marks the old one moved (`moved_to_occurrence_id`, `moved_at`, `moved_reason`).
- A moved occurrence is frozen (trigger-enforced) and keeps its preserved status, so the old day still shows what it was.
- Column privileges: clients can no longer write `scheduled_date` or any `moved_*` / `completed_*` column; only the definer RPCs do. Each RPC filters on `user_id = auth.uid()`.
- Events: `task_events` gets a `rescheduled` row (actor, from date, to date, reason, timestamp) and `occurrence_created` for the new row; undo writes `reschedule_undone`.
- Eligible: status new/pending/incomplete, not already moved, task not archived. Done tasks are not moved.
- **Undo** (`undo_reschedule`) succeeds only if the move is under 24h old, the new occurrence is untouched (never updated), not itself moved, and has no time sessions; otherwise it reports it can't be undone.

## Metrics (never mix)
| Unit | Meaning |
|---|---|
| Occurrences | rows scheduled on a date |
| Logical instances | distinct (task, original_date); a rescheduled chain is **one** |
| Unique tasks | distinct task |

Day completion % = done / (occurrences that stayed on the day; moved ones excluded). Range metrics (`rangeMetrics`) count a chain's completion once. Code: `src/features/tasks/metrics.ts`.

## Historical views
Any date via the Today page date picker (`/today?date=`), plus Yesterday. Past days group tasks: still pending, incomplete, completed on time, completed after planned date, moved to another date; rows show *Originally <date>*, *Created <date>* (created earlier, scheduled here) and move reason/destination. "On time" compares `completed_on` (the user's calendar date **at completion time**) with the scheduled date, so later timezone changes cannot reclassify history.

## Carry-forward and day rollover
- Row: Tomorrow button / `T`, date chip (date, times, optional reason). Multi-select (checkbox / `S`) -> bulk bar: Tomorrow, pick date, Done, Incomplete.
- "Move N unfinished to tomorrow" on Today/past days. Times are preserved by default, or cleared to all-day.
- Rollover review: on a new day, if unfinished tasks exist from earlier days, a banner offers a review dialog: carry forward (today/tomorrow/date), mark incomplete, or leave unselected tasks pending. "Done reviewing" stores `user_settings.last_review_date`; nothing else changes.

## Recurrence
- `tasks.recurrence_rule` is an RRULE subset: `FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n;BYDAY=..;BYMONTHDAY=..` (daily, weekdays, weekly, monthly, custom every N days/weeks/months). Monthly on a missing day (31st) falls on the month's last day.
- Every instance is its own occurrence; completing or missing one does not affect others.
- **Bounded generation:** on page load `ensureRecurringOccurrences` creates instances up to 60 days ahead and backfills at most 90 days missed, via idempotent `materialize_task_occurrences` (partial unique index on `(task_id, original_date)`). `recurrence_generated_through` avoids rescanning. "Stop repeating" ends the series today and deletes only untouched future instances.
- Editing an existing series' rule is not supported yet; stop it and create a new one.

## Timezone
Default `Asia/Kolkata` (new users; existing `UTC` rows, which only the old provisioning default produced, were migrated). Settings page changes it. Scheduled dates are plain calendar dates and times are wall-clock, so a timezone change or DST never shifts them; only "today" is recomputed. Recurrence is pure calendar-date math (unit-tested across DST boundaries).

## Reporting ranges
`src/lib/ranges.ts` defines inclusive day / month / year ranges as calendar dates in the user's timezone (leap-year safe). Reports filter on `scheduled_date` / `completed_on`, never on raw timestamps, so a completion just after local midnight lands in the correct day, month and year.

## Verification
Executed: `pnpm test` (78 vitest tests) covering multiple carry-forwards, completion after rescheduling (on time / late), historical accuracy, recurrence boundaries (leap year, year end, until), generation idempotence and no duplicate dates, and day/month/year boundaries across timezones; plus typecheck/build.

**Not executed:** the SQL (reschedule/undo RPCs, the unique index that prevents duplicate occurrences, frozen-history trigger, column privileges), RLS, and the UI. The duplicate-prevention test covers date generation only; the database constraint itself needs your run. Apply the migrations and exercise: reschedule + undo, bulk move, rollover review, recurring creation, timezone change. The older `supabase/tests/rls.test.sql` predates column-level grants and may need updating.
