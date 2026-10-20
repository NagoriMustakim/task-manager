-- =====================================================================================
-- STEP B  (DESTRUCTIVE: frees database space by deleting features you no longer use)
-- Run ONLY after:  1) you ran STEP A,  2) the app shows your tasks correctly.
-- It permanently deletes: old tasks/occurrences, timers, event history, goals, milestones,
-- categories, reminders, AI usage/cache, settings and access-grant tables.
-- Kept: profiles, user_roles, role_audit_log, todos.
-- =====================================================================================
begin;

-- Safety stop: refuse to continue if the new table is empty but the old one has data.
do $$
begin
  if to_regclass('public.task_occurrences') is not null
     and not exists (select 1 from public.todos)
     and exists (select 1 from public.task_occurrences) then
    raise exception 'public.todos is empty but old tasks exist. Run STEP A first.';
  end if;
end $$;

-- Old functions (all overloads).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'create_task_with_occurrence', 'reschedule_occurrences', 'undo_reschedule', 'materialize_task_occurrences',
      'stop_recurrence', 'update_recurrence', 'start_timer', 'stop_timer', 'add_time_entry', 'update_time_entry',
      'ai_reserve_call', 'ai_complete_call')
  loop
    execute 'drop function if exists ' || r.sig::text || ' cascade';
  end loop;
end $$;

-- Old tables (children first; CASCADE removes their triggers, policies and indexes).
drop table if exists public.notifications cascade;
drop table if exists public.ai_cache cascade;
drop table if exists public.ai_usage cascade;
drop table if exists public.time_sessions cascade;
drop table if exists public.task_events cascade;
drop table if exists public.milestones cascade;
drop table if exists public.task_occurrences cascade;
drop table if exists public.tasks cascade;
drop table if exists public.goals cascade;
drop table if exists public.categories cascade;
drop table if exists public.admin_user_access cascade;
drop table if exists public.user_settings cascade;

-- Old trigger helper functions and types.
drop function if exists private.occurrence_before_write() cascade;
drop function if exists private.log_occurrence_changes() cascade;
drop function if exists private.log_task_changes() cascade;
drop function if exists private.validate_timezone() cascade;
drop type if exists public.task_event_type;
drop type if exists public.goal_status;
drop type if exists public.time_session_source;

commit;

-- Optional: see how much space your tables use now.
select relname as table, pg_size_pretty(pg_total_relation_size(c.oid)) as size
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc;
