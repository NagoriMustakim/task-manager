# Account provisioning and roles

## Principles

- Roles are stored in `public.user_roles`, which clients can read (own row) but never write.
- Roles are **never** read from `user_metadata`/`app_metadata` or any browser-supplied value.
- Role decisions are made by `private.provision_user()`, called from a trigger on `auth.users`, using only `auth.users.email` and `email_confirmed_at`.

## Initial accounts

| Email | Role | How |
|---|---|---|
| mustakimkhan1111176@gmail.com | `admin` | listed in `private.admin_bootstrap_emails` (seeded by migration `…120000_foundation.sql`) |
| nagorifarhankhan53@gmail.com | `user` | default for every other account |

Procedure:
1. Apply migrations to the Supabase project (`supabase link && supabase db push`).
2. In Supabase Auth settings, **keep email confirmation enabled** and **disable open sign-ups** (or limit to invited users). Create both accounts via *Authentication → Users → Invite/Add user* (or sign up and confirm).
3. When the admin address is confirmed, the trigger sets role `admin` and grants read access (`admin_user_access`) to every non-admin user; later users are granted automatically.
4. Verify as the SQL-editor owner: `select u.email, r.role from auth.users u join public.user_roles r on r.user_id = u.id;`

Safeguards:
- **Unconfirmed addresses never become admin.** Without this, anyone could register the admin email first. Promotion fires only on user creation with a confirmed email, or at the moment `email_confirmed_at` first becomes non-null. Changing the email of an existing account never promotes it. Emails are matched case-insensitively.
- Roles are not demoted automatically; the first-time check only upgrades.

## Changing roles later

Only via the SQL editor / migrations / service role (never browser code):

```sql
update public.user_roles set role = 'admin', granted_by = null where user_id = '<uuid>';
-- then, if the new admin should see users:
insert into public.admin_user_access (admin_id, user_id)
select '<uuid>', user_id from public.user_roles where role = 'user' and user_id <> '<uuid>'
on conflict do nothing;
```
Changes are recorded in `public.role_audit_log`. Demoting an admin immediately removes their read access (policies check the role at query time). To restrict an admin to specific users, delete rows from `admin_user_access`.

To add another bootstrap admin: `insert into private.admin_bootstrap_emails values ('lowercase@email');` (takes effect at that user's next first-time provisioning; for an existing user use the SQL above).

## Service-role key

Not used by the application at present. If later needed (e.g. an invite endpoint), keep it in a `server-only` module, Vercel server env var, never `NEXT_PUBLIC_*`.

## Required environment (see `.env.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser-safe). Credentials/live project are required for end-to-end auth; none were available in this phase.
