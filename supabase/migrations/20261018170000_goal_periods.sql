-- Weekly / monthly goals. Extends the existing goals/milestones tables (no redesign).
--   period       'weekly' | 'monthly' | NULL (open-ended goal)
--   period_start first calendar day of that week/month (user's timezone), NULL when period is NULL
--   target_count optional number of task instances to complete; NULL = all linked instances
-- Progress is computed by the application from tasks.goal_id, counting each logical instance
-- (task + original date) once, so rescheduled work is never double counted.
alter table public.goals
  add column period text check (period in ('weekly', 'monthly')),
  add column period_start date,
  add column target_count integer check (target_count is null or target_count between 1 and 10000),
  add constraint goals_period_consistent check ((period is null) = (period_start is null));
create index goals_user_period_idx on public.goals (user_id, period_start) where period is not null;
