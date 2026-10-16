-- ============================================================
-- Accessibility, diet and smoking badges for imported CLUE venues.
--
-- City of Melbourne data only says a venue has outdoor seating. OpenStreetMap
-- sometimes says more. For a matched venue (near, or a unique far match) we
-- now keep three facts, as the app's existing tags:
--   wheelchair = yes | designated            -> 'Wheelchair Accessible'
--   diet:vegan = yes | only                  -> 'Vegan'
--   smoking    = outside | separated | isolated -> 'Smoking Area'
-- "limited" or "no" adds nothing. OSM has no dog or pram data for these venues.
--
-- match_venue_candidates_osm() also gains an optional p_ids scope, so a batch
-- can be matched without touching the rest of staging (it used to clear and
-- rewrite every candidate).
--
-- This migration changes no data. After approval, as the service role:
--   select public.match_venue_candidates_osm(<elements>, array(select id from public.venue_import_candidates where status = 'promoted'));
--   select public.apply_clue_venue_features();   -- adds missing badges to live imported venues
-- Later promotions include the badges automatically.
-- OSM data © OpenStreetMap contributors, ODbL.
-- ============================================================

alter table public.venue_import_candidates
  add column if not exists osm_features text[];

comment on column public.venue_import_candidates.osm_features is
  'Venue tags taken from the matching OpenStreetMap venue (Wheelchair Accessible, Vegan, Smoking Area). Null = none or no match.';

-- OSM tags -> SunStay tags, in display order. Pure, for reuse and tests.
create or replace function public.clue_osm_features(p_tags jsonb)
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $function$
  select coalesce(array_remove(array[
    case when lower(p_tags->>'wheelchair') in ('yes', 'designated') then 'Wheelchair Accessible' end,
    case when lower(p_tags->>'diet:vegan') in ('yes', 'only') then 'Vegan' end,
    case when lower(p_tags->>'smoking') in ('outside', 'separated', 'isolated') then 'Smoking Area' end
  ], null), '{}')
$function$;

-- Tags for an imported venue: outdoor seating (every CLUE venue), groups for
-- 20+ seats, then the OSM features. Pure.
create or replace function public.clue_venue_tags(p_outdoor_seats int, p_features text[])
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $function$
  select to_jsonb(array['Outdoor Seating']
                  || case when p_outdoor_seats >= 20 then array['Large Groups'] else '{}'::text[] end
                  || coalesce(p_features, '{}'::text[]))
$function$;

drop function if exists public.match_venue_candidates_osm(jsonb);

-- As in 20261016030000 (near / unique far / ambiguous), plus osm_features and
-- an optional p_ids scope. Only the scoped candidates are cleared and
-- rewritten; the "another candidate shares this name" check still looks at
-- every candidate. Returns the number in scope with an amenity.
create or replace function public.match_venue_candidates_osm(p_elements jsonb, p_ids text[] default null)
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
     set osm_amenity = null, osm_ref = null, osm_name = null, osm_match = null, osm_features = null
   where (p_ids is null or id = any(p_ids))
     and (osm_match is not null or osm_amenity is not null or osm_features is not null);

  with osm as (
    select e->>'type' || '/' || (e->>'id') as ref,
           e->'tags'->>'name' as name,
           e->'tags' as tags,
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
    select c.id, o.ref, o.name, o.tags, o.amenity, (o.n = c.n) as exact, st_distance(c.g, o.g) as d
    from cand c
    join osm o on length(o.n) >= 4 and length(c.n) >= 4
              and ((o.n = c.n and st_dwithin(c.g, o.g, 500))
                   or ((position(o.n in c.n) > 0 or position(c.n in o.n) > 0) and st_dwithin(c.g, o.g, 80)))
    where p_ids is null or c.id = any(p_ids)),
  near as (
    select distinct on (id) id, ref, name, tags, amenity
    from pairs where d <= 80
    order by id, exact desc, d),
  far as (
    select p.id, min(p.ref) as ref, min(p.name) as name, (array_agg(p.tags))[1] as tags,
           min(p.amenity) as amenity, count(*) as k
    from pairs p
    where p.exact and p.d > 80 and not exists (select 1 from near where near.id = p.id)
    group by p.id),
  shared as (
    select c.id from cand c
    where exists (select 1 from cand c2 where c2.id <> c.id and c2.n = c.n and st_dwithin(c.g, c2.g, 500))),
  result as (
    select id, ref, name, amenity, tags, 'near' as m from near
    union all
    select f.id,
           case when f.ok then f.ref end, case when f.ok then f.name end, case when f.ok then f.amenity end,
           case when f.ok then f.tags end,
           case when f.ok then 'far' else 'ambiguous' end
    from (select far.*, (far.k = 1 and far.id not in (select id from shared)) as ok from far) f)
  update public.venue_import_candidates v
     set osm_amenity = r.amenity, osm_ref = r.ref, osm_name = r.name, osm_match = r.m,
         osm_features = nullif(public.clue_osm_features(r.tags), '{}')
    from result r
   where v.id = r.id;

  select count(*) into n from public.venue_import_candidates
   where osm_amenity is not null and (p_ids is null or id = any(p_ids));
  return n;
end;
$function$;

-- Add any missing OSM badges to live imported venues. Only adds; never removes
-- a tag. Returns the number of venues changed.
create or replace function public.apply_clue_venue_features()
returns int
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  n int;
begin
  update public.venues v
     set tags = coalesce(v.tags, '[]'::jsonb) || to_jsonb(m.missing)
    from (select c.id, array(select f from unnest(c.osm_features) f
                             where not coalesce(vv.tags, '[]'::jsonb) ? f) as missing
            from public.venue_import_candidates c
            join public.venues vv on vv.id = c.id and vv.data_source = 'clue'
           where c.osm_features is not null) m
   where v.id = m.id and cardinality(m.missing) > 0;
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- promote_venue_candidates: as in 20261016030000, with tags from clue_venue_tags().
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
      public.clue_venue_tags(c.outdoor_seats, c.osm_features),
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


revoke all on function public.clue_osm_features(jsonb) from public, anon, authenticated;
revoke all on function public.clue_venue_tags(int, text[]) from public, anon, authenticated;
revoke all on function public.match_venue_candidates_osm(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.apply_clue_venue_features() from public, anon, authenticated;
revoke all on function public.promote_venue_candidates(text[], int) from public, anon, authenticated;
grant execute on function public.clue_osm_features(jsonb) to service_role;
grant execute on function public.clue_venue_tags(int, text[]) to service_role;
grant execute on function public.match_venue_candidates_osm(jsonb, text[]) to service_role;
grant execute on function public.apply_clue_venue_features() to service_role;
grant execute on function public.promote_venue_candidates(text[], int) to service_role;

comment on function public.match_venue_candidates_osm(jsonb, text[]) is
  'Service role only. Stores the matching OpenStreetMap venue and its badges on import candidates (all, or p_ids). Returns the number in scope with an amenity.';
comment on function public.apply_clue_venue_features() is
  'Service role only. Adds missing OpenStreetMap badges to live imported venues. Returns the number changed.';
