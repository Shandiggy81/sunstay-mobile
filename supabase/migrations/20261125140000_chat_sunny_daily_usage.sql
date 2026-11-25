-- ============================================================
-- Migration: daily cap on chat-sunny's Gemini asks
-- Created:   2026-11-25
-- ============================================================

-- chat-sunny takes one slot from the day's count before it calls Gemini and
-- answers 429 daily_cap once the cap is used up (500 a day, approved by
-- Shannon on 2026-11-25; supabase/functions/chat-sunny/dailyCap.js). The day
-- is the Melbourne date chat-sunny passes in, so the count resets at local
-- midnight. One row per day.
--
-- Additive only: one new table and one new function; nothing existing
-- changes. This project's default privileges grant new public tables and
-- functions to anon and authenticated by name, so both are revoked here.
-- RLS is on with no policies. Only service_role, which chat-sunny uses for
-- this call, can execute the function, so nobody can read or change the
-- count with the anon key.
--
-- Merging this to main lets the Supabase GitHub integration apply it to
-- production. Until it exists, chat-sunny's check fails open and logs
-- "chat-sunny daily cap check skipped http_404".
begin;

create table public.chat_sunny_daily_usage (
  day date primary key,
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now()
);

alter table public.chat_sunny_daily_usage enable row level security;

revoke all on table public.chat_sunny_daily_usage from public, anon, authenticated;

comment on table public.chat_sunny_daily_usage is
  'Gemini asks chat-sunny made per Melbourne day, for its daily cap. Written only by chat_sunny_take_daily_slot.';

create function public.chat_sunny_take_daily_slot(p_day date, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  taken integer;
begin
  if p_day is null or p_cap is null or p_cap < 1 or p_cap > 100000 then
    raise exception 'invalid day or cap';
  end if;
  -- One statement, so asks arriving together can't push the count past the cap.
  insert into public.chat_sunny_daily_usage as u (day, requests, updated_at)
  values (p_day, 1, statement_timestamp())
  on conflict (day) do update
    set requests = u.requests + 1, updated_at = statement_timestamp()
    where u.requests < p_cap
  returning u.requests into taken;
  return taken is not null;
end;
$$;

revoke all on function public.chat_sunny_take_daily_slot(date, integer)
  from public, anon, authenticated;
grant execute on function public.chat_sunny_take_daily_slot(date, integer)
  to service_role;

comment on function public.chat_sunny_take_daily_slot(date, integer) is
  'Service-role only. Adds one ask to the day''s count while it is under p_cap; returns true if the ask may call Gemini.';

commit;
