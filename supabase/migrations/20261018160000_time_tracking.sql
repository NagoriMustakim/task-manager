-- Task-level time tracking: server-authoritative timer RPCs, duration column, locked-down writes.
--
-- Policy: ONE running timer per user (already enforced by time_sessions_no_overlap, which also
-- forbids overlapping sessions). Starting a timer on another task stops the current one at the same
-- instant ("switch"). All timestamps are taken from the database clock, never from the browser,
-- except for explicit manual entries / corrections which are validated here.

alter table public.time_sessions
  add column duration_seconds integer generated always as (
    case when ended_at is null then null else floor(extract(epoch from (ended_at - started_at)))::integer end
  ) stored,
  add column edited_at timestamptz,
  add constraint time_sessions_max_24h check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  add constraint time_sessions_note_len check (note is null or char_length(note) <= 500);

-- Clients may read and delete their own sessions (RLS) but all creation/edits go through the
-- validated functions below, so a client can neither forge a timer nor write another user's rows.
revoke insert, update on public.time_sessions from authenticated;

create function private.time_session_json(s public.time_sessions) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'task_id', s.task_id, 'occurrence_id', s.occurrence_id,
    'started_at', s.started_at, 'ended_at', s.ended_at, 'duration_seconds', s.duration_seconds,
    'note', s.note, 'source', s.source, 'edited_at', s.edited_at);
$$;

create function public.start_timer(p_occurrence_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  o record; r public.time_sessions; v_stopped public.time_sessions; v_new public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0)); -- serialise double-clicks / races

  select oc.id, oc.task_id, oc.moved_to_occurrence_id into o
  from public.task_occurrences oc join public.tasks t on t.id = oc.task_id and t.user_id = oc.user_id
  where oc.id = p_occurrence_id and oc.user_id = v_uid and t.archived_at is null;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;
  if o.moved_to_occurrence_id is not null then
    raise exception 'this entry was rescheduled; track time on the new entry' using errcode = '22023';
  end if;

  select * into r from public.time_sessions where user_id = v_uid and ended_at is null for update;
  if found then
    if r.occurrence_id = p_occurrence_id then  -- duplicate request: already running here
      return jsonb_build_object('started', private.time_session_json(r), 'stopped', null, 'server_now', now());
    end if;
    update public.time_sessions
      set ended_at = greatest(now(), started_at + interval '1 microsecond')
      where id = r.id returning * into v_stopped;
  end if;

  insert into public.time_sessions (user_id, task_id, occurrence_id, started_at, source)
  values (v_uid, o.task_id, o.id, now(), 'timer') returning * into v_new;

  return jsonb_build_object(
    'started', private.time_session_json(v_new),
    'stopped', case when v_stopped.id is null then null else private.time_session_json(v_stopped) end,
    'server_now', now());
end $$;

-- Stops the running timer. p_ended_at lets the user correct a forgotten timer (must lie between
-- the start and now). Idempotent: stopping an already-stopped session returns it unchanged.
create function public.stop_timer(p_session_id uuid default null, p_ended_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.time_sessions; v_end timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0));

  select * into r from public.time_sessions
  where user_id = v_uid and ended_at is null and (p_session_id is null or id = p_session_id) for update;
  if not found then
    if p_session_id is not null then
      select * into r from public.time_sessions where id = p_session_id and user_id = v_uid;
      if found then return jsonb_build_object('stopped', private.time_session_json(r), 'server_now', now()); end if;
    end if;
    raise exception 'no running timer' using errcode = 'P0002';
  end if;

  v_end := coalesce(p_ended_at, greatest(now(), r.started_at + interval '1 microsecond'));
  if v_end <= r.started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if v_end > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if v_end - r.started_at > interval '24 hours' then
    raise exception 'timer ran over 24 hours: choose the real end time' using errcode = '22023';
  end if;

  update public.time_sessions set ended_at = v_end, edited_at = case when p_ended_at is null then edited_at else now() end
  where id = r.id returning * into r;
  return jsonb_build_object('stopped', private.time_session_json(r), 'server_now', now());
end $$;

create function public.add_time_entry(p_occurrence_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); o record; s public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_ended_at <= p_started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if p_ended_at > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at - p_started_at > interval '24 hours' then raise exception 'an entry can be at most 24 hours' using errcode = '22023'; end if;
  if p_started_at < now() - interval '1 year' then raise exception 'entry is too far in the past' using errcode = '22023'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;

  select oc.id, oc.task_id into o
  from public.task_occurrences oc join public.tasks t on t.id = oc.task_id and t.user_id = oc.user_id
  where oc.id = p_occurrence_id and oc.user_id = v_uid and t.archived_at is null;
  if not found then raise exception 'task not found' using errcode = 'P0002'; end if;

  insert into public.time_sessions (user_id, task_id, occurrence_id, started_at, ended_at, source, note)
  values (v_uid, o.task_id, o.id, p_started_at, p_ended_at, 'manual', nullif(btrim(p_note), ''))
  returning * into s;
  return private.time_session_json(s);
end $$;

-- Correct an entry. For a running session only the start and note can change unless p_ended_at closes it.
create function public.update_time_entry(p_id uuid, p_started_at timestamptz, p_ended_at timestamptz, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); r public.time_sessions; s public.time_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('timer:' || v_uid::text, 0));
  select * into r from public.time_sessions where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if p_started_at > now() + interval '1 minute' then raise exception 'start cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at is not null and p_ended_at > now() + interval '1 minute' then raise exception 'end cannot be in the future' using errcode = '22023'; end if;
  if p_ended_at is not null and p_ended_at <= p_started_at then raise exception 'end must be after start' using errcode = '22023'; end if;
  if p_ended_at is null and r.ended_at is not null then raise exception 'a finished entry needs an end time' using errcode = '22023'; end if;
  if p_note is not null and char_length(p_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;

  update public.time_sessions
  set started_at = p_started_at, ended_at = p_ended_at, note = nullif(btrim(p_note), ''), edited_at = now()
  where id = r.id returning * into s;
  return private.time_session_json(s);
end $$;

revoke all on function private.time_session_json(public.time_sessions) from public, anon, authenticated;
revoke all on function public.start_timer(uuid) from public, anon;
revoke all on function public.stop_timer(uuid, timestamptz) from public, anon;
revoke all on function public.add_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.update_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.start_timer(uuid) to authenticated;
grant execute on function public.stop_timer(uuid, timestamptz) to authenticated;
grant execute on function public.add_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.update_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
