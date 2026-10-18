-- Time tracking and the task event log.

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  occurrence_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,                 -- NULL = timer currently running
  source public.time_session_source not null default 'timer',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  -- occurrence must belong to the same task (and therefore the same user)
  foreign key (occurrence_id, task_id) references public.task_occurrences (id, task_id)
    on delete set null (occurrence_id),
  -- A user cannot have overlapping sessions, which also means at most one running timer.
  constraint time_sessions_no_overlap exclude using gist (
    user_id with =,
    tstzrange(started_at, coalesce(ended_at, 'infinity'::timestamptz)) with &&
  )
);
create index time_sessions_user_started_idx on public.time_sessions (user_id, started_at desc);
create index time_sessions_task_idx on public.time_sessions (task_id, started_at desc);
create index time_sessions_occurrence_idx on public.time_sessions (occurrence_id) where occurrence_id is not null;
create trigger time_sessions_updated_at before update on public.time_sessions for each row execute function private.set_updated_at();
create trigger time_sessions_immutable before update on public.time_sessions
  for each row execute function private.forbid_update_of('user_id', 'task_id');

-- Append-only log of meaningful changes. Rows are written exclusively by the
-- SECURITY DEFINER triggers below; clients hold no INSERT/UPDATE/DELETE privilege.
create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid not null,
  occurrence_id uuid,
  event_type public.task_event_type not null,
  from_status public.task_status,
  to_status public.task_status,
  from_date date,
  to_date date,
  from_priority public.task_priority,
  to_priority public.task_priority,
  actor_id uuid,                        -- auth.uid() at the time of the change
  created_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (occurrence_id, user_id) references public.task_occurrences (id, user_id)
    on delete set null (occurrence_id)
);
create index task_events_task_idx on public.task_events (task_id, created_at);
create index task_events_user_idx on public.task_events (user_id, created_at desc);
create index task_events_occurrence_idx on public.task_events (occurrence_id) where occurrence_id is not null;

create function private.log_task_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, event_type, to_priority, to_date, actor_id)
    values (new.user_id, new.id, 'task_created', new.priority, new.deadline_date, auth.uid());
  else
    if new.priority is distinct from old.priority then
      insert into public.task_events (user_id, task_id, event_type, from_priority, to_priority, actor_id)
      values (new.user_id, new.id, 'priority_changed', old.priority, new.priority, auth.uid());
    end if;
    if new.deadline_date is distinct from old.deadline_date then
      insert into public.task_events (user_id, task_id, event_type, from_date, to_date, actor_id)
      values (new.user_id, new.id, 'deadline_changed', old.deadline_date, new.deadline_date, auth.uid());
    end if;
  end if;
  return null;
end $$;
revoke all on function private.log_task_changes() from public, anon, authenticated;
create trigger tasks_log after insert or update on public.tasks
  for each row execute function private.log_task_changes();

create function private.log_occurrence_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (user_id, task_id, occurrence_id, event_type, to_status, to_date, actor_id)
    values (new.user_id, new.task_id, new.id, 'occurrence_created', new.status, new.scheduled_date, auth.uid());
  else
    if new.status is distinct from old.status then
      insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_status, to_status, actor_id)
      values (new.user_id, new.task_id, new.id, 'status_changed', old.status, new.status, auth.uid());
    end if;
    if new.scheduled_date is distinct from old.scheduled_date then
      insert into public.task_events (user_id, task_id, occurrence_id, event_type, from_date, to_date, actor_id)
      values (new.user_id, new.task_id, new.id, 'rescheduled', old.scheduled_date, new.scheduled_date, auth.uid());
    end if;
  end if;
  return null;
end $$;
revoke all on function private.log_occurrence_changes() from public, anon, authenticated;
create trigger task_occurrences_log after insert or update on public.task_occurrences
  for each row execute function private.log_occurrence_changes();
