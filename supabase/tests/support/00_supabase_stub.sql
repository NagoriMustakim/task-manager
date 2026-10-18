-- Minimal stand-in for the parts of Supabase that migrations depend on, so the
-- migrations and RLS policies can run on plain PostgreSQL. NOT a real Supabase stack.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- Same contract as Supabase's auth.uid(): reads the JWT sub claim from the session.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Mirror Supabase's permissive default privileges so our REVOKEs are actually exercised.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
