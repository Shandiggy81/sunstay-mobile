-- ============================================================
-- Group City of Melbourne building parts into whole buildings.
--
-- The 2023 Building Footprints split a building into parts (podium, tower,
-- plant room...): 10,942 of 19,326 buildings have more than one part. Without
-- a grouping key, room-level shading treats a hotel's own tower as a neighbour.
--
-- Additive only: a nullable structure_ref column + index, the loader RPC now
-- writes it, and a service-role-only backfill RPC for rows already loaded.
-- Loads no data. public.buildings stays locked to anon/authenticated.
-- ============================================================

alter table public.buildings add column if not exists structure_ref text;

comment on column public.buildings.structure_ref is
    'Groups the parts of one building, e.g. com2023:s815949 (City of Melbourne structure_id). Null for OSM rows.';

create index if not exists buildings_structure_ref_idx
    on public.buildings (structure_ref) where structure_ref is not null;

-- Same as 20261014130000, plus structure_ref.
create or replace function public.upsert_city_buildings_batch(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
    r jsonb;
    g extensions.geometry;
    n int := 0;
begin
    if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
        raise exception 'p_rows must be a JSON array of at most 1000 rows' using errcode = '22023';
    end if;
    for r in select * from jsonb_array_elements(p_rows)
    loop
        if nullif(r->>'source_ref', '') is null or r->>'source_ref' not like 'com2023:%'
            or nullif(r->>'geom_geojson', '') is null then
            continue;
        end if;
        g := extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(r->>'geom_geojson'), 4326));
        if g is null or extensions.st_isempty(g) or not extensions.st_isvalid(g) then
            g := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(g), 3));
        end if;
        if g is null or extensions.st_isempty(g) then
            continue;
        end if;
        if (r->>'height_m')::real is null or (r->>'height_m')::real not between 0.5 and 400 then
            continue;
        end if;

        insert into public.buildings as b (osm_id, source_ref, structure_ref, geom, height_m, base_m, levels, source, city, superseded, ingested_at, updated_at)
        values (null, r->>'source_ref', nullif(r->>'structure_ref', ''), g, (r->>'height_m')::real, coalesce((r->>'base_m')::real, 0),
                null, 'com2023', 'melbourne', false, now(), now())
        on conflict (source_ref) where source_ref is not null do update set
            geom = excluded.geom,
            height_m = excluded.height_m,
            base_m = excluded.base_m,
            structure_ref = coalesce(excluded.structure_ref, b.structure_ref),
            updated_at = now();
        n := n + 1;
    end loop;
    return n;
end;
$$;

-- Backfill for rows loaded before this migration: pairs of [objectid, structure_id].
-- Touches only structure_ref on existing com2023 rows. Returns rows updated.
create or replace function public.set_city_structure_refs(p_pairs jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
    n int;
begin
    if jsonb_typeof(p_pairs) <> 'array' or jsonb_array_length(p_pairs) > 10000 then
        raise exception 'p_pairs must be a JSON array of at most 10000 [objectid, structure_id] pairs' using errcode = '22023';
    end if;
    update public.buildings as b
       set structure_ref = 'com2023:s' || p.structure_id, updated_at = now()
      from (
          select e->>0 as objectid, e->>1 as structure_id
            from jsonb_array_elements(p_pairs) as e
           where jsonb_typeof(e) = 'array' and nullif(e->>0, '') is not null and (e->>1) ~ '^[0-9A-Za-z_-]{1,40}$'
      ) as p
     where b.source = 'com2023'
       and b.source_ref = 'com2023:' || p.objectid
       and b.structure_ref is distinct from 'com2023:s' || p.structure_id;
    get diagnostics n = row_count;
    return n;
end;
$$;

revoke all on function public.upsert_city_buildings_batch(jsonb) from public, anon, authenticated;
revoke all on function public.set_city_structure_refs(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_city_buildings_batch(jsonb) to service_role;
grant execute on function public.set_city_structure_refs(jsonb) to service_role;
