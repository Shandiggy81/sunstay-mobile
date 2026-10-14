-- ============================================================
-- Two fixes, no signature or return-type changes:
--
-- 1. venues_in_bbox ignored p_hour whenever effective_sun was set, and the
--    enrich-microclimate cron sets it for every row. An explicit p_hour that
--    differs from the current Australia/Melbourne hour now reads
--    sun_hour_fraction[hour + 1] (hour clamped to 0..23). The live hour
--    (p_hour null, or p_hour = now with an unexpired profile) still returns
--    the cloud-adjusted effective_sun. The current cloud cover is a snapshot
--    for this hour only, so other hours get the raw geometric fraction.
--
-- 2. seed_venue_morphology filled sun_hour_fraction from a latitude sine wave
--    when no array was supplied, so all 67 profiles had sun_score_annual
--    ~0.3097. It now ray-casts a 36-sector (10 deg) horizon against
--    non-superseded public.buildings within 150 m, then averages the solar
--    position over 24 samples per wall-clock hour (the 15th of each month at
--    :15 and :45, DST-aware through Australia/Melbourne) using the NOAA
--    solar equations. Per sample:
--      0                                       if the sun is below the horizon
--      ramp * (0.85 * direct + 0.15 * svf)     otherwise
--    direct = sun altitude above the building horizon in its azimuth sector,
--    svf = mean cos^2(horizon angle) (sky-view proxy, also stored in
--    sky_view_proxy), ramp = min(1, altitude / 5 deg) for the low sun near
--    sunrise and sunset. The footprint the venue point sits in, and the other
--    parts of that structure, are not counted as obstructions. Observer
--    height is base_elevation_meters (floor height above ground) + 1.5 m.
--    The wind sector / canyon H:W calculation is unchanged.
--
-- sun_hour_fraction stays real[24], 1-indexed in SQL, 0..23 in JS, so
-- enrich-microclimate needs no change. Night hours are now 0 instead of 0.02.
--
-- Applying this migration does NOT reseed. After approval, run as the
-- service role:
--     select * from public.seed_melbourne_morphology();
-- effective_sun then catches up on the next enrich-microclimate run after
-- each row's expires_at.
-- ============================================================

create or replace function public.venues_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  p_limit integer default 500,
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
  sun_hour_fraction real[]
)
language sql
stable
security invoker
set search_path to public, extensions, pg_temp
as $$
  with now_local as (
    select
      extract(hour from now() at time zone 'Australia/Melbourne')::int as hour_now,
      extract(month from now() at time zone 'Australia/Melbourne')::smallint as month_now
  ),
  params as (
    select
      least(greatest(coalesce(p_hour::int, n.hour_now), 0), 23) as hour_local,
      coalesce(p_month, n.month_now) as month_local,
      (p_hour is null) as hour_is_default,
      (p_hour is not null and least(greatest(p_hour::int, 0), 23) = n.hour_now) as hour_is_now,
      least(greatest(coalesce(p_limit, 500), 1), 2000) as lim
    from now_local n
  )
  select
    v.id,
    v."venueName" as name,
    null::text as slug,
    v."typeCategory" as category,
    v.lng,
    v.lat,
    m.sun_score_annual,
    case
      when p.hour_is_default
        or (p.hour_is_now and m.expires_at > now())
        then coalesce(m.effective_sun, m.sun_hour_fraction[p.hour_local + 1])
      else m.sun_hour_fraction[p.hour_local + 1]
    end as sun_now,
    m.wind_shelter_score,
    m.effective_wind,
    m.effective_sun,
    m.comfort_hint,
    m.canyon_aspect_hw,
    m.geometry_confidence,
    m.weather_computed_at,
    m.sun_hour_fraction
  from public.venues v
  cross join params p
  left join public.microclimate_profiles m on m.venue_id = v.id
  where v.lat between min_lat and max_lat
    and v.lng between min_lng and max_lng
  order by v.id
  limit (select lim from params);
$$;

comment on function public.venues_in_bbox(double precision, double precision, double precision, double precision, integer, smallint, smallint) is
  'Mapbox viewport query: venues in bbox with cached microclimate. Hour defaults to Australia/Melbourne wall-clock (AEST/AEDT); an explicit other hour reads sun_hour_fraction for that hour.';

grant execute on function public.venues_in_bbox(double precision, double precision, double precision, double precision, integer, smallint, smallint)
  to anon, authenticated, service_role;

create or replace function public.seed_venue_morphology(p_venue_id text, p_sun_score_annual real default null::real, p_sun_hour_fraction real[] default null::real[])
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_lat double precision;
  v_lng double precision;
  v_obs double precision;
  v_pt geometry;
  v_hw real;
  v_sectors real[];
  v_conf real;
  v_n int;
  v_hours real[];
  v_annual real;
  v_horizon real[];
  v_svf real;
begin
  select lat, lng, greatest(coalesce(base_elevation_meters, 0), 0)::double precision + 1.5
    into v_lat, v_lng, v_obs
  from public.venues
  where id = p_venue_id;

  if v_lat is null or v_lng is null then
    raise exception 'venue % not found or missing lat/lng', p_venue_id;
  end if;

  v_pt := ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326);

  if p_sun_hour_fraction is not null then
    if array_length(p_sun_hour_fraction, 1) <> 24 then
      raise exception 'p_sun_hour_fraction must be real[24]';
    end if;
    v_hours := p_sun_hour_fraction;
  else
    -- Building horizon: highest obstruction angle along a 150 m ray per 10 deg sector.
    with host as (
      select b.id, b.structure_ref
      from public.buildings b
      where b.geom && v_pt
        and ST_Intersects(b.geom, v_pt)
        and not b.superseded
    ),
    nearby as (
      select
        b.geom,
        coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)::double precision as top_m
      from public.buildings b
      where b.geom && ST_Expand(v_pt, 0.002)
        and ST_DWithin(v_pt::geography, b.geom::geography, 150)
        and not b.superseded
        and not exists (
          select 1 from host h
          where h.id = b.id
             or (h.structure_ref is not null and h.structure_ref = b.structure_ref)
        )
    ),
    rays as (
      select s, ST_MakeLine(v_pt, ST_Project(v_pt::geography, 150, radians(s * 10 + 5))::geometry) as ray
      from generate_series(0, 35) s
    ),
    horizon as (
      select
        r.s,
        greatest(coalesce(max(degrees(atan2(
          n.top_m - v_obs,
          greatest(ST_Distance(v_pt::geography, ST_Intersection(r.ray, n.geom)::geography), 1.0)
        ))), 0), 0) as h_deg
      from rays r
      left join nearby n on ST_Intersects(r.ray, n.geom)
      group by r.s
    )
    select
      array_agg(h_deg::real order by s),
      avg(cos(radians(h_deg)) ^ 2)::real
    into v_horizon, v_svf
    from horizon;

    -- Solar position per sample (NOAA equations), averaged per wall-clock hour.
    with samples as (
      select h, (make_timestamp(2026, mth, 15, h, mi, 0) at time zone 'Australia/Melbourne') at time zone 'UTC' as utc_ts
      from generate_series(0, 23) h
      cross join generate_series(1, 12) mth
      cross join (values (15), (45)) t(mi)
    ),
    sol as (
      select s.h, x.alt, x.az
      from samples s
      cross join lateral (
        select
          extract(doy from s.utc_ts) as doy,
          extract(epoch from s.utc_ts::time) / 3600.0 as utc_h
      ) d
      cross join lateral (
        select 2 * pi() / 365 * (d.doy - 1 + (d.utc_h - 12) / 24) as g
      ) gg
      cross join lateral (
        select
          229.18 * (0.000075 + 0.001868 * cos(gg.g) - 0.032077 * sin(gg.g)
                    - 0.014615 * cos(2 * gg.g) - 0.040849 * sin(2 * gg.g)) as eqt,
          0.006918 - 0.399912 * cos(gg.g) + 0.070257 * sin(gg.g) - 0.006758 * cos(2 * gg.g)
            + 0.000907 * sin(2 * gg.g) - 0.002697 * cos(3 * gg.g) + 0.00148 * sin(3 * gg.g) as decl
      ) e
      cross join lateral (
        select radians((d.utc_h * 60 + e.eqt + 4 * v_lng) / 4 - 180) as ha, radians(v_lat) as phi
      ) a
      cross join lateral (
        select
          degrees(asin(greatest(-1, least(1,
            sin(a.phi) * sin(e.decl) + cos(a.phi) * cos(e.decl) * cos(a.ha))))) as alt,
          degrees(atan2(sin(a.ha), cos(a.ha) * sin(a.phi) - tan(e.decl) * cos(a.phi))) + 180 as az
      ) x
    ),
    hourly as (
      select
        h,
        avg(case
              when alt <= 0 then 0
              else least(1.0, alt / 5.0)
                   * (0.85 * (alt > v_horizon[floor(az / 10)::int % 36 + 1])::int + 0.15 * v_svf)
            end) as frac
      from sol
      group by h
    )
    select array_agg(least(1.0, greatest(0.0, coalesce(frac, 0)))::real order by h)
    into v_hours
    from hourly;
  end if;

  v_annual := coalesce(
    p_sun_score_annual,
    (select avg(x)::real from unnest(v_hours) as x)
  );

  with nearby as (
    select
      coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)::real as height_m,
      ST_Distance(v_pt::geography, b.geom::geography) as dist_m,
      degrees(ST_Azimuth(v_pt, ST_Centroid(b.geom))) as az
    from public.buildings b
    where b.geom && ST_Expand(v_pt, 0.002)
      and ST_DWithin(v_pt::geography, b.geom::geography, 150)
      and not b.superseded
  ),
  stats as (
    select
      (avg(height_m) / nullif(avg(greatest(dist_m, 8)), 0))::real as hw,
      array[
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az < 22.5 or az >= 337.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 22.5 and az < 67.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 67.5 and az < 112.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 112.5 and az < 157.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 157.5 and az < 202.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 202.5 and az < 247.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 247.5 and az < 292.5), 0) / 40),
        greatest(0.25, 1 - coalesce(avg(height_m) filter (where az >= 292.5 and az < 337.5), 0) / 40)
      ]::real[] as sectors,
      least(1.0, count(*)::real / 12.0)::real as conf,
      count(*)::int as n
    from nearby
  )
  select hw, sectors, conf, n into v_hw, v_sectors, v_conf, v_n from stats;

  if v_n is null or v_n < 3 or v_hw is null then
    v_hw := 0.45;
    v_sectors := array[0.75,0.70,0.65,0.70,0.80,0.75,0.70,0.75]::real[];
    v_conf := 0.2;
  end if;

  insert into public.microclimate_profiles (
    venue_id,
    canyon_aspect_hw,
    wind_exposure_by_sector,
    sun_score_annual,
    sun_hour_fraction,
    sky_view_proxy,
    geometry_confidence,
    source_sun,
    source_wind,
    geometry_computed_at,
    updated_at
  ) values (
    p_venue_id,
    v_hw,
    v_sectors,
    v_annual,
    v_hours,
    v_svf,
    v_conf,
    case when p_sun_hour_fraction is null then 'buildings_horizon_raycast_v2' else 'osm_buildings_horizon_v1' end,
    case when v_conf > 0.2 then 'morphology_hw_v1' else 'morphology_hw_heuristic_v1' end,
    now(),
    now()
  )
  on conflict (venue_id) do update set
    canyon_aspect_hw = excluded.canyon_aspect_hw,
    wind_exposure_by_sector = excluded.wind_exposure_by_sector,
    sun_score_annual = excluded.sun_score_annual,
    sun_hour_fraction = excluded.sun_hour_fraction,
    sky_view_proxy = coalesce(excluded.sky_view_proxy, microclimate_profiles.sky_view_proxy),
    geometry_confidence = excluded.geometry_confidence,
    source_sun = excluded.source_sun,
    source_wind = excluded.source_wind,
    geometry_computed_at = excluded.geometry_computed_at,
    updated_at = excluded.updated_at;
end;
$function$;

-- Default privileges grant EXECUTE to anon/authenticated by name; keep the
-- seeder service-role only (see 20261011120000).
revoke all on function public.seed_venue_morphology(text, real, real[]) from public, anon, authenticated;
grant execute on function public.seed_venue_morphology(text, real, real[]) to service_role;
