-- Tests the optional start point (seed) for place_venue_candidate().
-- Needs a throwaway local Postgres with PostGIS (never production):
--   psql -h <local socket> -U postgres -v ON_ERROR_STOP=1 -f scripts/sql-tests/venue_candidate_seed_test.sql
-- Raises if any assertion fails.
\set ON_ERROR_STOP on
create schema if not exists extensions;
create extension if not exists postgis schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
set search_path to public, extensions;
drop table if exists public.buildings;
create table public.buildings (
  id uuid primary key default gen_random_uuid(), geom geometry, height_m real, levels real,
  source text default 'test', superseded boolean not null default false, structure_ref text);
drop table if exists public.venue_import_candidates;

\ir ../../supabase/migrations/20261015223519_venue_import_candidates.sql
\ir ../../supabase/migrations/20261017000000_venue_candidate_seed_point.sql

-- Two 20 m x 20 m shops ~250 m apart on an east-west street (bearing 90).
-- Shop A is around the council point, shop B around the seed.
insert into public.buildings (geom, height_m) values
  (st_setsrid(st_makeenvelope(144.95000, -37.81020, 144.95025, -37.81002), 4326), 10),
  (st_setsrid(st_makeenvelope(144.95300, -37.81020, 144.95325, -37.81002), 4326), 10);

insert into public.venue_import_candidates (id, name, kind, clue_lat, clue_lng, street_bearing, street_lat, street_lng)
values
  ('no-seed', 'Shop A', 'cafe_restaurant', -37.81011, 144.950125, 90, -37.81030, 144.951),
  ('seeded',  'Shop B', 'cafe_restaurant', -37.81011, 144.950125, 90, -37.81030, 144.951),
  ('open',    'Kiosk',  'cafe_restaurant', -37.81100, 144.95150, 90, -37.81030, 144.951);

update public.venue_import_candidates
   set seed_lat = -37.81011, seed_lng = 144.953125, seed_source = 'osm:node/1'
 where id = 'seeded';

select public.place_venue_candidate(id) from public.venue_import_candidates;

do $$
declare a record; b record; k record;
begin
  select * into a from public.venue_import_candidates where id = 'no-seed';
  select * into b from public.venue_import_candidates where id = 'seeded';
  select * into k from public.venue_import_candidates where id = 'open';

  -- Without a seed the pin goes to shop A's frontage, near the council point.
  if st_distance(st_makepoint(a.placed_lng, a.placed_lat)::geography, st_makepoint(144.950125, -37.81011)::geography) > 20 then
    raise exception 'no-seed pin should stay at shop A, got % m away', round(st_distance(st_makepoint(a.placed_lng, a.placed_lat)::geography, st_makepoint(144.950125, -37.81011)::geography)::numeric);
  end if;

  -- With a seed the pin goes to shop B's frontage, ~250 m from the council point.
  if st_distance(st_makepoint(b.placed_lng, b.placed_lat)::geography, st_makepoint(144.953125, -37.81011)::geography) > 20 then
    raise exception 'seeded pin should be at shop B, got % m from the seed', round(st_distance(st_makepoint(b.placed_lng, b.placed_lat)::geography, st_makepoint(144.953125, -37.81011)::geography)::numeric);
  end if;
  -- moved_m is measured from the seed, so the 250 m from the council point is not "moved far".
  if b.moved_m > 20 or 'moved_far' = any(b.pin_check_reasons) or 'large_property' = any(b.pin_check_reasons) then
    raise exception 'seeded move should be short: moved_m %, reasons %', b.moved_m, b.pin_check_reasons;
  end if;
  -- The pin is on the street side (south), so the side check passes.
  if 'street_side_unconfirmed' = any(b.pin_check_reasons) then
    raise exception 'seeded pin should be on the street side, reasons %', b.pin_check_reasons;
  end if;
  if b.facing_deg is null or abs(b.facing_deg - 180) > 1 then
    raise exception 'seeded pin should face the street (180), got %', b.facing_deg;
  end if;
  if b.sun_horizon_deg is null or cardinality(b.sun_horizon_deg) <> 36 then
    raise exception 'seeded pin needs a 36-sector horizon';
  end if;

  -- A point with no building stays where it is, as before.
  if k.placed_lat <> -37.81100 or k.placed_lng <> 144.95150 or not ('no_building_at_point' = any(k.pin_check_reasons)) then
    raise exception 'open-ground candidate should stay put with no_building_at_point, got % % %', k.placed_lat, k.placed_lng, k.pin_check_reasons;
  end if;
end $$;

-- Clearing the seed puts placement back on the council point.
update public.venue_import_candidates set seed_lat = null, seed_lng = null, seed_source = null where id = 'seeded';
select public.place_venue_candidate('seeded');
do $$ declare b record; begin
  select * into b from public.venue_import_candidates where id = 'seeded';
  if st_distance(st_makepoint(b.placed_lng, b.placed_lat)::geography, st_makepoint(144.950125, -37.81011)::geography) > 20 then
    raise exception 'cleared seed should fall back to the council point';
  end if;
end $$;

-- A seed needs both coordinates and a source.
do $$ begin
  begin
    update public.venue_import_candidates set seed_lat = -37.8, seed_lng = 144.9 where id = 'open';
    raise exception 'seed without a source should be refused';
  exception when check_violation then null;
  end;
  begin
    update public.venue_import_candidates set seed_lat = -37.8, seed_source = 'hand' where id = 'open';
    raise exception 'seed without a longitude should be refused';
  exception when check_violation then null;
  end;
end $$;

-- Only the service role may run placement.
do $$ begin
  if has_function_privilege('anon', 'public.place_venue_candidate(text)', 'execute')
     or has_function_privilege('authenticated', 'public.place_venue_candidate(text)', 'execute') then
    raise exception 'anon/authenticated must not execute place_venue_candidate';
  end if;
  if not has_function_privilege('service_role', 'public.place_venue_candidate(text)', 'execute') then
    raise exception 'service_role must execute place_venue_candidate';
  end if;
end $$;

\echo 'venue_candidate_seed_test: all assertions passed'
