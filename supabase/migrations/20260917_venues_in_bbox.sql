create extension if not exists postgis with schema extensions;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  category text,
  location extensions.geography(point, 4326) not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venues_location_gix
  on public.venues using gist (location);

create table if not exists public.venue_outdoor_points (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
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

create table if not exists public.microclimate_profiles (
  venue_id uuid primary key references public.venues(id) on delete cascade,
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

create or replace function public.venues_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  p_limit int default 500,
  p_hour smallint default null,
  p_month smallint default null
)
returns table (
  id uuid,
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
set search_path = public, extensions
as $$
  with params as (
    select
      coalesce(p_hour, extract(hour from now() at time zone 'UTC')::smallint) as hour_utc,
      coalesce(p_month, extract(month from now() at time zone 'UTC')::smallint) as month_utc,
      least(greatest(coalesce(p_limit, 500), 1), 2000) as lim,
      ST_SetSRID(ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat), 4326)::extensions.geography as env_geog,
      ST_SetSRID(ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat), 4326) as env_geom
  )
  select
    v.id,
    v.name,
    v.slug,
    v.category,
    ST_X(v.location::extensions.geometry) as lng,
    ST_Y(v.location::extensions.geometry) as lat,
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
  cross join params p
  where v.is_published = true
    and v.location && p.env_geog
    and ST_Intersects(v.location::extensions.geometry, p.env_geom)
  order by v.id
  limit (select lim from params);
$$;

grant execute on function public.venues_in_bbox(
  double precision, double precision, double precision, double precision, int, smallint, smallint
) to anon, authenticated, service_role;

create or replace function public.apply_microclimate_weather(
  p_venue_id uuid,
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
set search_path = public
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

revoke all on function public.apply_microclimate_weather from public;
grant execute on function public.apply_microclimate_weather to service_role;
