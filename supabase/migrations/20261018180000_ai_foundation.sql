-- AI assistant support: working hours, usage metering / rate limiting, and a small response cache.
-- No prompts or task text are ever stored in ai_usage. ai_cache holds only the model's validated
-- output for the owner (never readable by other users, including administrators).

alter table public.user_settings
  add column work_start time not null default '09:00',
  add column work_end time not null default '18:00',
  add constraint user_settings_work_hours check (work_end > work_start);
grant update (work_start, work_end) on public.user_settings to authenticated;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feature text not null check (char_length(feature) between 1 and 40),
  status text not null default 'started' check (status in ('started', 'ok', 'error')),
  model text,
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  estimated_cost_usd numeric(10, 6),
  error_code text check (error_code is null or char_length(error_code) <= 40),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy ai_usage_select_own on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Atomically checks the per-user hourly/daily limits and reserves a call. Writes go through these
-- functions only, so a client cannot reset or forge its own counters.
create function public.ai_reserve_call(p_feature text, p_hour_limit integer, p_day_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hour integer; v_day integer; v_oldest timestamptz; v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_hour_limit < 1 or p_day_limit < 1 then raise exception 'invalid limits' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai:' || v_uid::text, 0));

  select count(*) into v_hour from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_hour >= p_hour_limit then
    select min(created_at) into v_oldest from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 hour';
    return jsonb_build_object('allowed', false, 'scope', 'hour',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int));
  end if;
  select count(*) into v_day from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
  if v_day >= p_day_limit then
    select min(created_at) into v_oldest from public.ai_usage where user_id = v_uid and created_at > now() - interval '1 day';
    return jsonb_build_object('allowed', false, 'scope', 'day',
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int));
  end if;

  insert into public.ai_usage (user_id, feature) values (v_uid, left(p_feature, 40)) returning id into v_id;
  return jsonb_build_object('allowed', true, 'id', v_id);
end $$;

create function public.ai_complete_call(
  p_id uuid, p_status text, p_model text, p_input integer, p_output integer, p_cache_read integer, p_cost numeric, p_error text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('ok', 'error') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.ai_usage
  set status = p_status, model = left(p_model, 100), input_tokens = p_input, output_tokens = p_output,
      cache_read_tokens = p_cache_read, estimated_cost_usd = p_cost, error_code = left(p_error, 40), completed_at = now()
  where id = p_id and user_id = auth.uid() and status = 'started';
end $$;

revoke all on function public.ai_reserve_call(text, integer, integer) from public, anon;
revoke all on function public.ai_complete_call(uuid, text, text, integer, integer, integer, numeric, text) from public, anon;
grant execute on function public.ai_reserve_call(text, integer, integer) to authenticated;
grant execute on function public.ai_complete_call(uuid, text, text, integer, integer, integer, numeric, text) to authenticated;

create table public.ai_cache (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  key_hash text not null check (char_length(key_hash) = 64),
  feature text not null check (char_length(feature) <= 40),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, key_hash)
);
create index ai_cache_expires_idx on public.ai_cache (expires_at);
alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from public, anon, authenticated;
grant select, insert, update, delete on public.ai_cache to authenticated;
create policy ai_cache_select_own on public.ai_cache for select to authenticated using (user_id = (select auth.uid()));
create policy ai_cache_insert_own on public.ai_cache for insert to authenticated with check (user_id = (select auth.uid()));
create policy ai_cache_update_own on public.ai_cache for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ai_cache_delete_own on public.ai_cache for delete to authenticated using (user_id = (select auth.uid()));
