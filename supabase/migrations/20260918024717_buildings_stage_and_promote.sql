create table if not exists public.buildings_stage (
  osm_id bigint primary key,
  geom_geojson text not null,
  height_m real not null default 6,
  levels real,
  city text
);

create or replace function public.promote_buildings_stage()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  insert into public.buildings as b (osm_id, geom, height_m, levels, source, city, updated_at, ingested_at)
  select
    s.osm_id,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(s.geom_geojson), 4326)),
    s.height_m,
    s.levels,
    'osm',
    coalesce(s.city, 'melbourne'),
    now(),
    now()
  from public.buildings_stage s
  where s.geom_geojson is not null
  on conflict (osm_id) do update set
    geom = excluded.geom,
    height_m = excluded.height_m,
    levels = excluded.levels,
    city = excluded.city,
    updated_at = now();

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.promote_buildings_stage() to service_role, postgres;