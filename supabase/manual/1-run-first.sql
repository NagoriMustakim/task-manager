-- Foundation: extensions, enums, private schema, shared helpers.
-- Additive only. The `private` schema is NOT exposed through the Supabase Data API
-- (only `public` is), so nothing in it is callable via PostgREST.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- RLS policies call helper functions in `private` as the invoking user, so
-- `authenticated` needs USAGE on the schema (and EXECUTE on specific helpers only).
grant usage on schema private to authenticated;

create type public.app_role as enum ('user', 'admin');
create type public.task_status as enum ('new', 'pending', 'done', 'incomplete');
create type public.task_priority as enum ('none', 'low', 'medium', 'high', 'urgent');
create type public.goal_status as enum ('active', 'completed', 'archived');
create type public.task_event_type as enum (
  'task_created', 'priority_changed', 'deadline_changed',
  'occurrence_created', 'status_changed', 'rescheduled'
);
create type public.time_session_source as enum ('timer', 'manual');

-- Generic updated_at maintenance.
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Blocks UPDATEs of the named columns (trigger args). Used for ownership and
-- identity columns so a row can never be re-parented to another user/task.
create function private.forbid_update_of() returns trigger
language plpgsql set search_path = '' as $$
declare col text;
begin
  foreach col in array tg_argv loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      raise exception 'column "%" of %.% is immutable', col, tg_table_schema, tg_table_name
        using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- Emails that become administrators once the address is CONFIRMED by Supabase Auth.
-- Server-side only: no grants, not exposed. Managed via migrations/SQL editor.
create table private.admin_bootstrap_emails (
  email text primary key check (email = lower(email))
);
insert into private.admin_bootstrap_emails (email)
values ('mustakimkhan1111176@gmail.com')
on conflict do nothing;
-- Identity: profiles, trusted roles, settings, admin access grants, role audit.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profiles_immutable before update on public.profiles
  for each row execute function private.forbid_update_of('id');

-- Trusted role storage. Separate from profiles so the role can never be reached
-- by any client-writable column grant; there are NO write policies/grants at all.
create table public.user_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role public.app_role not null default 'user',
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  timezone text not null default 'UTC',
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6), -- 0=Sunday
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function private.set_updated_at();

create function private.validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid IANA timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;
create trigger user_settings_timezone before insert or update of timezone on public.user_settings
  for each row execute function private.validate_timezone();

-- Which normal users an administrator is authorised to read. Read-only access:
-- no policy anywhere gives an admin write access to another user's data.
create table public.admin_user_access (
  admin_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (admin_id, user_id),
  check (admin_id <> user_id)
);
create index admin_user_access_user_id_idx on public.admin_user_access (user_id);

-- Append-only history of role changes, written by trigger only.
create table public.role_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  old_role public.app_role,
  new_role public.app_role not null,
  changed_by text not null default current_user,
  changed_by_uid uuid,
  changed_at timestamptz not null default now()
);
create index role_audit_log_user_id_idx on public.role_audit_log (user_id, changed_at desc);

create function private.audit_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_audit_log (user_id, old_role, new_role, changed_by_uid)
  values (new.user_id, case when tg_op = 'UPDATE' then old.role end, new.role,
          nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  return new;
end $$;
revoke all on function private.audit_role_change() from public, anon, authenticated;
create trigger user_roles_audit after insert or update of role on public.user_roles
  for each row execute function private.audit_role_change();

-- Provisioning -----------------------------------------------------------------
-- Role decisions are made ONLY here, from auth.users.email (server-controlled)
-- and email_confirmed_at. raw_user_meta_data / raw_app_meta_data are never read.
create function private.provision_user(p_id uuid, p_email text, p_confirmed boolean, p_first_time boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role := 'user';
begin
  insert into public.profiles (id, email) values (p_id, p_email)
  on conflict (id) do update set email = excluded.email;

  if not p_first_time then
    return; -- plain email/profile sync: never re-evaluate roles
  end if;

  insert into public.user_settings (user_id) values (p_id) on conflict do nothing;

  if p_confirmed and exists (
    select 1 from private.admin_bootstrap_emails b where b.email = lower(p_email)
  ) then
    v_role := 'admin';
  end if;

  insert into public.user_roles (user_id, role) values (p_id, v_role)
  on conflict (user_id) do update set role = 'admin'
    where excluded.role = 'admin' and public.user_roles.role <> 'admin';

  if v_role = 'admin' then
    insert into public.admin_user_access (admin_id, user_id)
    select p_id, r.user_id from public.user_roles r
    where r.role = 'user' and r.user_id <> p_id
    on conflict do nothing;
  else
    insert into public.admin_user_access (admin_id, user_id)
    select r.user_id, p_id from public.user_roles r
    where r.role = 'admin' and r.user_id <> p_id
    on conflict do nothing;
  end if;
end $$;
revoke all on function private.provision_user(uuid, text, boolean, boolean) from public, anon, authenticated;

create function private.handle_auth_user_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_first boolean;
begin
  -- Roles are evaluated on creation, or at the moment the email first becomes confirmed.
  -- Later email changes can never promote an account.
  v_first := tg_op = 'INSERT'
    or (old.email_confirmed_at is null and new.email_confirmed_at is not null);
  perform private.provision_user(new.id, new.email, new.email_confirmed_at is not null, v_first);
  return new;
end $$;
revoke all on function private.handle_auth_user_change() from public, anon, authenticated;

create trigger on_auth_user_change
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_change();

-- Backfill users that already exist when this migration is applied.
select private.provision_user(u.id, u.email, u.email_confirmed_at is not null, true)
from auth.users u;
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
-- Row Level Security, grants and authorisation helpers.
--
-- Model: owner access via `user_id = auth.uid()`; read-only admin access to users
-- listed in admin_user_access for callers whose trusted role is 'admin'.
-- Helpers are SECURITY DEFINER (owner bypasses RLS) so policies never recurse into
-- user_roles / admin_user_access policies. search_path is pinned to '' and every
-- object is schema-qualified.

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = 'admin'
  );
$$;

create function private.admin_can_read(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.admin_user_access a
    join public.user_roles r on r.user_id = a.admin_id and r.role = 'admin'
    where a.admin_id = (select auth.uid()) and a.user_id = p_user_id
  );
$$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.admin_can_read(uuid) from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.admin_can_read(uuid) to authenticated;

-- Lock everything down first (Supabase default privileges grant broad access to
-- anon/authenticated on new public tables), then grant the minimum back.
revoke all on
  public.profiles, public.user_roles, public.user_settings, public.admin_user_access,
  public.role_audit_log, public.categories, public.goals, public.milestones, public.tasks,
  public.task_occurrences, public.time_sessions, public.task_events
from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_settings enable row level security;
alter table public.admin_user_access enable row level security;
alter table public.role_audit_log enable row level security;
alter table public.categories enable row level security;
alter table public.goals enable row level security;
alter table public.milestones enable row level security;
alter table public.tasks enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.time_sessions enable row level security;
alter table public.task_events enable row level security;

-- Identity tables ------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.admin_can_read(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.user_roles to authenticated;      -- no write grants: service/SQL only
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

grant select on public.user_settings to authenticated;
grant update (timezone, week_start_day) on public.user_settings to authenticated;
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()) or private.admin_can_read(user_id));
create policy user_settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.admin_user_access to authenticated;
create policy admin_user_access_select on public.admin_user_access for select to authenticated
  using (admin_id = (select auth.uid()));

grant select on public.role_audit_log to authenticated;
create policy role_audit_log_select on public.role_audit_log for select to authenticated
  using (private.is_admin());

-- Owner-writable, admin-readable data tables ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'goals', 'milestones', 'tasks', 'task_occurrences', 'time_sessions']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy %1$I_select on public.%1$I for select to authenticated
      using (user_id = (select auth.uid()) or private.admin_can_read(user_id))$p$, t);
    execute format($p$create policy %1$I_insert on public.%1$I for insert to authenticated
      with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy %1$I_update on public.%1$I for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy %1$I_delete on public.%1$I for delete to authenticated
      using (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Read-only for clients; written only by definer triggers.
grant select on public.task_events to authenticated;
create policy task_events_select on public.task_events for select to authenticated
  using (user_id = (select auth.uid()) or private.admin_can_read(user_id));
-- Trusted, repeatable role provisioning for accounts that already exist in Supabase Auth.
-- Run from the SQL editor / psql as the project owner (postgres). Not callable by clients:
-- lives in `private` and EXECUTE is revoked from everyone but the owner.
--
-- Promotes ONLY users whose email is in private.admin_bootstrap_emails AND confirmed.
-- It never demotes and never reads user metadata. Safe to run any number of times.

create function private.reconcile_roles()
returns table (email text, role public.app_role, confirmed boolean, note text)
language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  for u in select id, au.email as em, au.email_confirmed_at is not null as ok from auth.users au loop
    perform private.provision_user(u.id, u.em, u.ok, true);
  end loop;

  return query
    select b.email,
           r.role,
           coalesce(au.email_confirmed_at is not null, false),
           case when au.id is null then 'no Auth identity yet: create/invite the account first'
                when au.email_confirmed_at is null then 'identity exists but email not confirmed: not promoted'
                else 'ok' end
    from private.admin_bootstrap_emails b
    left join auth.users au on lower(au.email) = b.email
    left join public.user_roles r on r.user_id = au.id;
end $$;
revoke all on function private.reconcile_roles() from public, anon, authenticated;
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
-- Own migration: a new enum value cannot be used in the transaction that adds it.
alter type public.task_event_type add value if not exists 'reschedule_undone';
