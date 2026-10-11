-- ============================================================
-- Migration: return the hourly sun curve from venues_in_bbox
-- Created:   2026-09-17
--
-- The map's time-of-day slider scrubs 06:00-20:00 in 5-minute steps. Deriving
-- sun_now server-side means one round trip per hour crossed while dragging,
-- so the reading lags the thumb. Returning the whole 24-slot curve lets the
-- client index it locally: one fetch per viewport, zero network while
-- scrubbing.
--
-- It also fixes a semantic problem. sun_now is
-- coalesce(effective_sun, sun_hour_fraction[hour]), and effective_sun is a
-- reading for *now* that ignores p_hour. Once the weather refresh starts
-- populating it, sun_now would freeze at the live value and stop responding
-- to the slider entirely. With both columns exposed the client can prefer
-- effective_sun at the current hour and fall back to the curve elsewhere.
--
-- Additive: sun_hour_fraction is appended after the existing columns, so
-- callers reading the current keys are unaffected. sun_now is unchanged.
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
  -- 24 slots indexed by UTC hour, slot 1 = 00:00 UTC.
  sun_hour_fraction real[]
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with params as (
    select
      coalesce(p_hour, extract(hour from now() at time zone 'UTC')::smallint) as hour_utc,
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
          then m.sun_hour_fraction[(select hour_utc from params) + 1]
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
) is 'Venues inside a lat/lng bounding box with their current microclimate readings. sun_now is resolved for p_hour (default: the current UTC hour); sun_hour_fraction returns the whole 24-slot UTC-indexed curve so clients can scrub time without refetching. p_month is accepted for call-site compatibility but is not yet used.';

grant execute on function public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
) to anon, authenticated, service_role;
