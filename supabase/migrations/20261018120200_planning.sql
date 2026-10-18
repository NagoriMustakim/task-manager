-- Planning: categories, goals, milestones, tasks, task occurrences.
--
-- Ownership integrity: every child row carries user_id and references its parent via a
-- composite FK (parent_id, user_id) -> parent (id, user_id). A row can therefore never
-- point at another user's parent, independent of RLS.
--
-- Deletion: deleting a user cascades everything. Deleting a task cascades to its
-- occurrences, events and time sessions (hard delete is an explicit owner action; use
-- tasks.archived_at to retire a task while keeping history). Deleting a category/goal
-- only detaches tasks (SET NULL).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index categories_user_name_key on public.categories (user_id, lower(name));

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  status public.goal_status not null default 'active',
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index goals_user_status_idx on public.goals (user_id, status);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  goal_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index milestones_goal_idx on public.milestones (goal_id, sort_order);
create index milestones_user_idx on public.milestones (user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  notes text,
  priority public.task_priority not null default 'none',
  category_id uuid,
  goal_id uuid,
  deadline_date date,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  -- RFC 5545 RRULE (without DTSTART); NULL = one-off task. First occurrence date is
  -- the earliest task_occurrences.original_date.
  recurrence_rule text check (recurrence_rule is null or char_length(recurrence_rule) <= 500),
  recurrence_until date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (recurrence_until is null or recurrence_rule is not null),
  foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete set null (category_id),
  foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete set null (goal_id)
);
create index tasks_user_active_idx on public.tasks (user_id, created_at desc) where archived_at is null;
create index tasks_category_idx on public.tasks (category_id) where category_id is not null;
create index tasks_goal_idx on public.tasks (goal_id) where goal_id is not null;
create index tasks_user_deadline_idx on public.tasks (user_id, deadline_date) where deadline_date is not null;

-- One row per scheduled instance of a task.
--  * original_date  – the date first scheduled; immutable.
--  * scheduled_date – the current date; changes are recorded in task_events (rescheduled),
--                     so the full scheduling history is preserved.
--  * Carry-forward  – close the old occurrence as 'incomplete' and insert a new one with
--                     carried_from_occurrence_id set; the old day stays historically true.
--  * Recurrence     – each generated instance is its own row with its own status.
create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  task_id uuid not null,
  original_date date not null,
  scheduled_date date not null,
  status public.task_status not null default 'new',
  completed_at timestamptz,            -- server-managed, see trigger
  carried_from_occurrence_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, task_id),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (carried_from_occurrence_id, user_id) references public.task_occurrences (id, user_id)
    on delete set null (carried_from_occurrence_id)
);
-- Idempotent recurrence generation: one root occurrence per task per original date.
create unique index task_occurrences_root_key
  on public.task_occurrences (task_id, original_date) where carried_from_occurrence_id is null;
create index task_occurrences_user_date_idx on public.task_occurrences (user_id, scheduled_date, sort_order);
create index task_occurrences_open_idx on public.task_occurrences (user_id, scheduled_date)
  where status in ('new', 'pending');
create index task_occurrences_task_idx on public.task_occurrences (task_id, scheduled_date);
create index task_occurrences_carried_idx on public.task_occurrences (carried_from_occurrence_id)
  where carried_from_occurrence_id is not null;
create index task_occurrences_completed_idx on public.task_occurrences (user_id, completed_at)
  where completed_at is not null;

create function private.occurrence_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.completed_at := case when new.status = 'done' then now() end;
  elsif new.status is distinct from old.status then
    new.completed_at := case when new.status = 'done' then now() end;
  else
    new.completed_at := old.completed_at;   -- completion time cannot be edited directly
  end if;
  return new;
end $$;
create trigger task_occurrences_before_write before insert or update on public.task_occurrences
  for each row execute function private.occurrence_before_write();
create trigger task_occurrences_immutable before update on public.task_occurrences
  for each row execute function private.forbid_update_of('user_id', 'task_id', 'original_date');

create trigger categories_updated_at before update on public.categories for each row execute function private.set_updated_at();
create trigger goals_updated_at before update on public.goals for each row execute function private.set_updated_at();
create trigger milestones_updated_at before update on public.milestones for each row execute function private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks for each row execute function private.set_updated_at();
create trigger task_occurrences_updated_at before update on public.task_occurrences for each row execute function private.set_updated_at();

create trigger categories_immutable before update on public.categories for each row execute function private.forbid_update_of('user_id');
create trigger goals_immutable before update on public.goals for each row execute function private.forbid_update_of('user_id');
create trigger milestones_immutable before update on public.milestones for each row execute function private.forbid_update_of('user_id', 'goal_id');
create trigger tasks_immutable before update on public.tasks for each row execute function private.forbid_update_of('user_id');
