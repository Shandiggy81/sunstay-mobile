-- Geometry-only morphology seed using public.buildings (MultiPolygon) + venues.lat/lng
create or replace function public.seed_venue_morphology(
  p_venue_id text,
  p_sun_score_annual real default null,
  p_sun_hour_fraction real[] default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_pt geometry;
  v_hw real;
  v_sectors real[];
  v_conf real;
  v_hours real[];
  v_annual real;
  h int;
  bell real;
begin
  select lat, lng into v_lat, v_lng
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
    v_hours := array[]::real[];
    for h in 0..23 loop
      if h < 6 or h > 18 then
        v_hours := v_hours || 0.02::real;
      else
        bell := sin(pi() * ((h - 6)::real / 12.0));
        v_hours := v_hours || (least(1.0, greatest(0.0, bell * 0.95 * (1.0 - least(0.15, abs(v_lat + 37.81) * 0.01))))::real);
      end if;
    end loop;
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
      and ST_DWithin(v_pt::geography, b.geom::geography, 120)
  ),
  stats as (
    select
      coalesce(avg(height_m) / nullif(avg(greatest(dist_m, 8)), 0), 0.4)::real as hw,
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
  select hw, sectors, conf into v_hw, v_sectors, v_conf from stats;

  if v_hw is null then
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
    v_conf,
    'osm_buildings_horizon_v1',
    case when v_conf > 0.2 then 'morphology_hw_v1' else 'morphology_hw_heuristic_v1' end,
    now(),
    now()
  )
  on conflict (venue_id) do update set
    canyon_aspect_hw = excluded.canyon_aspect_hw,
    wind_exposure_by_sector = excluded.wind_exposure_by_sector,
    sun_score_annual = excluded.sun_score_annual,
    sun_hour_fraction = excluded.sun_hour_fraction,
    geometry_confidence = excluded.geometry_confidence,
    source_sun = excluded.source_sun,
    source_wind = excluded.source_wind,
    geometry_computed_at = excluded.geometry_computed_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.seed_venue_morphology(text, real, real[]) from public;
grant execute on function public.seed_venue_morphology(text, real, real[]) to service_role;

-- Convenience: reseed all Melbourne-bbox venues that have profiles or coords
create or replace function public.seed_melbourne_morphology()
returns table(venue_id text, geometry_confidence real, source_wind text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  with mel as (
    select v.id
    from public.venues v
    where v.lat between -38.0 and -37.7
      and v.lng between 144.8 and 145.1
  ),
  seeded as (
    select m.id,
           public.seed_venue_morphology(m.id) as _
    from mel m
  )
  select p.venue_id, p.geometry_confidence, p.source_wind
  from public.microclimate_profiles p
  join mel on mel.id = p.venue_id
  order by p.venue_id;
end;
$$;

revoke all on function public.seed_melbourne_morphology() from public;
grant execute on function public.seed_melbourne_morphology() to service_role;