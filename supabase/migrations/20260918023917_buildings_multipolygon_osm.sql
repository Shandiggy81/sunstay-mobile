-- OSM building footprints (MultiPolygon) for microclimate morphology

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  osm_id bigint,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  height_m real not null default 6,
  levels real,
  source text not null default 'osm',
  city text,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If an older Polygon table exists, widen to MultiPolygon
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'buildings' and column_name = 'geom'
  ) then
    begin
      alter table public.buildings
        alter column geom type extensions.geometry(MultiPolygon, 4326)
        using extensions.ST_Multi(geom);
    exception when others then
      -- already MultiPolygon or empty cast path
      null;
    end;
  end if;
end $$;

alter table public.buildings add column if not exists osm_id bigint;
alter table public.buildings add column if not exists height_m real;
alter table public.buildings add column if not exists levels real;
alter table public.buildings add column if not exists source text;
alter table public.buildings add column if not exists city text;
alter table public.buildings add column if not exists ingested_at timestamptz;
alter table public.buildings add column if not exists updated_at timestamptz;

alter table public.buildings alter column height_m set default 6;
alter table public.buildings alter column source set default 'osm';
alter table public.buildings alter column ingested_at set default now();
alter table public.buildings alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'buildings_osm_id_key'
  ) then
    alter table public.buildings
      add constraint buildings_osm_id_key unique (osm_id);
  end if;
end $$;

create index if not exists buildings_geom_gix
  on public.buildings using gist (geom);

create index if not exists buildings_city_idx
  on public.buildings (city);

create or replace function public.upsert_buildings_batch(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
  n int := 0;
  g extensions.geometry;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    -- Prefer GeoJSON; fall back to WKT
    if r ? 'geom_geojson' and nullif(r->>'geom_geojson', '') is not null then
      g := extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(r->>'geom_geojson'), 4326));
    else
      g := extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromText(r->>'geom_wkt'), 4326));
    end if;

    -- Skip non-polygonal / empty
    if g is null or extensions.ST_IsEmpty(g) then
      continue;
    end if;

    insert into public.buildings as b (
      osm_id, geom, height_m, levels, source, city, updated_at, ingested_at
    ) values (
      (r->>'osm_id')::bigint,
      g::extensions.geometry(MultiPolygon, 4326),
      coalesce((r->>'height_m')::real, 6),
      nullif(r->>'levels', '')::real,
      coalesce(nullif(r->>'source', ''), 'osm'),
      nullif(r->>'city', ''),
      now(),
      now()
    )
    on conflict (osm_id) do update set
      geom = excluded.geom,
      height_m = excluded.height_m,
      levels = excluded.levels,
      source = excluded.source,
      city = excluded.city,
      updated_at = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.upsert_buildings_batch from public;
grant execute on function public.upsert_buildings_batch to service_role;

comment on table public.buildings is
  'OSM building MultiPolygons + height_m for canyon/shadow precompute. Offline ingest only.';