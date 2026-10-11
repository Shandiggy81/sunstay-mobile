create or replace function public.upsert_buildings_batch(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r jsonb;
  n int := 0;
  g geometry;
begin
  for r in select * from jsonb_array_elements(p_rows)
  loop
    if r ? 'geom_geojson' and nullif(r->>'geom_geojson','') is not null then
      g := ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(r->>'geom_geojson'), 4326));
    elsif r ? 'geom_wkt' and nullif(r->>'geom_wkt','') is not null then
      g := ST_Multi(ST_SetSRID(ST_GeomFromText(r->>'geom_wkt'), 4326));
    else
      continue;
    end if;

    if g is null or ST_IsEmpty(g) then
      continue;
    end if;

    -- Force MultiPolygon
    if GeometryType(g) = 'POLYGON' then
      g := ST_Multi(g);
    end if;

    insert into public.buildings as b (
      osm_id, geom, height_m, levels, source, city, updated_at, ingested_at
    ) values (
      (r->>'osm_id')::bigint,
      g,
      coalesce((r->>'height_m')::real, 6),
      nullif(r->>'levels','')::real,
      coalesce(nullif(r->>'source',''), 'osm'),
      nullif(r->>'city',''),
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

revoke all on function public.upsert_buildings_batch(jsonb) from public;
grant execute on function public.upsert_buildings_batch(jsonb) to service_role, postgres, authenticated;