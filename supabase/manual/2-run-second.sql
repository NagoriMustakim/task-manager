-- Historical task lifecycle: reschedule-by-new-occurrence, recurrence, stable completion dates.
--
-- Model
--  * Rescheduling NEVER edits the original occurrence's date or status. It inserts a NEW
--    occurrence (carried_from_occurrence_id -> old, same original_date) and marks the old one
--    as moved (moved_to_occurrence_id / moved_at / moved_reason). Moved rows are frozen history.
--  * original_date is carried along the whole chain, so "originally scheduled" is always known.
--  * completed_on is the user's calendar date at completion time (in THEIR timezone at that
--    moment), so later timezone changes cannot reclassify past completions as late.

-- ---- columns ---------------------------------------------------------------------------
alter table public.tasks
  add column recurrence_start date,
  add column recurrence_start_time time,
  add column recurrence_end_time time,
  add column recurrence_generated_through date,
  add constraint tasks_recurrence_start_consistent check ((recurrence_rule is null) = (recurrence_start is null)),
  add constraint tasks_recurrence_rule_format check (
    recurrence_rule is null
    or recurrence_rule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY)(;(INTERVAL|BYDAY|BYMONTHDAY)=[A-Z0-9,]+)*$'
  );

alter table public.task_occurrences
  add column moved_to_occurrence_id uuid,
  add column moved_at timestamptz,
  add column moved_reason text check (moved_reason is null or char_length(moved_reason) <= 280),
  add column completed_on date,
  add constraint task_occurrences_moved_consistent check ((moved_to_occurrence_id is null) = (moved_at is null)),
  add constraint task_occurrences_moved_not_done check (moved_to_occurrence_id is null or status <> 'done'),
  add constraint task_occurrences_moved_to_fkey foreign key (moved_to_occurrence_id, user_id)
    references public.task_occurrences (id, user_id) on delete set null (moved_to_occurrence_id);
create index task_occurrences_moved_to_idx on public.task_occurrences (moved_to_occurrence_id)
  where moved_to_occurrence_id is not null;
create index task_occurrences_completed_on_idx on public.task_occurrences (user_id, completed_on)
  where completed_on is not null;

alter table public.task_events add column reason text;
alter table public.user_settings add column last_review_date date;

-- ---- timezone default: Asia/Kolkata ---------------------------------------------------------
alter table public.user_settings alter column timezone set default 'Asia/Kolkata';
-- No settings UI existed before this migration, so every 'UTC' row is the old provisioning default.
update public.user_settings set timezone = 'Asia/Kolkata' where timezone = 'UTC';

update public.task_occurrences o
set completed_on = (o.completed_at at time zone coalesce(
  (select s.timezone from public.user_settings s where s.user_id = o.user_id), 'Asia/Kolkata'))::date
where o.status = 'done' and o.completed_on is null;

-- ---- occurrence write rules --------------------------------------------------------------------
create or replace function private.occurrence_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_tz text;
begin
  if tg_op = 'UPDATE' and old.moved_to_occurrence_id is not null and new.moved_to_occurrence_id is not null
     and (new.status is distinct from old.status or new.start_time is distinct from old.start_time
          or new.end_time is distinct from old.end_time or new.scheduled_date is distinct from old.scheduled_date) then
    raise exception 'a rescheduled occurrence is read-only history' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'done' then
      select s.timezone into v_tz from public.user_settings s where s.user_id = new.user_id;
      new.completed_at := now();
      new.completed_on := (now() at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;
    else
      new.completed_at := null;
      new.completed_on := null;
    end if;
  else
    new.completed_at := old.completed_at;
    new.completed_on := old.completed_on;
  end if;
  return new;
end $$;

create or replace function private.log_occurrence_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_to date;
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, to_status, to_date, actor_id)
    values (new.user_id, new.task_id, new.id, 'occurrence_created', new.status, new.scheduled_date, auth.uid());
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_status, to_status, actor_id)
    values (new.user_id, new.task_id, new.id, 'status_changed', old.status, new.status, auth.uid());
  end if;
  if new.scheduled_date is distinct from old.scheduled_date then
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_date, to_date, actor_id)
    values (new.user_id, new.task_id, new.id, 'rescheduled', old.scheduled_date, new.scheduled_date, auth.uid());
  end if;
  if new.moved_to_occurrence_id is not null and old.moved_to_occurrence_id is null then
    select o.scheduled_date into v_to from public.task_occurrences o where o.id = new.moved_to_occurrence_id;
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_status, from_date, to_date, reason, actor_id)
    values (new.user_id, new.task_id, new.id, 'rescheduled', new.status, new.scheduled_date, v_to, new.moved_reason, auth.uid());
  elsif new.moved_to_occurrence_id is null and old.moved_to_occurrence_id is not null then
    select o.scheduled_date into v_to from public.task_occurrences o where o.id = old.moved_to_occurrence_id;
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_date, to_date, reason, actor_id)
    values (new.user_id, new.task_id, new.id, 'reschedule_undone', v_to, new.scheduled_date, old.moved_reason, auth.uid());
  end if;
  return null;
end $$;

-- ---- column-level privileges: date/moved/completion fields are server-managed -----------------
revoke insert, update on public.task_occurrences from authenticated;
grant insert (task_id, original_date, scheduled_date, status, start_time, end_time, sort_order)
  on public.task_occurrences to authenticated;
grant update (status, start_time, end_time, sort_order) on public.task_occurrences to authenticated;
grant update (last_review_date) on public.user_settings to authenticated;

-- ---- RPCs -----------------------------------------------------------------------------------
-- Reschedule: SECURITY DEFINER because clients may not write the moved_* columns. Every row is
-- filtered by user_id = auth.uid(), so a caller can only ever touch their own occurrences.
create function public.reschedule_occurrences(
  p_ids uuid[],
  p_date date,
  p_keep_time boolean default true,
  p_start time default null,
  p_end time default null,
  p_reason text default null
) returns table (old_id uuid, new_id uuid, from_date date)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r record;
  v_new uuid;
  v_start time;
  v_end time;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return; end if;
  if cardinality(p_ids) > 200 then raise exception 'too many tasks (max 200)' using errcode = '22023'; end if;
  if p_date is null then raise exception 'destination date required' using errcode = '22023'; end if;
  if not p_keep_time and p_end is not null and (p_start is null or p_end <= p_start) then
    raise exception 'end time must be after start time' using errcode = '22023';
  end if;
  if p_reason is not null and char_length(p_reason) > 280 then
    raise exception 'reason too long' using errcode = '22023';
  end if;

  for r in
    select o.*
    from public.task_occurrences o
    join public.tasks t on t.id = o.task_id and t.user_id = o.user_id
    where o.id = any (p_ids) and o.user_id = v_uid
      and o.status <> 'done' and o.moved_to_occurrence_id is null and t.archived_at is null
    order by o.scheduled_date, o.id
    for update of o
  loop
    if r.scheduled_date = p_date then continue; end if;
    v_start := case when p_keep_time then r.start_time else p_start end;
    v_end := case when p_keep_time then r.end_time else p_end end;

    insert into public.task_occurrences
      (user_id, task_id, original_date, scheduled_date, status, start_time, end_time, carried_from_occurrence_id, sort_order)
    values (v_uid, r.task_id, r.original_date, p_date,
            case when r.status = 'pending' then 'pending'::public.task_status else 'new'::public.task_status end,
            v_start, v_end, r.id, r.sort_order)
    returning id into v_new;

    update public.task_occurrences
    set moved_to_occurrence_id = v_new, moved_at = now(), moved_reason = nullif(btrim(p_reason), '')
    where id = r.id;

    old_id := r.id; new_id := v_new; from_date := r.scheduled_date;
    return next;
  end loop;
end $$;

-- Undo is only "safe" while the new occurrence is untouched, unrelated to time tracking,
-- not itself moved, and the move is recent (24h).
create function public.undo_reschedule(p_old_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); a record; b record;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into a from public.task_occurrences where id = p_old_id and user_id = v_uid for update;
  if not found or a.moved_to_occurrence_id is null then return false; end if;
  select * into b from public.task_occurrences where id = a.moved_to_occurrence_id and user_id = v_uid for update;
  if not found then return false; end if;
  if a.moved_at < now() - interval '24 hours'
     or b.updated_at <> b.created_at
     or b.moved_to_occurrence_id is not null
     or b.status not in ('new', 'pending')
     or exists (select 1 from public.time_sessions s where s.occurrence_id = b.id)
  then return false; end if;

  update public.task_occurrences
  set moved_to_occurrence_id = null, moved_at = null, moved_reason = null where id = a.id;
  delete from public.task_occurrences where id = b.id;
  return true;
end $$;

-- Idempotent, bounded materialisation of recurring instances (SECURITY INVOKER: RLS applies).
create function public.materialize_task_occurrences(p_task_id uuid, p_dates date[], p_through date)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_dates is not null and cardinality(p_dates) > 500 then
    raise exception 'too many dates (max 500)' using errcode = '22023';
  end if;
  insert into public.task_occurrences (task_id, original_date, scheduled_date, start_time, end_time)
  select t.id, d, d, t.recurrence_start_time, t.recurrence_end_time
  from public.tasks t, unnest(coalesce(p_dates, '{}'::date[])) as d
  where t.id = p_task_id and t.archived_at is null and t.recurrence_rule is not null
    and d >= t.recurrence_start and (t.recurrence_until is null or d <= t.recurrence_until)
  on conflict (task_id, original_date) where carried_from_occurrence_id is null do nothing;
  get diagnostics v_count = row_count;

  update public.tasks
  set recurrence_generated_through = greatest(coalesce(recurrence_generated_through, p_through), p_through)
  where id = p_task_id;
  return v_count;
end $$;

-- Ends a series from p_from onwards; removes only untouched future instances.
create function public.stop_recurrence(p_task_id uuid, p_from date) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_deleted integer;
begin
  update public.tasks set recurrence_until = p_from - 1
  where id = p_task_id and recurrence_rule is not null;
  if not found then return 0; end if;
  delete from public.task_occurrences o
  where o.task_id = p_task_id and o.scheduled_date >= p_from and o.status = 'new'
    and o.moved_to_occurrence_id is null and o.carried_from_occurrence_id is null
    and o.updated_at = o.created_at
    and not exists (select 1 from public.time_sessions s where s.occurrence_id = o.id);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

drop function public.create_task_with_occurrence(text, date, public.task_priority, text, uuid, date, integer, time, time);
create function public.create_task_with_occurrence(
  p_title text,
  p_date date,
  p_priority public.task_priority default 'medium',
  p_notes text default null,
  p_category_id uuid default null,
  p_deadline date default null,
  p_estimated_minutes integer default null,
  p_start time default null,
  p_end time default null,
  p_rrule text default null,
  p_rec_until date default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_task uuid; v_occ uuid;
begin
  insert into public.tasks (title, notes, priority, category_id, deadline_date, estimated_minutes,
                            recurrence_rule, recurrence_start, recurrence_until,
                            recurrence_start_time, recurrence_end_time)
  values (p_title, p_notes, p_priority, p_category_id, p_deadline, p_estimated_minutes,
          p_rrule, case when p_rrule is not null then p_date end,
          case when p_rrule is not null then p_rec_until end,
          case when p_rrule is not null then p_start end, case when p_rrule is not null then p_end end)
  returning id into v_task;

  insert into public.task_occurrences (task_id, original_date, scheduled_date, start_time, end_time)
  values (v_task, p_date, p_date, p_start, p_end)
  returning id into v_occ;
  return v_occ;
end $$;

revoke all on function public.reschedule_occurrences(uuid[], date, boolean, time, time, text) from public, anon;
revoke all on function public.undo_reschedule(uuid) from public, anon;
revoke all on function public.materialize_task_occurrences(uuid, date[], date) from public, anon;
revoke all on function public.stop_recurrence(uuid, date) from public, anon;
revoke all on function public.create_task_with_occurrence(text, date, public.task_priority, text, uuid, date, integer, time, time, text, date) from public, anon;
grant execute on function public.reschedule_occurrences(uuid[], date, boolean, time, time, text) to authenticated;
grant execute on function public.undo_reschedule(uuid) to authenticated;
grant execute on function public.materialize_task_occurrences(uuid, date[], date) to authenticated;
grant execute on function public.stop_recurrence(uuid, date) to authenticated;
grant execute on function public.create_task_with_occurrence(text, date, public.task_priority, text, uuid, date, integer, time, time, text, date) to authenticated;
-- Task-level time tracking: server-authoritative timer RPCs, duration column, locked-down writes.
--
-- Policy: ONE running timer per user (already enforced by time_sessions_no_overlap, which also
-- forbids overlapping sessions). Starting a timer on another task stops the current one at the same
-- instant ("switch"). All timestamps are taken from the database clock, never from the browser,
-- except for explicit manual entries / corrections which are validated here.

alter table public.time_sessions
  add column duration_seconds integer generated always as (
    case when ended_at is null then null else floor(extract(epoch from (ended_at - started_at)))::integer end
  ) stored,
  add column edited_at timestamptz,
  add constraint time_sessions_max_24h check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  add constraint time_sessions_note_len check (note is null or char_length(note) <= 500);

-- Clients may read and delete their own sessions (RLS) but all creation/edits go through the
-- validated functions below, so a client can neither forge a timer nor write another user's rows.
revoke insert, update on public.time_sessions from authenticated;

create function private.time_session_json(s public.time_sessions) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'task_id', s.task_id, 'occurrence_id', s.occurrence_id,
    'started_at', s.started_at, 'ended_at', s.ended_at, 'duration_seconds', s.duration_seconds,
    'note', s.note, 'source', s.source, 'edited_at', s.edited_at);
$$;

create function public.start_timer(p_occurrence_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o record; r public.time_sessions; v_stopped public.time_sessions; v_new public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0)); -- serialise double-clicks / races

  select oc.id, oc.task_id, oc.moved_to_occurrence_id into o
  from public.task_occurrences oc join public.tasks t on t.id = oc.task_id and t.user_id = oc.user_id
  where oc.id = p_occurrence_id and oc.user_id = v_uid and t.archived_at is null;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  if o.moved_to_occurrence_id is not null then
    raise exception 'this entry was rescheduled; track time on the new entry' using errcode = '22023';
  end if;

  select * into r from public.time_sessions where user_id = v_uid and ended_at is null for update;
  if found then
    if r.occurrence_id = p_occurrence_id then  -- duplicate request: already running here
      return jsonb_build_object('started', private.time_session_json(r), 'stopped', null, 'server_now', now());
    end if;
    update public.time_sessions
      set ended_at = greatest(now(), started_at + interval '1 microsecond')
      where id = r.id returning * into v_stopped;
  end if;

  insert into public.time_sessions (user_id, task_id, occurrence_id, started_at, source)
  values (v_uid, o.task_id, o.id, now(), 'timer') returning * into v_new;

  return jsonb_build_object(
    'started', private.time_session_json(v_new),
    'stopped', case when v_stopped.id is null then null else private.time_session_json(v_stopped) end,
    'server_now', now());
end $$;

-- Stops the running timer. p_ended_at lets the user correct a forgotten timer (must lie between
-- the start and now). Idempotent: stopping an already-stopped session returns it unchanged.
create function public.stop_timer(p_session_id uuid default null, p_ended_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.time_sessions; v_end timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0));

  select * into r from public.time_sessions
  where user_id = v_uid and ended_at is null and (p_session_id is null or id = p_session_id) for update;
  if not found then
    if p_session_id is not null then
      select * into r from public.time_sessions where id = p_session_id and user_id = v_uid;
      if found then return jsonb_build_object('stopped', private.time_session_json(r), 'server_now', now()); end if;
    end if;
    raise exception 'no running timer' using errcode = 'P0002';
  end if;

  v_end := coalesce(p_ended_at, greatest(now(), r.started_at + interval '1 microsecond'));
  if v_end <= r.started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if v_end > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if v_end - r.started_at > interval '24 hours' then
    raise exception 'timer ran over 24 hours: choose the real end time' using errcode = '22023';
  end if;

  update public.time_sessions set ended_at = v_end, edited_at = case when p_ended_at is null then edited_at else now() end
  where id = r.id returning * into r;
  return jsonb_build_object('stopped', private.time_session_json(r), 'server_now', now());
end $$;

create function public.add_time_entry(p_occurrence_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); o record; s public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_ended_at <= p_started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if p_ended_at > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at - p_started_at > interval '24 hours' then raise exception 'an entry can be at most 24 hours' using errcode = '22023'; end if;
  if p_started_at < now() - interval '1 year' then raise exception 'entry is too far in the past' using errcode = '22023'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;

  select oc.id, oc.task_id into o
  from public.task_occurrences oc join public.tasks t on t.id = oc.task_id and t.user_id = oc.user_id
  where oc.id = p_occurrence_id and oc.user_id = v_uid and t.archived_at is null;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;

  insert into public.time_sessions (user_id, task_id, occurrence_id, started_at, ended_at, source, note)
  values (v_uid, o.task_id, o.id, p_started_at, p_ended_at, 'manual', nullif(btrim(p_note), ''))
  returning * into s;
  return private.time_session_json(s);
end $$;

-- Correct an entry. For a running session only the start and note can change unless p_ended_at closes it.
create function public.update_time_entry(p_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.time_sessions; s public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0));
  select * into r from public.time_sessions where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if p_started_at > now() + interval '1 minute' then raise exception 'start cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at is not null and p_ended_at > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at is not null and p_ended_at <= p_started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if p_ended_at is null and r.ended_at is not null then raise exception 'a finished entry needs an end time' using errcode = '22023'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;

  update public.time_sessions
  set started_at = p_started_at, ended_at = p_ended_at, note = nullif(btrim(p_note), ''), edited_at = now()
  where id = r.id returning * into s;
  return private.time_session_json(s);
end $$;

revoke all on function private.time_session_json(public.time_sessions) from public, anon, authenticated;
revoke all on function public.start_timer(uuid) from public, anon;
revoke all on function public.stop_timer(uuid, timestamptz) from public, anon;
revoke all on function public.add_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.update_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.start_timer(uuid) to authenticated;
grant execute on function public.stop_timer(uuid, timestamptz) to authenticated;
grant execute on function public.add_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.update_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
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
-- AI assistant support: working hours, usage metering / rate limiting, and a small response cache.
-- No prompts or task text are ever stored in ai_usage. ai_cache holds only the model's validated
-- output for the owner (never readable by other users, including administrators).

alter table public.user_settings
  add column work_start time not null default '09:00',
  add column work_end time not null default '18:00',
  add constraint user_settings_work_hours check (work_end > work_start);
grant update (work_start, work_end) on public.user_settings to authenticated;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feature text not null check (char_length(feature) between 1 and 40),
  status text not null default 'started' check (status in ('started', 'ok', 'error')),
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  estimated_cost_usd numeric(10, 6),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Atomically checks the per-user hourly/daily limits and reserves a call. Writes go through these
-- functions only, so a client cannot reset or forge its own counters.
create function public.ai_reserve_call(p_feature text, p_hour_limit integer, p_day_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hour integer; v_day integer; v_oldest timestamptz; v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_hour_limit < 1 or p_day_limit < 1 then raise exception 'invalid limits' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_uid::text, 0));

  select count(*) into v_hour from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_hour >= p_hour_limit then
    select min(created_at) into v_oldest from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 hour';
    return jsonb_build_object('allowed', false, 'scope', 'hour',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int));
  end if;
  select count(*) into v_day from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
  if v_day >= p_day_limit then
    select min(created_at) into v_oldest from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
    return jsonb_build_object('allowed', false, 'scope', 'day',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int));
  end if;

  insert into public.ai_usage (user_id, feature) values (v_uid, left(p_feature, 40)) returning id into v_id;
  return jsonb_build_object('allowed', true, 'id', v_id);
end $$;

create function public.ai_complete_call(
  p_id uuid, p_status text, p_model text, p_input integer, p_output integer, p_cache_read integer, p_cost numeric, p_error text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('ok', 'error') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.ai_usage
  set status = p_status, model = left(p_model, 100), input_tokens = p_input, output_tokens = p_output,
      cache_read_tokens = p_cache_read, estimated_cost_usd = p_cost, error_code = left(p_error, 40), completed_at = now()
  where id = p_id and user_id = auth.uid() and status = 'started';
end $$;

revoke all on function public.ai_reserve_call(text, integer, integer) from public, anon;
revoke all on function public.ai_complete_call(uuid, text, text, integer, integer, integer, numeric, text) from public, anon;
grant execute on function public.ai_reserve_call(text, integer, integer) to authenticated;
grant execute on function public.ai_complete_call(uuid, text, text, integer, integer, integer, numeric, text) to authenticated;

create table public.ai_cache (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key_hash text not null check (char_length(key_hash) = 64),
  feature text not null check (char_length(feature) <= 40),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, key_hash)
);
create index ai_cache_expires_idx on public.ai_cache (expires_at);
alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from public, anon, authenticated;
grant select, insert, update, delete on public.ai_cache to authenticated;
create policy ai_cache_select_own on public.ai_cache for select to authenticated using (user_id = (select auth.uid()));
create policy ai_cache_insert_own on public.ai_cache for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_cache_update_own on public.ai_cache for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_cache_delete_own on public.ai_cache for delete to authenticated using (user_id = (select auth.uid()));
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.task_event_type add value if not exists 'recurrence_changed';
