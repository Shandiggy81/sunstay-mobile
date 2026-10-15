-- PROPOSED, not applied. To apply after approval, move to supabase/migrations/ with a timestamped name (see supabase/proposed/README.md).
-- ============================================================
-- geometry_confidence should mean "how much do we trust the building heights
-- around this venue", not just "how many buildings are nearby".
--
-- seed_venue_morphology scored confidence as min(1, buildings within 150 m / 12).
-- Outside the City of Melbourne almost every building is OSM with no height
-- tag (8,030 of 9,122 active OSM buildings sit at the 6 m default), so
-- St Kilda, Fitzroy, Brunswick and Windsor venues scored ~1.0. The venue card
-- already labels readings with confidence < 0.5 as "Modelled from street
-- geometry, not measured on site", so an honest number turns that label on.
--
-- Checked read-only on production (15 Oct 2026): 64 of 67 venues score >= 0.5
-- today; with this formula 30 do (CBD, Southbank, Docklands, a few well-mapped
-- suburbs) and 36 become estimates.
--
-- Changes only the confidence line (and the measured flag it reads); sun,
-- wind and horizon calculations are unchanged. Part 2 rescores existing rows
-- without a reseed.
-- ============================================================

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
                   * (alt > v_horizon[floor(az / 10)::int % 36 + 1])::int
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
      (b.source = 'com2023' or b.levels is not null or (b.height_m is not null and b.height_m <> 6)) as measured,
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
      -- Enough buildings nearby AND real heights: City of Melbourne measured
      -- buildings, or OSM ones with a height or level tag. OSM buildings with
      -- no tag default to 6 m, so they count toward density but not confidence.
      (least(1.0, count(*)::real / 12.0)
        * (count(*) filter (where measured))::real / nullif(count(*), 0))::real as conf,
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
    sun_horizon_deg,
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
    v_horizon,
    v_hw,
    v_sectors,
    v_annual,
    v_hours,
    v_svf,
    v_conf,
    case when p_sun_hour_fraction is null then 'buildings_horizon_raycast_v3' else 'osm_buildings_horizon_v1' end,
    case when v_conf > 0.2 then 'morphology_hw_v1' else 'morphology_hw_heuristic_v1' end,
    now(),
    now()
  )
  on conflict (venue_id) do update set
    sun_horizon_deg = coalesce(excluded.sun_horizon_deg, microclimate_profiles.sun_horizon_deg),
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

revoke all on function public.seed_venue_morphology(text, real, real[]) from public, anon, authenticated;
grant execute on function public.seed_venue_morphology(text, real, real[]) to service_role;

-- Part 2: rescore the existing profiles with the same rule.
update public.microclimate_profiles m
set geometry_confidence = s.conf, updated_at = now()
from (
  select v.id,
    (least(1.0, count(b.*)::real / 12.0)
      * (count(b.*) filter (where b.source = 'com2023' or b.levels is not null or (b.height_m is not null and b.height_m <> 6)))::real
      / nullif(count(b.*), 0))::real as conf
  from public.venues v
  left join public.buildings b
    on not b.superseded
   and b.geom && st_expand(st_setsrid(st_makepoint(v.lng, v.lat), 4326), 0.002)
   and st_dwithin(st_setsrid(st_makepoint(v.lng, v.lat), 4326)::geography, b.geom::geography, 150)
  group by v.id
  having count(b.*) >= 3
) s
where m.venue_id = s.id;
