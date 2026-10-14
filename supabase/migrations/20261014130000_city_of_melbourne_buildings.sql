-- ============================================================
-- City of Melbourne 2023 Building Footprints alongside OSM buildings.
--
-- Additive only: new nullable/defaulted columns, a service-role-only loader
-- RPC, a service-role-only dedupe RPC, and seed_venue_morphology taught to
-- skip superseded OSM rows. Applying this migration loads NO data; the rows
-- come from scripts/loadCityBuildings.mjs, run separately with approval.
--
-- public.buildings stays locked down (20261011120000): no anon/authenticated
-- grants are added here. Data licence: CC BY 4.0, credit "Building data ©
-- City of Melbourne (CC BY 4.0)" (shown in the map attribution).
-- ============================================================

alter table public.buildings
    add column if not exists source_ref text,
    add column if not exists base_m real,
    add column if not exists superseded boolean not null default false;

comment on column public.buildings.source_ref is
    'Stable id from a non-OSM source, e.g. com2023:<objectid>. Null for OSM rows (they use osm_id).';
comment on column public.buildings.base_m is
    'Height above ground of the bottom of this component (towers on podiums). height_m is its top.';
comment on column public.buildings.superseded is
    'True for an OSM row covered by a better source (City of Melbourne). Shading queries skip these.';

create unique index if not exists buildings_source_ref_key
    on public.buildings (source_ref) where source_ref is not null;

-- Loader: rows of {source_ref, geom_geojson, height_m, base_m}. Idempotent.
create or replace function public.upsert_city_buildings_batch(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
    r jsonb;
    g extensions.geometry;
    n int := 0;
begin
    if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
        raise exception 'p_rows must be a JSON array of at most 1000 rows' using errcode = '22023';
    end if;
    for r in select * from jsonb_array_elements(p_rows)
    loop
        if nullif(r->>'source_ref', '') is null or r->>'source_ref' not like 'com2023:%'
            or nullif(r->>'geom_geojson', '') is null then
            continue;
        end if;
        g := extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(r->>'geom_geojson'), 4326));
        if g is null or extensions.st_isempty(g) or not extensions.st_isvalid(g) then
            g := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(g), 3));
        end if;
        if g is null or extensions.st_isempty(g) then
            continue;
        end if;
        if (r->>'height_m')::real is null or (r->>'height_m')::real not between 0.5 and 400 then
            continue;
        end if;

        insert into public.buildings as b (osm_id, source_ref, geom, height_m, base_m, levels, source, city, superseded, ingested_at, updated_at)
        values (null, r->>'source_ref', g, (r->>'height_m')::real, coalesce((r->>'base_m')::real, 0),
                null, 'com2023', 'melbourne', false, now(), now())
        on conflict (source_ref) where source_ref is not null do update set
            geom = excluded.geom,
            height_m = excluded.height_m,
            base_m = excluded.base_m,
            updated_at = now();
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- Marks OSM buildings whose interior point lies inside a City of Melbourne
-- footprint. Re-runnable: clears and recomputes. Returns rows now superseded.
create or replace function public.mark_osm_buildings_superseded()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
    n int;
begin
    update public.buildings set superseded = false where source = 'osm' and superseded;
    update public.buildings as o
       set superseded = true, updated_at = now()
     where o.source = 'osm'
       and exists (
           select 1 from public.buildings as c
            where c.source = 'com2023'
              and c.geom operator(extensions.&&) o.geom
              and extensions.st_intersects(c.geom, extensions.st_pointonsurface(o.geom))
       );
    get diagnostics n = row_count;
    return n;
end;
$$;

-- Same as production's definition, except the nearby-buildings query now
-- skips superseded rows so a building is not counted twice.
create or replace function public.seed_venue_morphology(p_venue_id text, p_sun_score_annual real default null::real, p_sun_hour_fraction real[] default null::real[])
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_lat double precision;
  v_lng double precision;
  v_pt geometry;
  v_hw real;
  v_sectors real[];
  v_conf real;
  v_n int;
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
$function$;

-- Default privileges in this project grant EXECUTE to anon/authenticated by
-- name, so revoke by name (see CLAUDE.md) and allow only the service role.
revoke all on function public.upsert_city_buildings_batch(jsonb) from public, anon, authenticated;
revoke all on function public.mark_osm_buildings_superseded() from public, anon, authenticated;
revoke all on function public.seed_venue_morphology(text, real, real[]) from public, anon, authenticated;
grant execute on function public.upsert_city_buildings_batch(jsonb) to service_role;
grant execute on function public.mark_osm_buildings_superseded() to service_role;
grant execute on function public.seed_venue_morphology(text, real, real[]) to service_role;
