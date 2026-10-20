-- =====================================================================================
-- STEP A  (safe: only ADDS things and COPIES your tasks; nothing is deleted)
-- Run in Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- It is safe to run more than once.
--
-- What it does
--   1. Creates ONE simple table  public.todos  (title, priority, status, day, start/end time).
--   2. Copies your current tasks into it (one row per current task; moved/archived history is skipped).
--   3. Lets the administrator read every user's todos (fixes "admin cannot see other tasks").
--   4. Simplifies account provisioning (no more settings rows or access-grant rows).
-- =====================================================================================
begin;

-- 1. The simple table -----------------------------------------------------------------
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'new',
  scheduled_date date not null,
  start_time time,
  end_time time,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todos_time_order check (end_time is null or (start_time is not null and end_time > start_time))
);
create index if not exists todos_user_date_idx on public.todos (user_id, scheduled_date);
create index if not exists todos_user_open_idx on public.todos (user_id, scheduled_date) where status in ('new', 'pending');

-- completed_at and updated_at are maintained by the database; user_id can never be changed.
create or replace function private.todos_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.completed_at := case when new.status = 'done' then coalesce(new.completed_at, now()) end;
  elsif new.status is distinct from old.status then
    new.completed_at := case when new.status = 'done' then now() end;
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end $$;
revoke all on function private.todos_before_write() from public, anon, authenticated;
drop trigger if exists todos_before_write on public.todos;
create trigger todos_before_write before insert or update on public.todos
  for each row execute function private.todos_before_write();

-- 2. Row level security -------------------------------------------------------------------
alter table public.todos enable row level security;
revoke all on public.todos from public, anon, authenticated;
grant select, delete on public.todos to authenticated;
grant insert (title, priority, status, scheduled_date, start_time, end_time) on public.todos to authenticated;
grant update (title, priority, status, scheduled_date, start_time, end_time) on public.todos to authenticated;

drop policy if exists todos_select on public.todos;
drop policy if exists todos_insert on public.todos;
drop policy if exists todos_update on public.todos;
drop policy if exists todos_delete on public.todos;
-- Owner sees own rows; an administrator (trusted role in public.user_roles) can READ everyone's.
create policy todos_select on public.todos for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy todos_insert on public.todos for insert to authenticated with check (user_id = (select auth.uid()));
create policy todos_update on public.todos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy todos_delete on public.todos for delete to authenticated using (user_id = (select auth.uid()));

-- 3. Administrator can read all users (profiles, roles): no per-user grant rows needed any more ---
create or replace function private.admin_can_read(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin();
$$;

-- 4. Simpler provisioning for new accounts (profile + trusted role only) -----------------------
create or replace function private.provision_user(p_id uuid, p_email text, p_confirmed boolean, p_first_time boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.app_role := 'user';
begin
  insert into public.profiles (id, email) values (p_id, p_email)
  on conflict (id) do update set email = excluded.email;
  if not p_first_time then return; end if;

  if p_confirmed and exists (select 1 from private.admin_bootstrap_emails b where b.email = lower(p_email)) then
    v_role := 'admin';
  end if;
  insert into public.user_roles (user_id, role) values (p_id, v_role)
  on conflict (user_id) do update set role = 'admin'
    where excluded.role = 'admin' and public.user_roles.role <> 'admin';
end $$;
revoke all on function private.provision_user(uuid, text, boolean, boolean) from public, anon, authenticated;

-- 5. Copy current tasks (only if todos is still empty, so re-running never duplicates) -----------
do $$
begin
  if to_regclass('public.task_occurrences') is not null
     and to_regclass('public.tasks') is not null
     and not exists (select 1 from public.todos) then
    insert into public.todos (user_id, title, priority, status, scheduled_date, start_time, end_time, completed_at, created_at)
    select o.user_id, left(t.title, 300),
           case when t.priority = 'none' then 'medium'::public.task_priority else t.priority end,
           o.status, o.scheduled_date, o.start_time, o.end_time, o.completed_at, t.created_at
    from public.task_occurrences o
    join public.tasks t on t.id = o.task_id and t.user_id = o.user_id
    where o.moved_to_occurrence_id is null and t.archived_at is null;
  end if;
end $$;

-- 6. Make sure the administrator role is set for your confirmed admin email ----------------------
select private.reconcile_roles();

commit;

-- CHECK: 'todos_now' should equal 'expected_from_old_tables'; your admin email should show role admin.
select 'todos_now' as item, count(*)::text as value from public.todos
union all
select 'expected_from_old_tables',
  case when to_regclass('public.task_occurrences') is null then '(old tables already removed)' else
    (select count(*)::text from public.task_occurrences o join public.tasks t on t.id = o.task_id
     where o.moved_to_occurrence_id is null and t.archived_at is null) end
union all
select 'role of ' || u.email, coalesce(r.role::text, '(none)')
from auth.users u left join public.user_roles r on r.user_id = u.id;
