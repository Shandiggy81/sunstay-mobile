-- REVIEW ONLY: do not apply without explicit migration/deployment approval.
-- Additive: old apply_microclimate_weather remains untouched for rollback.
-- No backfill, geometry changes, cron changes, or extensions.
begin;
create function public.apply_microclimate_weather_bulk_v1(
  p_rows jsonb, p_ttl_minutes integer default 30
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '2s'
as $$
declare
  item jsonb;
  field text;
  expected integer;
  written integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'weather batch must be an array';
  end if;
  expected := jsonb_array_length(p_rows);
  if expected < 1 or expected > 200 or p_ttl_minutes is distinct from 30 then
    raise exception 'invalid weather batch size or TTL';
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) <> 'object'
       or jsonb_typeof(item->'venue_id') is distinct from 'string'
       or length(item->>'venue_id') = 0
       or jsonb_typeof(item->'comfort_hint') is distinct from 'string'
       or item->>'comfort_hint' not in ('sunny_calm','sunny_breezy','shaded_calm','shaded_breezy') then
      raise exception 'invalid weather row';
    end if;
    foreach field in array array['wind_speed_10m','wind_direction_deg','cloud_cover_pct',
      'effective_sun','effective_wind','wind_shelter_score'] loop
      if jsonb_typeof(item->field) is distinct from 'number' then
        raise exception 'missing or nonnumeric weather field';
      end if;
    end loop;
    if not ((item->>'wind_speed_10m')::numeric between 0 and 150
       and (item->>'wind_direction_deg')::numeric between 0 and 360
       and (item->>'cloud_cover_pct')::numeric between 0 and 100
       and (item->>'effective_sun')::numeric between 0 and 1
       and (item->>'effective_wind')::numeric between 0 and 300
       and (item->>'wind_shelter_score')::numeric between 0 and 1) then
      raise exception 'weather field out of range';
    end if;
  end loop;
  if (select count(distinct value->>'venue_id') from jsonb_array_elements(p_rows)) <> expected then
    raise exception 'duplicate venue in weather batch';
  end if;

  -- One set-based write. Only weather columns are touched. Refuse missing
  -- profiles rather than recreate a deleted profile without its morphology.
  update public.microclimate_profiles as m set
    wind_speed_10m = w.wind_speed_10m,
    wind_direction_deg = w.wind_direction_deg,
    cloud_cover_pct = w.cloud_cover_pct,
    effective_sun = w.effective_sun,
    effective_wind = w.effective_wind,
    wind_shelter_score = w.wind_shelter_score,
    comfort_hint = w.comfort_hint,
    weather_computed_at = statement_timestamp(),
    expires_at = statement_timestamp() + make_interval(mins => p_ttl_minutes),
    updated_at = statement_timestamp()
  from jsonb_to_recordset(p_rows) as w(
    venue_id text, wind_speed_10m real, wind_direction_deg real,
    cloud_cover_pct real, effective_sun real, effective_wind real,
    wind_shelter_score real, comfort_hint text
  ) where m.venue_id = w.venue_id;
  get diagnostics written = row_count;
  if written <> expected then
    -- Exception rolls back the entire call, including any matched rows.
    raise exception 'weather batch contains missing profiles';
  end if;
  return written;
end;
$$;
revoke all on function public.apply_microclimate_weather_bulk_v1(jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.apply_microclimate_weather_bulk_v1(jsonb, integer)
  to service_role;
comment on function public.apply_microclimate_weather_bulk_v1(jsonb, integer) is
  'Service-role-only atomic validated weather update, max 200 rows, TTL 30m. Preserves geometry and legacy RPC.';
commit;
