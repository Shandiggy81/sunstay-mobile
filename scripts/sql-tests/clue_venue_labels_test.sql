-- Tests the CLUE venue label rule, the OSM match and relabelling.
-- Needs a throwaway local Postgres with PostGIS (never production):
--   psql -h <local socket> -U postgres -v ON_ERROR_STOP=1 -f scripts/sql-tests/clue_venue_labels_test.sql
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
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(), geom geometry, height_m real, levels real,
  source text default 'test', superseded boolean not null default false, structure_ref text);
drop table if exists public.venue_import_candidates;
drop table if exists public.venues cascade;
create table public.venues (
  id text primary key, "venueName" text, address text, suburb text, lat float8, lng float8, emoji text, vibe text,
  "typeCategory" text, "typeLabel" text, tags jsonb, base_elevation_meters float8, notes text);
do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where proname = 'seed_venue_morphology' loop execute 'drop function ' || f; end loop;
end $$;
create function public.seed_venue_morphology(p_id text) returns void language sql as $$ select $$;

\ir ../../supabase/migrations/20261015223519_venue_import_candidates.sql
\ir ../../supabase/migrations/20261016000000_promote_venue_candidates.sql
\ir ../../supabase/migrations/20261016030000_clue_venue_labels_osm.sql

-- 1. The label rule. Cases from the 16 Oct pilot review.
do $$
declare
  t record;
  got record;
begin
  for t in select * from (values
    -- kind,             name,                     osm amenity,   expected label,        emoji
    ('cafe_restaurant', 'Seven Seeds',             'cafe',        'Cafe',                '☕'),
    ('cafe_restaurant', 'Brother Baba Budan',      'cafe',        'Cafe',                '☕'),
    ('cafe_restaurant', 'Asian Beer Cafe',         null,          'Pub & bar',           '🍺'),
    ('cafe_restaurant', 'Asian Beer Cafe',         'bar',         'Pub & bar',           '🍺'),
    ('cafe_restaurant', 'Sake Restaurant and Bar', null,          'Restaurant',          '🍽️'),
    ('cafe_restaurant', 'Ludlow Bar & Dining Room', null,         'Restaurant',          '🍽️'),
    ('cafe_restaurant', 'Koffi Bar',               null,          'Cafe',                '☕'),
    ('cafe_restaurant', 'Belgian Beer Cafe',       'pub',         'Pub & bar',           '🍺'),
    ('stay',            'Royal Melbourne Hotel',   'pub',         'Pub & bar',           '🍺'),
    ('bar',             'Bar Lourinha',            'bar',         'Cocktail & wine bar', '🍸'),
    ('cafe_restaurant', 'Grossi Florentino',       'restaurant',  'Restaurant',          '🍽️'),
    ('cafe_restaurant', 'Gordon Espresso',         'restaurant',  'Cafe',                '☕'),
    ('cafe_restaurant', 'Pellegrini''s',           'cafe',        'Cafe',                '☕'),
    ('takeaway',        'Kenny''s Bakery',         'fast_food',   'Bakery cafe',         '🥐'),
    ('cafe_restaurant', 'Le Petit Gateau',         'shop:pastry', 'Bakery cafe',         '🥐'),
    ('takeaway',        'Casa Del Gelato',         'fast_food',   'Gelato & dessert',    '🍨'),
    ('cafe_restaurant', 'Pidapipo',                'ice_cream',   'Gelato & dessert',    '🍨'),
    ('takeaway',        'Grill''d',                'fast_food',   'Takeaway',            '🥡'),
    ('stay',            'Lobby Lounge',            null,          'Hotel dining',        '🏨'),
    ('bar',             'Some Place',              null,          'Pub & bar',           '🍺'),
    ('cafe_restaurant', 'Oriental Teahouse',       'restaurant',  'Restaurant',          '🍽️'),
    ('cafe_restaurant', 'Little Teahouse',         null,          'Cafe',                '☕'),
    ('cafe_restaurant', 'Trattoria Nonna',         null,          'Restaurant',          '🍽️'),
    ('takeaway',        'Noodle Box',              null,          'Takeaway',            '🥡'),
    ('cafe_restaurant', 'Kinfolk',                 null,          'Eatery',              '🍽️'),
    ('cafe_restaurant', 'Pilgrim Bar',             null,          'Bar',                 '🍸'),
    ('cafe_restaurant', 'Bohemian Wine Bar',       null,          'Bar',                 '🍸'),
    ('cafe_restaurant', 'Rice Bar',                null,          'Eatery',              '🍽️'),
    ('cafe_restaurant', 'Okra Sri Lankan Cuisine', null,          'Restaurant',          '🍽️'),
    ('cafe_restaurant', 'Pure South Kitchen',      null,          'Restaurant',          '🍽️')
  ) as v(kind, name, osm, label, emoji)
  loop
    select * into got from public.clue_venue_label(t.kind, t.name, t.osm);
    assert got.label = t.label and got.emoji = t.emoji,
      format('%s (%s/%s): expected %s %s, got %s %s', t.name, t.kind, t.osm, t.label, t.emoji, got.label, got.emoji);
  end loop;
  select * into got from public.clue_venue_label('cafe_restaurant', 'Brother Baba Budan', null, 'Cafe');
  assert got.label = 'Cafe' and got.emoji = '☕', 'override wins';
  select * into got from public.clue_venue_label('cafe_restaurant', 'Seven Seeds', 'cafe', '  ');
  assert got.label = 'Cafe', 'blank override ignored';
  raise notice 'label rule: all cases pass';
end $$;

-- 2. OSM match: exact name beats contained name; 80 m limit; short names skipped.
insert into public.venue_import_candidates (id, name, address, kind, clue_lat, clue_lng, census_year, status, placed_lat, placed_lng, needs_pin_check, floor_level, rooftop)
values
  ('c-seeds', 'Seven Seeds',      '114 Berkeley St', 'cafe_restaurant', -37.8000, 144.9600, 2024, 'placed', -37.8000, 144.9600, false, 0, false),
  ('c-asian', 'Asian Beer Cafe',  '211 La Trobe St', 'cafe_restaurant', -37.8100, 144.9650, 2024, 'placed', -37.8100, 144.9650, false, 0, false),
  ('c-far',   'Far Away Diner',   '1 Somewhere St',  'cafe_restaurant', -37.8200, 144.9700, 2024, 'placed', -37.8200, 144.9700, false, 0, false),
  ('c-abc',   'ABC',              '2 Short St',      'cafe_restaurant', -37.8300, 144.9750, 2024, 'placed', -37.8300, 144.9750, false, 0, false);

create temp table t_match as select public.match_venue_candidates_osm(jsonb_build_array(
  -- Seven Seeds: a contained-name restaurant nearer, the exact-name cafe 10 m away. Exact wins.
  jsonb_build_object('type', 'node', 'id', 1, 'lat', -37.80001, 'lon', 144.96001, 'tags', jsonb_build_object('name', 'Seven Seeds Roastery Restaurant', 'amenity', 'restaurant')),
  jsonb_build_object('type', 'node', 'id', 2, 'lat', -37.80009, 'lon', 144.96000, 'tags', jsonb_build_object('name', 'Seven Seeds', 'amenity', 'cafe')),
  -- Far Away Diner: a contained name 150 m away is too far; the same name 300 m away matches.
  jsonb_build_object('type', 'way',  'id', 3, 'center', jsonb_build_object('lat', -37.82135, 'lon', 144.9700), 'tags', jsonb_build_object('name', 'Far Away Diner Bar', 'amenity', 'bar')),
  jsonb_build_object('type', 'node', 'id', 6, 'lat', -37.82270, 'lon', 144.9700, 'tags', jsonb_build_object('name', 'Far Away Diner', 'amenity', 'restaurant')),
  -- Asian Beer Cafe: same name 600 m away -> no match.
  jsonb_build_object('type', 'node', 'id', 7, 'lat', -37.81540, 'lon', 144.9650, 'tags', jsonb_build_object('name', 'Asian Beer Cafe', 'amenity', 'cafe')),
  -- ABC: under 4 characters -> never matched.
  jsonb_build_object('type', 'node', 'id', 4, 'lat', -37.8300, 'lon', 144.9750, 'tags', jsonb_build_object('name', 'ABC', 'amenity', 'bar')),
  -- No name -> ignored.
  jsonb_build_object('type', 'node', 'id', 5, 'lat', -37.8100, 'lon', 144.9650, 'tags', jsonb_build_object('amenity', 'bar'))
)) as n;

do $$
declare r record;
begin
  assert (select n from t_match) = 2, 'two candidates matched, got ' || (select n from t_match);
  select * into r from public.venue_import_candidates where id = 'c-seeds';
  assert r.osm_amenity = 'cafe' and r.osm_ref = 'node/2' and r.osm_name = 'Seven Seeds', 'Seven Seeds matched the exact-name cafe';
  assert (select osm_ref from public.venue_import_candidates where id = 'c-far') = 'node/6', 'same name within 500 m matches; contained name at 150 m does not';
  assert (select osm_amenity from public.venue_import_candidates where id = 'c-asian') is null, 'same name over 500 m is not a match';
  assert (select osm_amenity from public.venue_import_candidates where id = 'c-abc') is null, 'short names are not matched';
  raise notice 'OSM match: pass';
end $$;

-- 3. Promote uses the new rule; relabel fixes venues promoted under the old one.
insert into public.venues (id, "venueName", vibe, "typeLabel", emoji, "typeCategory", data_source)
values ('c-asian', 'Asian Beer Cafe', 'Cafe', 'Cafe', '☕', 'Bar', 'clue'),
       ('curated-1', 'Asian Beer Cafe copy', 'Cafe', 'Cafe', '☕', 'Bar', null);
update public.venue_import_candidates set status = 'promoted' where id = 'c-asian';

do $$
declare n int;
begin
  n := public.promote_venue_candidates(array['c-seeds', 'c-far']);
  assert n = 2, 'two promoted, got ' || n;
  assert (select "typeLabel" || emoji from public.venues where id = 'c-seeds') = 'Cafe☕', 'Seven Seeds promoted as Cafe';
  assert (select "typeLabel" from public.venues where id = 'c-far') = 'Restaurant', 'Far Away Diner labelled from OSM';

  n := public.relabel_clue_venues();
  assert n = 1, 'only Asian Beer Cafe changes, got ' || n;
  assert (select vibe || '|' || "typeLabel" || '|' || emoji from public.venues where id = 'c-asian') = 'Pub & bar|Pub & bar|🍺', 'Asian Beer Cafe relabelled';
  assert (select "typeLabel" from public.venues where id = 'curated-1') = 'Cafe', 'curated venues untouched';
  assert public.relabel_clue_venues() = 0, 'relabel is idempotent';

  assert not has_function_privilege('anon', 'public.match_venue_candidates_osm(jsonb)', 'execute'), 'anon cannot match';
  assert not has_function_privilege('anon', 'public.relabel_clue_venues()', 'execute'), 'anon cannot relabel';
  assert not has_function_privilege('authenticated', 'public.promote_venue_candidates(text[], int)', 'execute'), 'authenticated cannot promote';
  raise notice 'ALL LABEL ASSERTIONS PASSED';
end $$;
