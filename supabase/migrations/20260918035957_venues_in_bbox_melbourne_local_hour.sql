-- ============================================================
-- Migration: venues_in_bbox Melbourne-local hour (AEST/AEDT)
-- Created:   2026-09-18
--
-- Mirrors production `venues_in_bbox` on project fksuqgvsazoxarocmaii.
--
-- sun_hour_fraction is indexed by Australia/Melbourne wall-clock hour
-- (slot 1 = 00:00 Melbourne), not UTC. Default p_hour / p_month use
-- `now() at time zone 'Australia/Melbourne'` so midday Melbourne reads
-- the noon slot (~0.9 clear-sky) instead of the UTC night slot.
--
-- Return shape is unchanged: id, name, slug, category, lng, lat,
-- sun_score_annual, sun_now, wind_shelter_score, effective_wind,
-- effective_sun, comfort_hint, canyon_aspect_hw, geometry_confidence,
-- weather_computed_at, sun_hour_fraction.
--
-- Venues still use lat/lng doubles and text id — no geography `location`
-- column is invented here.
-- ============================================================

drop function if exists public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
);

create function public.venues_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  p_limit int default 500,
  p_hour smallint default null,
  p_month smallint default null
)
returns table (
  id text,
  name text,
  slug text,
  category text,
  lng double precision,
  lat double precision,
  sun_score_annual real,
  sun_now real,
  wind_shelter_score real,
  effective_wind real,
  effective_sun real,
  comfort_hint text,
  canyon_aspect_hw real,
  geometry_confidence real,
  weather_computed_at timestamptz,
  -- 24 slots indexed by Australia/Melbourne wall-clock hour, slot 1 = 00:00.
  sun_hour_fraction real[]
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with params as (
    select
      coalesce(
        p_hour,
        extract(hour from now() at time zone 'Australia/Melbourne')::smallint
      ) as hour_local,
      coalesce(
        p_month,
        extract(month from now() at time zone 'Australia/Melbourne')::smallint
      ) as month_local,
      least(greatest(coalesce(p_limit, 500), 1), 2000) as lim
  )
  select
    v.id,
    v."venueName" as name,
    -- venues has no slug column; held in the result shape so callers coded
    -- against this RPC keep a stable set of keys.
    null::text as slug,
    v."typeCategory" as category,
    v.lng,
    v.lat,
    m.sun_score_annual,
    coalesce(
      m.effective_sun,
      case
        when m.sun_hour_fraction is not null
          then m.sun_hour_fraction[(select hour_local from params) + 1]
        else null
      end
    ) as sun_now,
    m.wind_shelter_score,
    m.effective_wind,
    m.effective_sun,
    m.comfort_hint,
    m.canyon_aspect_hw,
    m.geometry_confidence,
    m.weather_computed_at,
    m.sun_hour_fraction
  from public.venues v
  left join public.microclimate_profiles m on m.venue_id = v.id
  -- No is_published column exists on venues; every row is live today, so
  -- there is nothing to filter on here.
  where v.lat between min_lat and max_lat
    and v.lng between min_lng and max_lng
  order by v.id
  limit (select lim from params);
$$;

comment on function public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
) is 'Venues inside a lat/lng bounding box with their current microclimate readings. sun_now is resolved for p_hour (default: the current Australia/Melbourne hour); sun_hour_fraction returns the whole 24-slot Melbourne-local curve so clients can scrub time without refetching. p_month defaults to the current Melbourne month for call-site compatibility.';

grant execute on function public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
) to anon, authenticated, service_role;
