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
