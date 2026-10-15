-- ============================================================
-- PROPOSED, not applied. To apply after approval, move to supabase/migrations/ with a timestamped name (see supabase/proposed/README.md).
-- Staging for imported venues (City of Melbourne CLUE outdoor seating).
--
-- Candidates land here, never in public.venues. place_venue_candidate()
-- moves each one from the council's property point to the footpath on the
-- side of the building facing the street in its address, flags anything a
-- person should eyeball, and stores its 36-sector building horizon so the
-- app can work out real sun. Promotion to public.venues is a later, reviewed
-- step and is not part of this migration.
--
-- Private: RLS on with no policies, and no grants to anon/authenticated.
-- Fill and place as the service role:
--   node scripts/importClueVenues.mjs --existing existing.json --out stage.sql
--   \i stage.sql
--   select public.place_venue_candidate(id) from public.venue_import_candidates where status = 'new';
--
-- Data © City of Melbourne (CLUE), CC BY 4.0.
-- ============================================================

create table if not exists public.venue_import_candidates (
  id                text primary key,
  source            text not null default 'clue',
  attribution       text not null default 'Venue and seating data © City of Melbourne (CLUE), CC BY 4.0',
  name              text not null,
  address           text,
  kind              text not null check (kind in ('cafe_restaurant', 'bar', 'takeaway', 'stay', 'bakery')),
  area              text,
  property_id       text,
  census_year       int,
  clue_lat          double precision not null,
  clue_lng          double precision not null,
  outdoor_seats     int,
  street            text,
  street_bearing    real,             -- 0-180, clockwise from north; null when unknown
  street_lat        double precision, -- a point on the street's centre line
  street_lng        double precision,
  on_laneway        boolean not null default false,
  floor_level       int not null default 0,
  rooftop           boolean not null default false,
  existing_venue_id text,             -- set when the candidate matches a venue already listed
  status            text not null default 'new'
                    check (status in ('new', 'duplicate', 'placed', 'approved', 'rejected', 'promoted')),
  placed_lat        double precision,
  placed_lng        double precision,
  facing_deg        real,
  moved_m           real,
  observer_height_m real,
  needs_pin_check   boolean,
  pin_check_reasons text[],
  sun_horizon_deg   real[],
  placed_at         timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists venue_import_candidates_status_idx on public.venue_import_candidates (status);

alter table public.venue_import_candidates enable row level security;
revoke all on table public.venue_import_candidates from public, anon, authenticated;

comment on table public.venue_import_candidates is
  'Private staging for imported venues (City of Melbourne CLUE, CC BY 4.0). Never read by the app; promoted to public.venues only after review.';

create or replace function public.place_venue_candidate(p_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
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

  v_pt := st_setsrid(st_makepoint(c.clue_lng, c.clue_lat), 4326);

  -- The council point is the property centre, usually inside the building.
  select b.geom, coalesce(b.height_m, nullif(b.levels, 0) * 3.0, 6.0)
    into v_host, v_top
  from public.buildings b
  where not b.superseded and b.geom && v_pt and st_intersects(b.geom, v_pt)
  order by st_area(b.geom) desc
  limit 1;

  if v_host is null then
    v_place := v_pt;
    v_reasons := v_reasons || 'no_building_at_point'::text;
  else
    -- Footpath candidates: 2 m out from each ~3 m stretch of wall, kept only
    -- where the ground is still open at 3.5 m. That admits CBD laneways but not
    -- a shared wall or a narrow gap between buildings.
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
      -- Street-facing first; among those, the wall nearest the street line
      -- (to the metre), then the spot nearest the council point.
      order by (not aligned), case when aligned then round(to_street_m) end, to_pin_m
      limit 1
    )
    select b.pt, b.az, b.aligned,
           exists (select 1 from open o
                   where st_dwithin(o.pt::geography, b.pt::geography, 20)
                     and abs(((o.az - b.az)::numeric % 360 + 540) % 360 - 180) >= 60)
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

  -- Eye height: 1.5 m above the seating floor (about 3.5 m per level); a
  -- rooftop sits on top of its building.
  if c.rooftop then
    v_obs := coalesce(v_top, 6.0) + 1.5;
    v_reasons := v_reasons || 'rooftop_height_estimated'::text;
  else
    v_obs := greatest(c.floor_level, 0) * 3.5 + 1.5;
    if c.floor_level > 0 then v_reasons := v_reasons || 'upper_floor'::text; end if;
  end if;

  -- Building horizon, as seed_venue_morphology: highest obstruction angle
  -- along a 150 m ray per 10 deg sector. Seating on the footpath has its own
  -- building behind it, so that counts too; only a rooftop skips it.
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
    needs_pin_check = cardinality(v_reasons) > 0
                      and v_reasons <> array['upper_floor']::text[],
    pin_check_reasons = v_reasons,
    sun_horizon_deg = v_horizon,
    status = case when status = 'new' then 'placed' else status end,
    placed_at = now()
  where id = p_id;
end;
$function$;

revoke all on function public.place_venue_candidate(text) from public, anon, authenticated;

comment on function public.place_venue_candidate(text) is
  'Service role only. Moves an import candidate to the footpath facing its address street, flags pins to check, and stores its building horizon.';
