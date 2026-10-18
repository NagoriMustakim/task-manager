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
