# Analytics, reviews and goals

Migration: `20261018170000_goal_periods.sql` (weekly/monthly goals). Everything else reads existing tables.

## Architecture
`src/features/analytics/compute.ts` is a pure function `computeReport(input) -> Report`. `queries.ts` fetches only the rows a period needs (scheduled in range, completed in range, reschedule events in range, finished sessions in range; paged, server-side) and the browser receives the aggregated report only, never raw history. Archived tasks are excluded from occurrence metrics.

Dates are the user's local calendar dates (default `Asia/Kolkata`). Completion uses `completed_on`, the local date recorded at completion time, so later timezone changes cannot move past completions. Events/sessions are bucketed by local date of their timestamp (sessions are split at local midnights).

## Counting units
- **Occurrence**: one scheduled row. **Logical instance**: distinct (task, original date); a rescheduled chain is one instance. **Unique task**: distinct task.
- *Staying* occurrences = scheduled in the period and not moved away. *Due* = staying and scheduled on or before today (future work is not a miss).

## Metric definitions
| Metric | Definition / denominator |
|---|---|
| Unique tasks created | tasks with `created_at` in the period |
| Scheduled occurrences | occurrences with `scheduled_date` in the period (moved ones included); also shown: distinct tasks |
| Completed in period | `done` occurrences with `completed_on` in the period, whenever they were scheduled; also distinct instances and unique tasks |
| Scheduled and done | staying occurrences scheduled in the period that are done at any time |
| New / Pending / Incomplete | staying occurrences scheduled in the period, by status (moved counted separately) |
| Overdue | staying, open (New/Pending), scheduled before today |
| Completion rate | done ÷ due (staying, scheduled ≤ today). `—` when nothing is due |
| On-time rate | due occurrences completed on or before their scheduled date ÷ due. Late = done after it |
| Carried forward | reschedule events in the period minus undone ones (net); unique tasks carried |
| Postponements per task | carried forward ÷ unique tasks carried |
| Estimated time | sum of task estimates over staying scheduled occurrences |
| Actual (recorded) time | finished sessions clipped to the period; running timers excluded |
| Average daily completion | completed in period ÷ calendar days elapsed (up to today). `—` for future-only periods |
| Priority completion | per priority: done ÷ due |
| Weekday productivity | completions by weekday of `completed_on`; average = ÷ number of that weekday elapsed |
| Time by category | recorded seconds by the task's category |

Rescheduled work: moved occurrences are excluded from "staying", so a task moved across days is neither a miss on the old day nor a second completion; only its final occurrence can be done. "Completed in period" vs "scheduled in period" are separate cards on purpose.

## Charts (Recharts) and granularity
1 day → hourly completions; ≤ 92 days → daily; longer (year, long custom) → monthly. Charts: completion trend (bars + rate line), completed vs unfinished, estimated vs recorded hours, weekday productivity, priority distribution, carry-forward trend. Each has a text summary, `role="img"` label and a "View as table" fallback; axes thin out on small screens.

## Reviews (no AI)
- **Daily** `/review?date=`: planned, completed, unfinished, planned vs recorded time, high-priority not completed, and carry-forward suggestions with actions (carry to tomorrow / pick date with reason / mark done / mark incomplete), all undoable. Suggested = high/urgent priority, deadline within 2 days (or passed), or in progress; others are not pre-selected.
- **Weekly** `/review/week?start=`: this week vs previous week (completion, on-time, completed, scheduled, carried, time), overloaded days (>8h estimated or 10+ occurrences), repeatedly postponed (2+), underestimated (recorded ≥ 125% of estimate), goal progress.

## Goals
Weekly/monthly (or open-ended) goals with optional target count and milestones; tasks link via the Goal field in a task's details. Progress = completed logical instances ÷ (target or total instances), counting instances whose original date is in the goal's period, so rescheduled tasks count once.

## Verification
Executed: `pnpm test` (137 tests) against hand-computed fixtures: every summary metric, empty periods (null rates), future-only periods, historical stability after moves, completed-vs-scheduled distinction, chain counted once, priority/weekday/time/category, timezone boundaries (Kolkata vs Los Angeles; hourly buckets), granularity and presets (week/month/year/leap year/custom validation), weekly-review helpers, goal progress, carry-forward recommendations. Typecheck and build pass.

**Not executed:** the queries, RLS and pages against your database; the charts in a browser (mobile layout, tooltips). Please open `/analytics` with a few ranges, `/review`, `/review/week`, `/goals`, and compare a few numbers with your task lists.
