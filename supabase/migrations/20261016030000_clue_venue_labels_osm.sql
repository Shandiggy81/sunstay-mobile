-- ============================================================
-- Better labels for imported City of Melbourne (CLUE) venues.
--
-- CLUE files cafes and restaurants under one industry, so promoted venues were
-- labelled from their names alone: Seven Seeds and Brother Baba Budan showed as
-- "Restaurant" and Asian Beer Cafe as "Cafe". This adds the OpenStreetMap
-- amenity of the matching OSM venue (same name, within 80 m) to each candidate
-- and labels from a hand-set override first, then the OSM amenity, then the
-- name, then the CLUE industry. A venue with no evidence either way is an
-- "Eatery" rather than a guessed type.
--
-- This migration changes no data. After approval, as the service role:
--   1. Fetch OSM food and drink venues for the City of Melbourne with pg_net:
--        select net.http_get(url := 'https://overpass-api.de/api/interpreter',
--          params := jsonb_build_object('data', '[out:json][timeout:90];(nwr["amenity"~"^(cafe|restaurant|bar|pub|fast_food|ice_cream|biergarten|food_court)$"]["name"](-37.86,144.89,-37.77,145.0);nwr["shop"~"^(bakery|pastry|coffee)$"]["name"](-37.86,144.89,-37.77,145.0););out tags center;'),
--          timeout_milliseconds := 120000);
--   2. select public.match_venue_candidates_osm((select content::jsonb -> 'elements' from net._http_response where id = <id>));
--      Review chains it couldn't place: select name, address from public.venue_import_candidates where osm_match = 'ambiguous';
--   3. Optional hand fixes for venues OSM doesn't know, e.g.
--        update public.venue_import_candidates set label_override = 'Cafe' where name = 'Brother Baba Budan';
--   4. select public.relabel_clue_venues();   -- already-promoted venues
-- Later promotions pick the new labels up automatically.
-- OSM data © OpenStreetMap contributors, ODbL.
-- ============================================================

alter table public.venue_import_candidates
  add column if not exists osm_amenity text,
  add column if not exists osm_ref     text,
  add column if not exists osm_name    text,
  add column if not exists osm_match   text check (osm_match in ('near', 'far', 'ambiguous')),
  add column if not exists label_override text;

comment on column public.venue_import_candidates.label_override is
  'A label set by hand after review (e.g. ''Cafe''); beats every rule in clue_venue_label().';
comment on column public.venue_import_candidates.osm_match is
  'How the OSM venue was matched: near (80 m), far (unique same name within 500 m) or ambiguous (not used; review).';
comment on column public.venue_import_candidates.osm_amenity is
  'amenity (or shop:<value>) of the matching OpenStreetMap venue, used for the label. Null = no match.';

-- The label rule, kept on its own so it can be tested and reused.
-- First match wins.
create or replace function public.clue_venue_label(p_kind text, p_name text, p_osm_amenity text,
                                                   p_override text default null,
                                                   out label text, out emoji text)
language sql
immutable
set search_path = public, pg_temp
as $function$
  select l.label, l.emoji from (select
    case
      -- A label set by hand (venue_import_candidates.label_override) wins.
      when nullif(trim(p_override), '') is not null then trim(p_override)
      when p_osm_amenity in ('pub', 'biergarten') then 'Pub & bar'
      -- A beer name beats an OSM "bar" tag (Asian Beer Cafe is a beer hall).
      when p_name ~* '(beer|tavern|taphouse|tap house|brewery|ale ?house)' then 'Pub & bar'
      when p_osm_amenity = 'bar' then 'Cocktail & wine bar'
      when p_osm_amenity in ('shop:bakery', 'shop:pastry')
        or p_name ~* '(bakery|bakehouse|bake house|patisserie|boulangerie|donut|doughnut)' then 'Bakery cafe'
      when p_osm_amenity = 'ice_cream' or p_name ~* 'gelat' then 'Gelato & dessert'
      -- A name that says coffee beats an OSM "restaurant" tag (Gordon Espresso).
      when p_name ~* '(caf[eé]|coffee|koffi|\mkopi\M|espresso|barista|roaster)' then 'Cafe'
      when p_osm_amenity in ('cafe', 'shop:coffee') then 'Cafe'
      when p_osm_amenity in ('fast_food', 'food_court') then 'Takeaway'
      when p_osm_amenity = 'restaurant' then 'Restaurant'
      -- No OSM match: the CLUE industry, then the name.
      when p_kind = 'bar' then 'Pub & bar'
      when p_kind = 'stay' then 'Hotel dining'
      when p_kind = 'bakery' then 'Bakery cafe'
      when p_name ~* '(tea ?house|tea ?rooms?|\mbrew)' then 'Cafe'
      when p_name ~* '(wine bar|cocktail|\mbar\M)'
        and p_name !~* ('(restaurant|ristorante|dining|buffet|pizza|meatball|sushi|noodle|rice|salad|panini|sandwich'
                     || '|juice|dessert|snack|milk|oyster|pasta|burger|grill|kebab|souvlaki|laksa|food|deli)') then 'Bar'
      when p_name ~* ('(restaurant|ristorante|trattoria|osteria|bistro|brasserie|dining|pizzeria|steakhouse|grill|kitchen|cuisine|eatery'
                  || '|thai|vietnamese|indian|korean|japanese|chinese|malaysian|lebanese|greek|mexican|sri lankan|nepalese'
                  || '|sushi|ramen|pho\M|dumpling|curry|izakaya|yakitori|tapas|bbq|hot ?pot)') then 'Restaurant'
      when p_kind = 'takeaway' then 'Takeaway'
      else 'Eatery'
    end as label) l0,
  lateral (select l0.label,
    case l0.label
      when 'Pub & bar' then '🍺' when 'Cocktail & wine bar' then '🍸' when 'Bar' then '🍸' when 'Bakery cafe' then '🥐'
      when 'Gelato & dessert' then '🍨' when 'Cafe' then '☕' when 'Takeaway' then '🥡'
      when 'Hotel dining' then '🏨' else '🍽️' end as emoji) l
$function$;

-- Store the matching OSM venue on each candidate. p_elements is the Overpass
-- "elements" array (out tags center). Names are normalised (lower case, letters
-- and digits, 4+ characters).
--   near:      within 80 m, the same name or one containing the other; an exact
--              name beats a contained one, then the nearer wins.
--   far:       nothing near, but exactly one OSM venue with the same name within
--              500 m (council points sit at property centroids, which can be far
--              inside big sites such as the Botanic Gardens) and no other
--              candidate with that name within 500 m.
--   ambiguous: nothing near, and the far match isn't unique (chains such as
--              Subway or Market Lane). No amenity is stored; listed for review.
-- Re-running replaces earlier matches. Returns the number with an amenity.
create or replace function public.match_venue_candidates_osm(p_elements jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  n int;
begin
  if p_elements is null or jsonb_typeof(p_elements) <> 'array' then
    raise exception 'match_venue_candidates_osm: expected the Overpass elements array';
  end if;

  update public.venue_import_candidates
     set osm_amenity = null, osm_ref = null, osm_name = null, osm_match = null
   where osm_match is not null or osm_amenity is not null;

  with osm as (
    select e->>'type' || '/' || (e->>'id') as ref,
           e->'tags'->>'name' as name,
           coalesce(e->'tags'->>'amenity', 'shop:' || (e->'tags'->>'shop')) as amenity,
           st_setsrid(st_makepoint(coalesce((e->>'lon')::float8, (e->'center'->>'lon')::float8),
                                   coalesce((e->>'lat')::float8, (e->'center'->>'lat')::float8)), 4326)::geography as g,
           regexp_replace(lower(e->'tags'->>'name'), '[^a-z0-9]', '', 'g') as n
    from jsonb_array_elements(p_elements) e
    where e->'tags'->>'name' is not null
      and coalesce(e->>'lat', e->'center'->>'lat') is not null),
  cand as (
    select id, st_setsrid(st_makepoint(clue_lng, clue_lat), 4326)::geography as g,
           regexp_replace(lower(name), '[^a-z0-9]', '', 'g') as n
    from public.venue_import_candidates
    where clue_lat is not null and clue_lng is not null),
  pairs as (
    select c.id, o.ref, o.name, o.amenity, (o.n = c.n) as exact, st_distance(c.g, o.g) as d
    from cand c
    join osm o on length(o.n) >= 4 and length(c.n) >= 4
              and ((o.n = c.n and st_dwithin(c.g, o.g, 500))
                   or ((position(o.n in c.n) > 0 or position(c.n in o.n) > 0) and st_dwithin(c.g, o.g, 80)))),
  near as (
    select distinct on (id) id, ref, name, amenity
    from pairs where d <= 80
    order by id, exact desc, d),
  far as (
    select p.id, min(p.ref) as ref, min(p.name) as name, min(p.amenity) as amenity, count(*) as k
    from pairs p
    where p.exact and p.d > 80 and not exists (select 1 from near where near.id = p.id)
    group by p.id),
  shared as (
    select c.id from cand c
    where exists (select 1 from cand c2 where c2.id <> c.id and c2.n = c.n and st_dwithin(c.g, c2.g, 500))),
  result as (
    select id, ref, name, amenity, 'near' as m from near
    union all
    select f.id,
           case when f.ok then f.ref end, case when f.ok then f.name end, case when f.ok then f.amenity end,
           case when f.ok then 'far' else 'ambiguous' end
    from (select far.*, (far.k = 1 and far.id not in (select id from shared)) as ok from far) f)
  update public.venue_import_candidates v
     set osm_amenity = r.amenity, osm_ref = r.ref, osm_name = r.name, osm_match = r.m
    from result r
   where v.id = r.id;

  select count(*) into n from public.venue_import_candidates where osm_amenity is not null;
  return n;
end;
$function$;

-- Re-apply the label rule to venues already promoted. Touches only imported
-- venues whose label would change. Returns the number updated.
create or replace function public.relabel_clue_venues()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  n int;
begin
  update public.venues v
     set vibe = l.label, "typeLabel" = l.label, emoji = l.emoji
    from public.venue_import_candidates c,
         lateral public.clue_venue_label(c.kind, c.name, c.osm_amenity, c.label_override) l
   where v.data_source = 'clue' and v.id = c.id
     and (v."typeLabel" is distinct from l.label or v.vibe is distinct from l.label or v.emoji is distinct from l.emoji);
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- promote_venue_candidates: as in 20261016000000, with the label from clue_venue_label().
create or replace function public.promote_venue_candidates(p_ids text[] default null, p_limit int default null)
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  c record;
  n int := 0;
  v_label text;
  v_emoji text;
  v_suburb text;
begin
  for c in
    select * from public.venue_import_candidates
    where status in ('placed', 'approved')
      and placed_lat is not null and placed_lng is not null
      and (case when p_ids is null then status = 'approved' or not coalesce(needs_pin_check, true)
                else id = any(p_ids) end)
    order by id
    limit p_limit
  loop
    -- Food and drink venues use typeCategory 'Bar' like the curated ones (it
    -- only means "not a stay"); the label and emoji are what people see and
    -- pick the map icon (utils/clayVenuePins.js).
    select l.label, l.emoji into v_label, v_emoji from public.clue_venue_label(c.kind, c.name, c.osm_amenity, c.label_override) l;

    v_suburb := case
      when c.area = 'Melbourne (CBD)' then 'CBD'
      when c.area = 'Melbourne (Remainder)' then 'Melbourne'
      when c.area like 'West Melbourne%' then 'West Melbourne'
      else c.area end;

    insert into public.venues (
      id, "venueName", address, suburb, lat, lng, emoji, vibe, "typeCategory", "typeLabel", tags,
      base_elevation_meters, data_source, source_ref, outdoor_seats, notes
    ) values (
      c.id, c.name, regexp_replace(initcap(lower(c.address)), '\mVic\M', 'VIC'), v_suburb, c.placed_lat, c.placed_lng, v_emoji, v_label, 'Bar', v_label,
      case when c.outdoor_seats >= 20 then '["Outdoor Seating", "Large Groups"]'::jsonb else '["Outdoor Seating"]'::jsonb end,
      case when c.rooftop then greatest(c.observer_height_m - 1.5, 0) else greatest(c.floor_level, 0) * 3.5 end,
      'clue', 'CLUE ' || c.census_year || ' property ' || coalesce(c.property_id, '?'), c.outdoor_seats,
      'Listed from City of Melbourne CLUE ' || c.census_year || ' outdoor-seating data (CC BY 4.0). Not yet verified by SunStay.'
    )
    on conflict (id) do nothing;

    if found then
      perform public.seed_venue_morphology(c.id);
      update public.venue_import_candidates set status = 'promoted' where id = c.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$function$;

revoke all on function public.clue_venue_label(text, text, text, text) from public, anon, authenticated;
revoke all on function public.match_venue_candidates_osm(jsonb) from public, anon, authenticated;
revoke all on function public.relabel_clue_venues() from public, anon, authenticated;
revoke all on function public.promote_venue_candidates(text[], int) from public, anon, authenticated;
grant execute on function public.clue_venue_label(text, text, text, text) to service_role;
grant execute on function public.match_venue_candidates_osm(jsonb) to service_role;
grant execute on function public.relabel_clue_venues() to service_role;
grant execute on function public.promote_venue_candidates(text[], int) to service_role;

comment on function public.clue_venue_label(text, text, text, text) is
  'Label and emoji for an imported CLUE venue: hand override, then OSM amenity, then name, then CLUE industry; "Eatery" when unknown.';
comment on function public.match_venue_candidates_osm(jsonb) is
  'Service role only. Stores the matching OpenStreetMap venue on each import candidate (near, unique far, or ambiguous for review). Returns the number with an amenity.';
comment on function public.relabel_clue_venues() is
  'Service role only. Re-applies clue_venue_label() to promoted CLUE venues whose label changed. Returns the number updated.';
