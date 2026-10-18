-- Repeatable RLS / role-isolation tests. Run via scripts/test-db.sh (plain Postgres + stub)
-- or against a local `supabase start` database. Every assertion raises on failure.
\set ON_ERROR_STOP on
-- Runs in one transaction that is rolled back, but use a DISPOSABLE database only
-- (it creates fixture accounts, including the bootstrap admin address).
begin;
insert into private.admin_bootstrap_emails values ('pending-admin@example.com') on conflict do nothing;
create schema t;
create function t.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  execute 'set role anon';
end $$;
create function t.reset() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'ok: %', msg; end $$;
-- Expects the statement to fail with a privilege / RLS / constraint error.
create function t.denied(stmt text, msg text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when insufficient_privilege or check_violation or raise_exception
    or foreign_key_violation or exclusion_violation or unique_violation or invalid_parameter_value then
    raise notice 'ok (denied): %', msg; return;
  end;
  raise exception 'FAIL (statement succeeded): %', msg;
end $$;
grant usage on schema t to anon, authenticated;
grant execute on all functions in schema t to anon, authenticated;

-- Fixtures: accounts are created through auth.users like real sign-ups -----------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data) values
 ('a0000000-0000-0000-0000-000000000001','mustakimkhan1111176@gmail.com', now(), '{}', '{}'),
 ('b0000000-0000-0000-0000-000000000002','nagorifarhankhan53@gmail.com',  now(), '{}', '{}'),
 ('c0000000-0000-0000-0000-000000000003','attacker@example.com',          now(), '{"role":"admin"}', '{"role":"admin"}'),
 ('d0000000-0000-0000-0000-000000000004','pending-admin@example.com', null,  '{}', '{}');  -- bootstrap address, not yet confirmed

select t.ok((select role from user_roles where user_id='a0000000-0000-0000-0000-000000000001')='admin', 'confirmed bootstrap email becomes admin');
select t.ok((select role from user_roles where user_id='b0000000-0000-0000-0000-000000000002')='user', 'normal user is role user');
select t.ok((select role from user_roles where user_id='c0000000-0000-0000-0000-000000000003')='user', 'metadata role claim is ignored');
select t.ok((select role from user_roles where user_id='d0000000-0000-0000-0000-000000000004')='user', 'UNCONFIRMED admin email is not promoted');
select t.ok((select count(*) from admin_user_access where admin_id='a0000000-0000-0000-0000-000000000001')=3, 'admin granted read access to all non-admin users');
select t.ok((select timezone from user_settings where user_id='b0000000-0000-0000-0000-000000000002')='UTC', 'settings provisioned');
-- Email change on an already-confirmed account must not promote.
insert into private.admin_bootstrap_emails values ('swap-admin@example.com');
update auth.users set email='swap-admin@example.com' where id='b0000000-0000-0000-0000-000000000002';
select t.ok((select role from user_roles where user_id='b0000000-0000-0000-0000-000000000002')='user', 'email change does not promote');
update auth.users set email='nagorifarhankhan53@gmail.com' where id='b0000000-0000-0000-0000-000000000002';
-- Confirming the look-alike address is the (legitimate) owner path -> promoted exactly then.
-- (Skipped as an assertion of promotion: confirmation of the real address == the admin.)

-- Normal user creates data -------------------------------------------------------------
select t.as_user('b0000000-0000-0000-0000-000000000002');
insert into categories (id, name) values ('10000000-0000-0000-0000-00000000000b','Work');
insert into tasks (id, title, category_id, priority) values ('20000000-0000-0000-0000-00000000000b','Write report','10000000-0000-0000-0000-00000000000b','low');
insert into task_occurrences (id, task_id, original_date, scheduled_date)
  values ('30000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','2026-10-18','2026-10-18');
insert into time_sessions (task_id, started_at, ended_at, source)
  values ('20000000-0000-0000-0000-00000000000b','2026-10-18 09:00+00','2026-10-18 10:00+00','manual');
select t.reset();

-- Another user's data (for isolation) --------------------------------------------------
select t.as_user('c0000000-0000-0000-0000-000000000003');
insert into categories (id, name) values ('10000000-0000-0000-0000-00000000000c','Mine');
insert into tasks (id, title) values ('20000000-0000-0000-0000-00000000000c','Attacker task');
select t.reset();

-- Isolation ------------------------------------------------------------------------------
select t.as_user('c0000000-0000-0000-0000-000000000003');
select t.ok((select count(*) from tasks)=1, 'user sees only own tasks');
select t.ok((select count(*) from task_occurrences)=0, 'user sees no foreign occurrences');
select t.ok((select count(*) from time_sessions)=0, 'user sees no foreign time sessions');
select t.ok((select count(*) from task_events where task_id='20000000-0000-0000-0000-00000000000b')=0, 'user sees no foreign events');
select t.ok((select count(*) from profiles)=1, 'user sees only own profile');
select t.ok((select count(*) from user_roles)=1, 'user sees only own role row');
select t.ok((select count(*) from admin_user_access)=0, 'user cannot see admin grants');
select t.ok((select count(*) from role_audit_log)=0, 'user cannot see role audit log');
select t.denied($$insert into tasks (user_id, title) values ('b0000000-0000-0000-0000-000000000002','forged')$$, 'cannot insert task for another user');
select t.denied($$insert into tasks (title, category_id) values ('x','10000000-0000-0000-0000-00000000000b')$$, 'cannot reference another user''s category');
select t.denied($$insert into task_occurrences (task_id, original_date, scheduled_date) values ('20000000-0000-0000-0000-00000000000b','2026-10-19','2026-10-19')$$, 'cannot add occurrence to foreign task');
select t.denied($$insert into time_sessions (task_id) values ('20000000-0000-0000-0000-00000000000b')$$, 'cannot track time on foreign task');
update tasks set title='hacked' where id='20000000-0000-0000-0000-00000000000b';
select t.reset();
select t.ok((select title from tasks where id='20000000-0000-0000-0000-00000000000b')='Write report', 'foreign UPDATE affects no rows');
select t.as_user('c0000000-0000-0000-0000-000000000003');
delete from tasks where id='20000000-0000-0000-0000-00000000000b';
select t.reset();
select t.ok((select count(*) from tasks where id='20000000-0000-0000-0000-00000000000b')=1, 'foreign DELETE affects no rows');

-- Privilege escalation / forgery attempts -------------------------------------------------
select t.as_user('c0000000-0000-0000-0000-000000000003');
select t.denied($$update user_roles set role='admin' where user_id=auth.uid()$$, 'cannot self-promote');
select t.denied($$insert into user_roles (user_id, role) values (auth.uid(),'admin')$$, 'cannot insert role');
select t.denied($$delete from user_roles$$, 'cannot delete roles');
select t.denied($$update profiles set email='x@y.z' where id=auth.uid()$$, 'cannot edit profile email');
select t.denied($$update profiles set id=gen_random_uuid() where id=auth.uid()$$, 'cannot edit profile id');
select t.denied($$insert into admin_user_access (admin_id, user_id) values (auth.uid(),'b0000000-0000-0000-0000-000000000002')$$, 'cannot grant self admin access');
select t.denied($$insert into task_events (user_id, task_id, event_type) values (auth.uid(),'20000000-0000-0000-0000-00000000000c','status_changed')$$, 'cannot forge task events');
select t.denied($$update task_events set to_status='done'$$, 'cannot edit task events');
select t.denied($$delete from task_events$$, 'cannot delete task events');
select t.denied($$insert into role_audit_log (user_id, new_role) values (auth.uid(),'admin')$$, 'cannot forge role audit log');
select t.denied($$update tasks set user_id='b0000000-0000-0000-0000-000000000002' where id='20000000-0000-0000-0000-00000000000c'$$, 'cannot re-parent task to another user');
select t.denied($$update user_settings set timezone='Mars/Base' where user_id=auth.uid()$$, 'invalid timezone rejected');
select t.reset();

-- Anonymous --------------------------------------------------------------------------------
select t.as_anon();
select t.denied($$select * from tasks$$, 'anon cannot read tasks');
select t.denied($$select * from user_roles$$, 'anon cannot read roles');
select t.denied($$select * from private.admin_bootstrap_emails$$, 'anon cannot reach private schema');
select t.reset();
select t.as_user('c0000000-0000-0000-0000-000000000003');
select t.denied($$select * from private.admin_bootstrap_emails$$, 'authenticated cannot read bootstrap emails');
select t.reset();

-- Admin: read-only access to authorised users ------------------------------------------------
select t.as_user('a0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from tasks where user_id='b0000000-0000-0000-0000-000000000002')=1, 'admin reads normal user tasks');
select t.ok((select count(*) from task_occurrences where user_id='b0000000-0000-0000-0000-000000000002')=1, 'admin reads occurrences');
select t.ok((select count(*) from time_sessions where user_id='b0000000-0000-0000-0000-000000000002')=1, 'admin reads time sessions');
select t.ok((select count(*) from task_events where user_id='b0000000-0000-0000-0000-000000000002')>=2, 'admin reads task events');
select t.ok((select count(*) from profiles)=4, 'admin reads profiles');
select t.ok((select count(*) from role_audit_log)>=4, 'admin reads role audit log');
select t.denied($$insert into tasks (user_id, title) values ('b0000000-0000-0000-0000-000000000002','admin-made')$$, 'admin cannot insert for another user');
update tasks set title='admin edit' where user_id='b0000000-0000-0000-0000-000000000002';
delete from tasks where user_id='b0000000-0000-0000-0000-000000000002';
delete from time_sessions where user_id='b0000000-0000-0000-0000-000000000002';
select t.reset();
select t.ok((select title from tasks where id='20000000-0000-0000-0000-00000000000b')='Write report', 'admin cannot update normal user task');
select t.ok((select count(*) from tasks where id='20000000-0000-0000-0000-00000000000b')=1, 'admin cannot delete normal user task');
select t.ok((select count(*) from time_sessions where user_id='b0000000-0000-0000-0000-000000000002')=1, 'admin cannot delete time sessions');
-- Revoking a grant, or demoting the admin, removes visibility.
delete from admin_user_access where admin_id='a0000000-0000-0000-0000-000000000001' and user_id='b0000000-0000-0000-0000-000000000002';
select t.as_user('a0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from tasks where user_id='b0000000-0000-0000-0000-000000000002')=0, 'revoked grant hides user data from admin');
select t.reset();
insert into admin_user_access values ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002');
update user_roles set role='user' where user_id='a0000000-0000-0000-0000-000000000001';
select t.as_user('a0000000-0000-0000-0000-000000000001');
select t.ok((select count(*) from tasks where user_id='b0000000-0000-0000-0000-000000000002')=0, 'demoted admin loses access even with a grant row');
select t.reset();
update user_roles set role='admin' where user_id='a0000000-0000-0000-0000-000000000001';

-- Normal user cannot read the admin's private data --------------------------------------------
select t.as_user('a0000000-0000-0000-0000-000000000001');
insert into tasks (id, title) values ('20000000-0000-0000-0000-00000000000a','Admin private');
select t.reset();
select t.as_user('b0000000-0000-0000-0000-000000000002');
select t.ok((select count(*) from tasks where id='20000000-0000-0000-0000-00000000000a')=0, 'normal user cannot read admin tasks');
select t.ok((select count(*) from tasks)=1, 'normal user sees only own tasks');

-- Domain behaviour: occurrences, events, time ----------------------------------------------------
update task_occurrences set status='done' where id='30000000-0000-0000-0000-00000000000b';
select t.ok((select completed_at is not null from task_occurrences where id='30000000-0000-0000-0000-00000000000b'), 'completed_at set on done');
update task_occurrences set status='pending' where id='30000000-0000-0000-0000-00000000000b';
select t.ok((select completed_at is null from task_occurrences where id='30000000-0000-0000-0000-00000000000b'), 'completed_at cleared on reopen');
update task_occurrences set completed_at=now() where id='30000000-0000-0000-0000-00000000000b';
select t.ok((select completed_at is null from task_occurrences where id='30000000-0000-0000-0000-00000000000b'), 'client cannot set completed_at directly');
update task_occurrences set scheduled_date='2026-10-20' where id='30000000-0000-0000-0000-00000000000b';
update task_occurrences set scheduled_date='2026-10-22' where id='30000000-0000-0000-0000-00000000000b';
select t.ok((select original_date from task_occurrences where id='30000000-0000-0000-0000-00000000000b')='2026-10-18', 'original_date preserved');
select t.ok((select count(*) from task_events where occurrence_id='30000000-0000-0000-0000-00000000000b' and event_type='rescheduled')=2, 'each reschedule recorded');
select t.ok((select to_date from task_events where event_type='rescheduled' order by created_at desc, id limit 1) in ('2026-10-20','2026-10-22'), 'reschedule events keep dates');
select t.denied($$update task_occurrences set original_date='2026-11-01' where id='30000000-0000-0000-0000-00000000000b'$$, 'original_date immutable');
-- Carry-forward keeps the old day intact.
update task_occurrences set status='incomplete' where id='30000000-0000-0000-0000-00000000000b';
insert into task_occurrences (id, task_id, original_date, scheduled_date, carried_from_occurrence_id)
  values ('30000000-0000-0000-0000-0000000000b2','20000000-0000-0000-0000-00000000000b','2026-10-22','2026-10-23','30000000-0000-0000-0000-00000000000b');
select t.ok((select status from task_occurrences where id='30000000-0000-0000-0000-00000000000b')='incomplete', 'carried-from occurrence stays incomplete');
-- Recurring occurrences are independent and idempotent.
insert into task_occurrences (task_id, original_date, scheduled_date) values ('20000000-0000-0000-0000-00000000000b','2026-10-25','2026-10-25');
select t.denied($$insert into task_occurrences (task_id, original_date, scheduled_date) values ('20000000-0000-0000-0000-00000000000b','2026-10-25','2026-10-25')$$, 'duplicate recurrence instance rejected');
update tasks set priority='high' where id='20000000-0000-0000-0000-00000000000b';
select t.ok((select count(*) from task_events where task_id='20000000-0000-0000-0000-00000000000b' and event_type='priority_changed' and from_priority='low' and to_priority='high')=1, 'priority change recorded');
-- Time tracking: overlap and single running timer.
select t.denied($$insert into time_sessions (task_id, started_at, ended_at) values ('20000000-0000-0000-0000-00000000000b','2026-10-18 09:30+00','2026-10-18 09:45+00')$$, 'overlapping session rejected');
insert into time_sessions (task_id, started_at) values ('20000000-0000-0000-0000-00000000000b','2026-10-18 11:00+00');
select t.denied($$insert into time_sessions (task_id, started_at) values ('20000000-0000-0000-0000-00000000000b','2026-10-18 12:00+00')$$, 'second running timer rejected');
select t.denied($$insert into time_sessions (task_id, started_at, ended_at) values ('20000000-0000-0000-0000-00000000000b','2026-10-19 10:00+00','2026-10-19 09:00+00')$$, 'end before start rejected');
-- Deleting a task cascades; deleting a category only detaches.
delete from categories where id='10000000-0000-0000-0000-00000000000b';
select t.ok((select category_id is null from tasks where id='20000000-0000-0000-0000-00000000000b'), 'category delete detaches tasks');
delete from tasks where id='20000000-0000-0000-0000-00000000000b';
select t.reset();
select t.ok((select count(*) from task_occurrences where task_id='20000000-0000-0000-0000-00000000000b')=0
  and (select count(*) from time_sessions where task_id='20000000-0000-0000-0000-00000000000b')=0
  and (select count(*) from task_events where task_id='20000000-0000-0000-0000-00000000000b')=0, 'task delete cascades to occurrences, sessions, events');

-- Legit confirmation of the unconfirmed bootstrap address promotes it (owner of mailbox).
update auth.users set email_confirmed_at=now() where id='d0000000-0000-0000-0000-000000000004';
select t.ok((select role from user_roles where user_id='d0000000-0000-0000-0000-000000000004')='admin', 'confirmation of bootstrap email promotes ');
\echo ALL RLS TESTS PASSED

-- reconcile_roles ----------------------------------------------------------------------------
select t.as_user('c0000000-0000-0000-0000-000000000003');
select t.denied($$select * from private.reconcile_roles()$$, 'authenticated cannot run reconcile_roles');
select t.reset();
select t.ok((select count(*) from private.reconcile_roles() where email='mustakimkhan1111176@gmail.com' and role='admin' and note='ok')>=1, 'reconcile reports admin ok');
\echo RECONCILE TESTS PASSED
rollback;
