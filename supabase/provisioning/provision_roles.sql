-- Run in the Supabase SQL editor AFTER both Auth identities exist and are confirmed.
-- Reports status per bootstrap admin; creates nothing and invents no accounts.
select * from private.reconcile_roles();

-- Verification (expected: admin for mustakimkhan1111176@gmail.com, user for others)
select u.email, u.email_confirmed_at is not null as confirmed, r.role
from auth.users u left join public.user_roles r on r.user_id = u.id
order by u.created_at;
