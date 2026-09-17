-- ============================================================
-- Migration: venues_in_bbox + microclimate profiles
-- Created:   2026-09-17
-- Objective: Add outdoor-point and microclimate storage plus a bounding-box
--            RPC for map queries.
--
-- Retargeted at the EXISTING public.venues table, which is left untouched:
--   * venues.id stays TEXT (values like 'dv-stay-03'), so every venue_id
--     foreign key here is TEXT rather than uuid.
--   * Venue coordinates stay in the raw lat / lng double columns, so
--     venues_in_bbox filters on those instead of a PostGIS geography column.
-- Current clients keep reading venues exactly as they do today.
-- ============================================================

-- PostGIS is required only by venue_outdoor_points.location below; the
-- venues table and the bbox RPC deliberately do not depend on it.
create extension if not exists postgis with schema extensions;

-- ------------------------------------------------------------
-- 1. Outdoor measurement points (one venue has many)
-- ------------------------------------------------------------
create table if not exists public.venue_outdoor_points (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null references public.venues(id) on delete cascade,
  location extensions.geography(point, 4326) not null,
  height_agl_m real not null default 1.5,
  label text not null default 'terrace'
    check (label in ('terrace', 'balcony', 'courtyard', 'rooftop', 'garden')),
  is_primary boolean not null default false
);

create unique index if not exists venue_outdoor_points_one_primary
  on public.venue_outdoor_points (venue_id)
  where is_primary;

create index if not exists venue_outdoor_points_location_gix
  on public.venue_outdoor_points using gist (location);

create index if not exists venue_outdoor_points_venue_id_idx
  on public.venue_outdoor_points (venue_id);

-- ------------------------------------------------------------
-- 2. Per-venue microclimate profile (one row per venue)
-- ------------------------------------------------------------
create table if not exists public.microclimate_profiles (
  venue_id text primary key references public.venues(id) on delete cascade,
  sun_score_annual real,
  sun_score_monthly real[12],
  sun_hour_fraction real[24],
  canyon_aspect_hw real,
  wind_exposure_by_sector real[8],
  sky_view_proxy real,
  geometry_confidence real,
  source_sun text not null default 'horizon_precompute_v1',
  source_wind text not null default 'morphology_hw_v1',
  geometry_computed_at timestamptz,
  wind_speed_10m real,
  wind_direction_deg real,
  cloud_cover_pct real,
  effective_sun real,
  effective_wind real,
  wind_shelter_score real,
  comfort_hint text,
  weather_computed_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists microclimate_profiles_expires_idx
  on public.microclimate_profiles (expires_at);

-- ------------------------------------------------------------
-- 3. Row Level Security
--    Both tables are new and sit in the API-exposed public schema, so they
--    need policies or the anon key could read and write them freely.
--    Read is public, matching the venues convention; all writes go through
--    service_role, which bypasses RLS.
-- ------------------------------------------------------------
alter table public.venue_outdoor_points enable row level security;
alter table public.microclimate_profiles enable row level security;

drop policy if exists "Allow public read access on venue_outdoor_points"
  on public.venue_outdoor_points;
create policy "Allow public read access on venue_outdoor_points"
  on public.venue_outdoor_points for select using (true);

drop policy if exists "Allow public read access on microclimate_profiles"
  on public.microclimate_profiles;
create policy "Allow public read access on microclimate_profiles"
  on public.microclimate_profiles for select using (true);

-- ------------------------------------------------------------
-- 4. Bounding-box lookup for the map
--    Point-in-rectangle over the existing (lat, lng) columns, which are
--    already covered by idx_venues_lat_lng.
-- ------------------------------------------------------------
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
  weather_computed_at timestamptz
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
    m.weather_computed_at
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
) is 'Venues inside a lat/lng bounding box with their current microclimate readings. p_month is accepted for call-site compatibility but is not yet used.';

grant execute on function public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Weather refresh upsert (service_role only)
-- ------------------------------------------------------------
drop function if exists public.apply_microclimate_weather(
  uuid, real, real, real, real, real, real, text, int
);

create or replace function public.apply_microclimate_weather(
  p_venue_id text,
  p_wind_speed_10m real,
  p_wind_direction_deg real,
  p_cloud_cover_pct real,
  p_effective_sun real,
  p_effective_wind real,
  p_wind_shelter_score real,
  p_comfort_hint text,
  p_ttl_minutes int default 30
)
returns void
language sql
security definer
-- pg_temp is pinned last so a caller cannot shadow the target table with a
-- temp table of the same name, which would otherwise redirect this
-- definer-rights write.
set search_path = public, pg_temp
as $$
  insert into public.microclimate_profiles as m (
    venue_id, wind_speed_10m, wind_direction_deg, cloud_cover_pct,
    effective_sun, effective_wind, wind_shelter_score, comfort_hint,
    weather_computed_at, expires_at, updated_at
  ) values (
    p_venue_id, p_wind_speed_10m, p_wind_direction_deg, p_cloud_cover_pct,
    p_effective_sun, p_effective_wind, p_wind_shelter_score, p_comfort_hint,
    now(),
    now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 30), 5)),
    now()
  )
  on conflict (venue_id) do update set
    wind_speed_10m = excluded.wind_speed_10m,
    wind_direction_deg = excluded.wind_direction_deg,
    cloud_cover_pct = excluded.cloud_cover_pct,
    effective_sun = excluded.effective_sun,
    effective_wind = excluded.effective_wind,
    wind_shelter_score = excluded.wind_shelter_score,
    comfort_hint = excluded.comfort_hint,
    weather_computed_at = excluded.weather_computed_at,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at;
$$;

-- anon and authenticated must be revoked by name, not just via PUBLIC: this
-- project's default privileges grant EXECUTE on new public functions to both
-- roles, and that grant survives a revoke from PUBLIC. Without this the
-- anon key could call a security-definer function that writes past RLS.
revoke all on function public.apply_microclimate_weather(
  text, real, real, real, real, real, real, text, int
) from public, anon, authenticated;

grant execute on function public.apply_microclimate_weather(
  text, real, real, real, real, real, real, text, int
) to service_role;
