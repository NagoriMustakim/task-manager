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
