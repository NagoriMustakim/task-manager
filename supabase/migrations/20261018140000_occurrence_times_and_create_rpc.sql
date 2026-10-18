-- Optional start/end times per occurrence, and an atomic task+occurrence creation RPC.

alter table public.task_occurrences
  add column start_time time,
  add column end_time time,
  add constraint task_occurrences_time_order
    check (end_time is null or (start_time is not null and end_time > start_time));

-- SECURITY INVOKER: runs with the caller's privileges, so RLS and column defaults
-- (user_id = auth.uid()) apply exactly as for direct inserts. Both inserts succeed or neither.
create function public.create_task_with_occurrence(
  p_title text,
  p_date date,
  p_priority public.task_priority default 'medium',
  p_notes text default null,
  p_category_id uuid default null,
  p_deadline date default null,
  p_estimated_minutes integer default null,
  p_start time default null,
  p_end time default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_task uuid; v_occ uuid;
begin
  insert into public.tasks (title, notes, priority, category_id, deadline_date, estimated_minutes)
  values (p_title, p_notes, p_priority, p_category_id, p_deadline, p_estimated_minutes)
  returning id into v_task;

  insert into public.task_occurrences (task_id, original_date, scheduled_date, start_time, end_time)
  values (v_task, p_date, p_date, p_start, p_end)
  returning id into v_occ;

  return v_occ;
end $$;
revoke all on function public.create_task_with_occurrence(text, date, public.task_priority, text, uuid, date, integer, time, time) from public, anon;
grant execute on function public.create_task_with_occurrence(text, date, public.task_priority, text, uuid, date, integer, time, time) to authenticated;
