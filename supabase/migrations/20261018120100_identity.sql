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
