-- PROPOSED ONLY: do not apply or merge without explicit approval.
-- SECURITY INVOKER intentionally needs the column grants and OSM-only SELECT
-- policy below. These also allow direct Data API reads of those public columns.
-- No writes, ingest/admin RPCs, building-stage access or private columns are granted.

create or replace function public.buildings_near(
    lat double precision,
    lng double precision,
    radius_m double precision default 100
)
returns table (id uuid, footprint jsonb, height_m real)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
    location extensions.geography;
begin
    if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180
        or radius_m is null or radius_m not between 1 and 500 then
        raise exception 'Valid lat/lng and radius_m between 1 and 500 metres are required' using errcode = '22023';
    end if;
    location := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;
    return query
        select b.id, extensions.st_asgeojson(b.geom)::jsonb, b.height_m
        from public.buildings as b
        where b.source = 'osm'
          and extensions.st_dwithin(b.geom::extensions.geography, location, radius_m)
        order by extensions.st_distance(b.geom::extensions.geography, location), b.id
        limit 200;
end;
$$;

revoke all on function public.buildings_near(double precision, double precision, double precision) from public, anon, authenticated;
revoke all on table public.buildings from public, anon, authenticated;
alter table public.buildings enable row level security;

create policy buildings_osm_footprints_read on public.buildings
    for select to anon, authenticated
    using (source = 'osm');

grant select (id, geom, height_m, source) on table public.buildings to anon, authenticated;
grant execute on function public.buildings_near(double precision, double precision, double precision) to anon, authenticated;

comment on function public.buildings_near(double precision, double precision, double precision) is
    'Read-only, caller-RLS OSM footprint/height lookup; radius 1-500m, at most 200 rows. Requires approval before application.';
