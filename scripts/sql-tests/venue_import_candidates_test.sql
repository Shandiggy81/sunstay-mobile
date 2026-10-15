-- Tests public.place_venue_candidate() on a synthetic street scene.
-- Needs a throwaway local Postgres with PostGIS (never production):
--   psql -h <local socket> -U postgres -v ON_ERROR_STOP=1 -f scripts/sql-tests/venue_import_candidates_test.sql
-- Prints the placed candidates and raises if any assertion fails.
\set ON_ERROR_STOP on
create schema if not exists extensions;
create extension if not exists postgis schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
set search_path to public, extensions;
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(), geom geometry, height_m real, levels real,
  source text default 'test', superseded boolean not null default false, structure_ref text);
truncate public.buildings;
drop table if exists public.venue_import_candidates;

-- metres east/north of a local origin -> lon/lat
create or replace function pg_temp.box(x0 float8, y0 float8, x1 float8, y1 float8) returns geometry language sql as $$
  select st_setsrid(st_makeenvelope(144.962 + x0 / (111320 * cos(radians(-37.813))), -37.813 + y0 / 111320,
                                    144.962 + x1 / (111320 * cos(radians(-37.813))), -37.813 + y1 / 111320), 4326) $$;
create or replace function pg_temp.lon(x float8) returns float8 language sql as $$ select 144.962 + x / (111320 * cos(radians(-37.813))) $$;
create or replace function pg_temp.lat(y float8) returns float8 language sql as $$ select -37.813 + y / 111320 $$;

-- Scene: an E-W street (y -10..10). South side: a terrace of shared-wall buildings
-- W (-20..0), H (0..20, the venue), P (20..40), backed by R. A 5 m laneway runs
-- N-S at x 60..65 beside corner building C (40..60). North side: tall block A.
insert into public.buildings (geom, height_m) values
  (pg_temp.box(-20, -30, 0, -10), 12),   -- W
  (pg_temp.box(0, -30, 20, -10), 12),    -- H (venue)
  (pg_temp.box(20, -30, 40, -10), 12),   -- P
  (pg_temp.box(-20, -60, 65, -30), 15),  -- R (behind the terrace)
  (pg_temp.box(40, -30, 60, -10), 9),    -- C (corner: street to the north, lane to the east)
  (pg_temp.box(65, -30, 100, -10), 9),   -- across the lane
  (pg_temp.box(-20, 10, 100, 40), 30);   -- A (across the street)
\ir ../../supabase/proposed/venue_import_candidates.sql

insert into public.venue_import_candidates (id, name, kind, clue_lat, clue_lng, street, street_bearing, street_lat, street_lng, floor_level, rooftop) values
  ('mid', 'Mid-terrace cafe', 'cafe_restaurant', pg_temp.lat(-20), pg_temp.lon(10), 'Test Street', 90, pg_temp.lat(0), pg_temp.lon(0), 0, false),
  ('corner', 'Corner bar', 'bar', pg_temp.lat(-20), pg_temp.lon(50), 'Test Street', 90, pg_temp.lat(0), pg_temp.lon(0), 0, false),
  ('nostreet', 'Unknown street', 'cafe_restaurant', pg_temp.lat(-20), pg_temp.lon(10), null, null, null, null, 0, false),
  ('upstairs', 'Level 2 bar', 'bar', pg_temp.lat(-20), pg_temp.lon(10), 'Test Street', 90, pg_temp.lat(0), pg_temp.lon(0), 2, false),
  ('roof', 'Rooftop bar', 'bar', pg_temp.lat(-20), pg_temp.lon(10), 'Test Street', 90, pg_temp.lat(0), pg_temp.lon(0), 0, true),
  ('outside', 'In a park', 'cafe_restaurant', pg_temp.lat(-100), pg_temp.lon(200), 'Test Street', 90, pg_temp.lat(0), pg_temp.lon(0), 0, false);
select public.place_venue_candidate(id) from public.venue_import_candidates;

select id, status, round(facing_deg) facing, moved_m, observer_height_m obs, needs_pin_check chk, pin_check_reasons reasons,
       round(((placed_lat + 37.813) * 111320)::numeric, 1) y_m, round(((placed_lng - 144.962) * 111320 * cos(radians(-37.813)))::numeric, 1) x_m,
       sun_horizon_deg[1] north, sun_horizon_deg[10] east, sun_horizon_deg[19] south, sun_horizon_deg[28] west
from public.venue_import_candidates order by id;

do $$
declare r record;
begin
  select * into r from public.venue_import_candidates where id = 'mid';
  assert abs(r.facing_deg) < 1 or abs(r.facing_deg - 360) < 1, 'mid faces north onto the street, got ' || r.facing_deg;
  assert not r.needs_pin_check, 'mid needs no check: ' || array_to_string(r.pin_check_reasons, ',');
  assert r.sun_horizon_deg[19] > 60, 'own building blocks the south for street seating';
  assert r.sun_horizon_deg[1] > 30, 'tall block across the street shades the north';
  select * into r from public.venue_import_candidates where id = 'corner';
  assert 'corner_or_laneway' = any(r.pin_check_reasons), 'corner flagged: ' || array_to_string(r.pin_check_reasons, ',');
  select * into r from public.venue_import_candidates where id = 'nostreet';
  assert 'street_side_unconfirmed' = any(r.pin_check_reasons) and r.needs_pin_check, 'unknown street flagged';
  select * into r from public.venue_import_candidates where id = 'upstairs';
  assert r.observer_height_m = 8.5 and r.pin_check_reasons = array['upper_floor'] and not r.needs_pin_check, 'upstairs: level 2 eye height, no check';
  select * into r from public.venue_import_candidates where id = 'roof';
  assert r.observer_height_m = 13.5 and r.needs_pin_check and r.sun_horizon_deg[19] < 10, 'rooftop above its building, south open';
  select * into r from public.venue_import_candidates where id = 'outside';
  assert 'no_building_at_point' = any(r.pin_check_reasons) and r.needs_pin_check, 'no building flagged';
  assert (select count(*) from public.venue_import_candidates where status <> 'placed') = 0, 'all placed';
  assert not has_table_privilege('anon', 'public.venue_import_candidates', 'select'), 'anon cannot read';
  assert not has_function_privilege('anon', 'public.place_venue_candidate(text)', 'execute'), 'anon cannot place';
  raise notice 'ALL PLACEMENT ASSERTIONS PASSED';
end $$;
