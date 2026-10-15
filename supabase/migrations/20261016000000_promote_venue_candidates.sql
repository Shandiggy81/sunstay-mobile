-- ============================================================
-- Promote reviewed City of Melbourne (CLUE) candidates into public.venues.
--
-- Adds three public, non-sensitive columns so imported venues carry their
-- source (CC BY 4.0 attribution) and outdoor seat count, and a service-role
-- function that copies placed candidates into public.venues and seeds their
-- microclimate profile with the same seed_venue_morphology() every other
-- venue uses (real building horizon from the footpath pin, eye height from
-- the seating floor).
--
-- This migration changes no data. Run after approval, as the service role:
--   select public.promote_venue_candidates(null, 150);   -- next 150 placed with no pin check (~0.5 s each)
--   select public.promote_venue_candidates(array['clue-2024-...']);  -- chosen ids
-- Rehearsed 16 Oct 2026 against production in a rolled-back transaction:
-- 4 venues promoted with labels, suburbs, eye height and full sun profiles.
-- Undo (removes only imported venues):
--   delete from public.microclimate_profiles where venue_id in (select id from public.venues where data_source = 'clue');
--   delete from public.venues where data_source = 'clue';
--   update public.venue_import_candidates set status = 'placed' where status = 'promoted';
-- ============================================================

alter table public.venues
  add column if not exists data_source   text,
  add column if not exists source_ref    text,
  add column if not exists outdoor_seats int;

comment on column public.venues.data_source is
  'Where the listing came from: null = curated by SunStay, ''clue'' = City of Melbourne CLUE (CC BY 4.0).';
comment on column public.venues.source_ref is 'The source''s own record reference (CLUE: census year and property id).';
comment on column public.venues.outdoor_seats is 'Outdoor seats recorded by the source, when known.';

create or replace function public.promote_venue_candidates(p_ids text[] default null, p_limit int default null)
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  c record;
  n int := 0;
  v_label text;
  v_emoji text;
  v_suburb text;
begin
  for c in
    select * from public.venue_import_candidates
    where status in ('placed', 'approved')
      and placed_lat is not null and placed_lng is not null
      and (case when p_ids is null then status = 'approved' or not coalesce(needs_pin_check, true)
                else id = any(p_ids) end)
    order by id
    limit p_limit
  loop
    -- Food and drink venues use typeCategory 'Bar' like the curated ones; the
    -- label and emoji pick the map icon (utils/clayVenuePins.js).
    if c.kind = 'bar' then
      v_label := 'Pub & bar'; v_emoji := '🍺';
    elsif c.kind = 'stay' then
      v_label := 'Hotel dining'; v_emoji := '🏨';
    elsif c.kind = 'bakery' or c.name ~* '(bakery|bakehouse|patisserie|boulangerie|donut|doughnut)' then
      v_label := 'Bakery cafe'; v_emoji := '🥐';
    elsif c.kind = 'takeaway' then
      v_label := case when c.name ~* '(caf[eé]|coffee|espresso|roaster|juice)' then 'Cafe' else 'Takeaway' end;
      v_emoji := case when v_label = 'Cafe' then '☕' else '🥡' end;
    elsif c.name ~* '(caf[eé]|coffee|espresso|roaster|brew|tea house|teahouse)' then
      v_label := 'Cafe'; v_emoji := '☕';
    else
      v_label := 'Restaurant'; v_emoji := '🍽️';
    end if;

    v_suburb := case
      when c.area = 'Melbourne (CBD)' then 'CBD'
      when c.area = 'Melbourne (Remainder)' then 'Melbourne'
      when c.area like 'West Melbourne%' then 'West Melbourne'
      else c.area end;

    insert into public.venues (
      id, "venueName", address, suburb, lat, lng, emoji, vibe, "typeCategory", "typeLabel", tags,
      base_elevation_meters, data_source, source_ref, outdoor_seats, notes
    ) values (
      c.id, c.name, regexp_replace(initcap(lower(c.address)), '\mVic\M', 'VIC'), v_suburb, c.placed_lat, c.placed_lng, v_emoji, v_label, 'Bar', v_label,
      case when c.outdoor_seats >= 20 then '["Outdoor Seating", "Large Groups"]'::jsonb else '["Outdoor Seating"]'::jsonb end,
      case when c.rooftop then greatest(c.observer_height_m - 1.5, 0) else greatest(c.floor_level, 0) * 3.5 end,
      'clue', 'CLUE ' || c.census_year || ' property ' || coalesce(c.property_id, '?'), c.outdoor_seats,
      'Listed from City of Melbourne CLUE ' || c.census_year || ' outdoor-seating data (CC BY 4.0). Not yet verified by SunStay.'
    )
    on conflict (id) do nothing;

    if found then
      perform public.seed_venue_morphology(c.id);
      update public.venue_import_candidates set status = 'promoted' where id = c.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

revoke all on function public.promote_venue_candidates(text[], int) from public, anon, authenticated;
grant execute on function public.promote_venue_candidates(text[], int) to service_role;

comment on function public.promote_venue_candidates(text[], int) is
  'Service role only. Copies placed import candidates into public.venues (no ids: approved ones and those without a pin check; p_limit caps a batch) and seeds their microclimate profile. Returns the number promoted.';
