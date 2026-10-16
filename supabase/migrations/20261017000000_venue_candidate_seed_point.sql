-- ============================================================
-- Optional start point for placing an imported venue's pin.
--
-- place_venue_candidate() starts from the City of Melbourne point (clue_lat,
-- clue_lng). On big properties (Queen Victoria Market, shopping centres,
-- South Wharf) that point is the property's, not the shop's, and the pin can
-- land on the wrong frontage. 17 Oct pin review: for 41 held-back venues an
-- OpenStreetMap point and Google Maps agreed on the shop's spot within 30 m.
--
-- seed_lat/seed_lng hold such a start point. When set, placement starts
-- there instead of the council point; everything else (building, footpath,
-- street side, horizon, checks) works as before, and moved_m is measured from
-- the start point. seed_source records where the point came from. Only
-- storable sources go here (OpenStreetMap, ODbL, credited in the app, or a
-- point set by hand); Google Maps is used to check, never stored.
--
-- The function body is the definition running in production on 17 Oct
-- (pg_proc.prosrc, md5 76c9e0c034b6d634f619d6b36ca01482) with one change:
-- v_pt starts from the seed when there is one. Production's body differs from
-- a rebuild of the migration chain (20261015223950, 20261015224652,
-- 20261015224954, 20261016020000) only in comments, which the earlier
-- textual patches dropped; the executable code is the same.
--
-- This migration changes no data. After approval, as the service role:
--   update public.venue_import_candidates
--      set seed_lat = <osm lat>, seed_lng = <osm lng>, seed_source = 'osm:node/<id>'
--    where id = '<candidate id>' and status = 'placed';
--   select public.place_venue_candidate('<candidate id>');
-- Then promote only ids that pass ALL of these (promote_venue_candidates with
-- explicit ids skips needs_pin_check, so the gate must be checked here):
--   * moved_m <= 25 (the pin stayed at the seeded shop);
--   * pin_check_reasons has none of: no_open_footpath, street_side_unconfirmed,
--     rooftop_height_estimated, large_property, moved_far;
--   * no_building_at_point / covered_or_unmapped are acceptable only because
--     the seed is confirmed by two sources (OSM + Google within 30 m), e.g. a
--     stall under the Queen Victoria Market sheds; corner_or_laneway and
--     upper_floor are informational.
-- Anything else stays 'placed' for a person to check in Pin Review.
-- OSM data © OpenStreetMap contributors, ODbL.
-- ============================================================

alter table public.venue_import_candidates
  add column if not exists seed_lat double precision,
  add column if not exists seed_lng double precision,
  add column if not exists seed_source text;

alter table public.venue_import_candidates
  drop constraint if exists venue_import_candidates_seed_pair;
alter table public.venue_import_candidates
  add constraint venue_import_candidates_seed_pair check (
    (seed_lat is null and seed_lng is null and seed_source is null)
    or (seed_lat is not null and seed_lng is not null and seed_source is not null
        and seed_lat between -90 and 90 and seed_lng between -180 and 180 and trim(seed_source) <> ''));

comment on column public.venue_import_candidates.seed_lat is
  'Optional start point for place_venue_candidate() instead of clue_lat/clue_lng (e.g. the matching OpenStreetMap point). Null = use the council point.';
comment on column public.venue_import_candidates.seed_source is
  'Where seed_lat/seed_lng came from, e.g. osm:node/123 or hand. Storable sources only; never Google Maps.';

create or replace function public.place_venue_candidate(p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  c        public.venue_import_candidates%rowtype;
  v_pt     geometry;
  v_host   geometry;
  v_top    double precision;
  v_place  geometry;
  v_az     double precision;
  v_aligned boolean;
  v_corner boolean := false;
  v_obs    double precision;
  v_reasons text[] := '{}';
  v_horizon real[];
begin
  select * into c from public.venue_import_candidates where id = p_id;
  if not found then raise exception 'candidate % not found', p_id; end if;

  -- A reviewed start point (seed) wins over the council point.
  v_pt := st_setsrid(st_makepoint(coalesce(c.seed_lng, c.clue_lng), coalesce(c.seed_lat, c.clue_lat)), 4326);

  select b.geom, coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)
    into v_host, v_top
  from public.buildings b
  where not b.superseded and b.geom && v_pt and st_intersects(b.geom, v_pt)
  order by st_area(b.geom) desc
  limit 1;

  if v_host is null then
    v_place := v_pt;
    v_reasons := v_reasons || 'no_building_at_point'::text;
    if exists (select 1 from public.buildings b where not b.superseded and b.geom && st_expand(v_pt, 0.0001)
               and st_dwithin(b.geom::geography, v_pt::geography, 5)) then
      v_reasons := v_reasons || 'covered_or_unmapped'::text;
    end if;
  else
    with seg as (
      select st_lineinterpolatepoint((d).geom, 0.5) m,
             degrees(st_azimuth(st_startpoint((d).geom), st_endpoint((d).geom))) a
      from st_dumpsegments(st_segmentize(st_boundary(v_host)::geography, 3)::geometry) d
      where st_length((d).geom::geography) > 0.5
    ), normals as (
      select s.m, n.az from seg s,
      lateral (select az from (values (((s.a + 90)::numeric % 360)::double precision), (((s.a + 270)::numeric % 360)::double precision)) x(az)
               where not st_intersects(v_host, st_project(s.m::geography, 1.0, radians(az))::geometry) limit 1) n
    ), cand as (
      select az, st_project(m::geography, 2.0, radians(az))::geometry pt, st_project(m::geography, 3.5, radians(az))::geometry far
      from normals
    ), open as (
      select k.* from cand k
      where not exists (select 1 from public.buildings b where not b.superseded and b.geom && st_expand(k.pt, 0.0002) and st_intersects(b.geom, k.pt))
        and not exists (select 1 from public.buildings b where not b.superseded and b.geom && st_expand(k.far, 0.0002) and st_intersects(b.geom, k.far))
    ), scored as (
      select o.*,
        coalesce(c.street_bearing is not null and least(
          abs(((o.az - (c.street_bearing + 90))::numeric % 360 + 540) % 360 - 180),
          abs(((o.az - (c.street_bearing + 270))::numeric % 360 + 540) % 360 - 180)) <= 35, false) as aligned,
        case when c.street_bearing is null then null else
          abs((st_x(o.pt) - c.street_lng) * cos(radians(c.street_lat)) * cos(radians(c.street_bearing))
              - (st_y(o.pt) - c.street_lat) * sin(radians(c.street_bearing))) * 111320 end as to_street_m,
        st_distance(v_pt::geography, o.pt::geography) as to_pin_m
      from open o
    ), best as (
      select * from scored
      order by (not aligned), case when aligned then round(to_street_m) end, to_pin_m
      limit 1
    )
    select b.pt, b.az, b.aligned,
           exists (select 1 from open o
                   where st_dwithin(o.pt::geography, b.pt::geography, 12)
                     and abs(((o.az - b.az)::numeric % 360 + 540) % 360 - 180) between 60 and 120)
      into v_place, v_az, v_aligned, v_corner
    from best b;

    if v_place is null then
      v_place := v_pt;
      v_reasons := v_reasons || 'no_open_footpath'::text;
    else
      if not v_aligned then v_reasons := v_reasons || 'street_side_unconfirmed'::text; end if;
      if v_corner then v_reasons := v_reasons || 'corner_or_laneway'::text; end if;
    end if;
  end if;

  if st_distance(v_pt::geography, v_place::geography) > 30 then v_reasons := v_reasons || 'moved_far'::text; end if;
  if st_distance(v_pt::geography, v_place::geography) > 60 then v_reasons := v_reasons || 'large_property'::text; end if;

  if c.rooftop then
    v_obs := coalesce(v_top, 6.0) + 1.5;
    v_reasons := v_reasons || 'rooftop_height_estimated'::text;
  else
    v_obs := greatest(c.floor_level, 0) * 3.5 + 1.5;
    if c.floor_level > 0 then v_reasons := v_reasons || 'upper_floor'::text; end if;
  end if;

  with nearby as (
    select b.geom, coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)::double precision top_m
    from public.buildings b
    where not b.superseded
      and b.geom && st_expand(v_place, 0.002)
      and st_dwithin(v_place::geography, b.geom::geography, 150)
      and (not c.rooftop or v_host is null or not st_equals(b.geom, v_host))
      and not st_intersects(b.geom, v_place)
  ), rays as (
    select s, st_makeline(v_place, st_project(v_place::geography, 150, radians(s * 10 + 5))::geometry) ray
    from generate_series(0, 35) s
  ), horizon as (
    select r.s, greatest(coalesce(max(degrees(atan2(n.top_m - v_obs,
             greatest(st_distance(v_place::geography, st_intersection(r.ray, n.geom)::geography), 1.0)))), 0), 0) h
    from rays r left join nearby n on st_intersects(r.ray, n.geom)
    group by r.s
  )
  select array_agg(round(h::numeric, 1)::real order by s) into v_horizon from horizon;

  update public.venue_import_candidates set
    placed_lat = st_y(v_place),
    placed_lng = st_x(v_place),
    facing_deg = v_az,
    moved_m = round(st_distance(v_pt::geography, v_place::geography)::numeric, 1),
    observer_height_m = v_obs,
    needs_pin_check = v_reasons && array['street_side_unconfirmed', 'no_open_footpath',
                      'rooftop_height_estimated', 'covered_or_unmapped', 'large_property']::text[],
    pin_check_reasons = v_reasons,
    sun_horizon_deg = v_horizon,
    status = case when status = 'new' then 'placed' else status end,
    placed_at = now()
  where id = p_id;
end;
$function$;

revoke all on function public.place_venue_candidate(text) from public, anon, authenticated;
grant execute on function public.place_venue_candidate(text) to service_role;
