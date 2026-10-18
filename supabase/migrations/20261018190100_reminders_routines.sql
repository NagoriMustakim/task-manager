-- In-app reminders (preferences + inbox) and safe recurrence-rule edits.

-- ---- reminder preferences ---------------------------------------------------------------
alter table public.user_settings
  add column reminders_enabled boolean not null default true,
  add column remind_task_start boolean not null default true,
  add column remind_start_lead_min smallint not null default 10 check (remind_start_lead_min between 0 and 240),
  add column remind_deadline boolean not null default true,
  add column remind_deadline_days smallint not null default 1 check (remind_deadline_days between 0 and 14),
  add column remind_overdue_high boolean not null default true,
  add column remind_morning boolean not null default true,
  add column morning_time time not null default '08:30',
  add column remind_eod boolean not null default true,
  add column eod_time time not null default '18:00',
  add column remind_weekly boolean not null default true,
  add column weekly_day smallint not null default 0 check (weekly_day between 0 and 6),
  add column weekly_time time not null default '17:00';
grant update (reminders_enabled, remind_task_start, remind_start_lead_min, remind_deadline, remind_deadline_days,
              remind_overdue_high, remind_morning, morning_time, remind_eod, eod_time, remind_weekly, weekly_day, weekly_time)
  on public.user_settings to authenticated;

-- ---- notifications inbox ----------------------------------------------------------------
-- A row means "this reminder was generated and is waiting in the in-app inbox" - NOT that it was
-- delivered anywhere else. unique (user_id, dedupe_key) makes generation idempotent, so repeated
-- checks, several tabs, or retries can never create duplicates.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('task_start', 'deadline', 'overdue_high', 'morning', 'end_of_day', 'weekly')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  title text not null check (char_length(title) between 1 and 140),
  body text check (body is null or char_length(body) <= 300),
  link text check (link is null or (link ~ '^/[A-Za-z0-9/_?=&.-]*$' and char_length(link) <= 200)),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant insert (kind, dedupe_key, title, body, link) on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_insert_own on public.notifications for insert to authenticated with check (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ---- change a repeating task's rule going forward ---------------------------------------
-- Past occurrences (and anything already touched) are never modified or deleted. Untouched future
-- instances from p_from onward are removed and regenerated under the new rule. The change is
-- recorded in task_events.
create function public.update_recurrence(
  p_task_id uuid, p_rule text, p_from date, p_until date default null, p_start time default null, p_end time default null
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); t public.tasks; v_deleted integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_rule !~ '^FREQ=(DAILY|WEEKLY|MONTHLY)(;(INTERVAL|BYDAY|BYMONTHDAY)=[A-Z0-9,]+)*$' then
    raise exception 'invalid repeat rule' using errcode = '22023';
  end if;
  if p_from is null then raise exception 'effective date required' using errcode = '22023'; end if;
  if p_until is not null and p_until < p_from then raise exception 'end date is before the start' using errcode = '22023'; end if;
  if p_end is not null and (p_start is null or p_end <= p_start) then raise exception 'end time must be after start time' using errcode = '22023'; end if;

  select * into t from public.tasks where id = p_task_id and user_id = v_uid and archived_at is null for update;
  if not found or t.recurrence_rule is null then raise exception 'repeating task not found' using errcode = 'P0002'; end if;

  update public.tasks
  set recurrence_rule = p_rule, recurrence_start = p_from, recurrence_until = p_until,
      recurrence_start_time = p_start, recurrence_end_time = p_end,
      recurrence_generated_through = p_from - 1
  where id = t.id;

  delete from public.task_occurrences o
  where o.task_id = t.id and o.user_id = v_uid and o.scheduled_date >= p_from and o.status = 'new'
    and o.moved_to_occurrence_id is null and o.carried_from_occurrence_id is null and o.updated_at = o.created_at
    and not exists (select 1 from public.time_sessions s where s.occurrence_id = o.id);
  get diagnostics v_deleted = row_count;

  insert into public.task_events (user_id, task_id, event_type, to_date, reason, actor_id)
  values (v_uid, t.id, 'recurrence_changed', p_from, left(t.recurrence_rule || ' -> ' || p_rule, 300), v_uid);
  return v_deleted;
end $$;
revoke all on function public.update_recurrence(uuid, text, date, date, time, time) from public, anon;
grant execute on function public.update_recurrence(uuid, text, date, date, time, time) to authenticated;
