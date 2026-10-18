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
