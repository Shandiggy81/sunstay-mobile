-- Align venues_in_bbox with live microclimate_profiles columns and Melbourne local hour.
-- Sun curve slots are wall-clock hours for Australia/Melbourne (AEST/AEDT via AT).

drop function if exists public.venues_in_bbox(double precision, double precision, double precision, double precision, integer, smallint, smallint);

create or replace function public.venues_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  p_limit integer default 500,
  p_hour smallint default null,
  p_month smallint default null
)
returns table (
  id text,
  name text,
  slug text,
  category text,
  lng double precision,
  lat double precision,
  sun_score_annual real,
  sun_now real,
  wind_shelter_score real,
  effective_wind real,
  effective_sun real,
  comfort_hint text,
  canyon_aspect_hw real,
  geometry_confidence real,
  weather_computed_at timestamptz,
  sun_hour_fraction real[]
)
language sql
stable
security invoker
set search_path to public, extensions, pg_temp
as $$
  with params as (
    select
      coalesce(
        p_hour,
        extract(hour from now() at time zone 'Australia/Melbourne')::smallint
      ) as hour_local,
      coalesce(
        p_month,
        extract(month from now() at time zone 'Australia/Melbourne')::smallint
      ) as month_local,
      least(greatest(coalesce(p_limit, 500), 1), 2000) as lim
  )
  select
    v.id,
    v."venueName" as name,
    null::text as slug,
    v."typeCategory" as category,
    v.lng,
    v.lat,
    m.sun_score_annual,
    coalesce(
      m.effective_sun,
      case
        when m.sun_hour_fraction is not null
          then m.sun_hour_fraction[(select hour_local from params) + 1]
        else null
      end
    ) as sun_now,
    m.wind_shelter_score,
    m.effective_wind,
    m.effective_sun,
    m.comfort_hint,
    m.canyon_aspect_hw,
    m.geometry_confidence,
    m.weather_computed_at,
    m.sun_hour_fraction
  from public.venues v
  left join public.microclimate_profiles m on m.venue_id = v.id
  where v.lat between min_lat and max_lat
    and v.lng between min_lng and max_lng
  order by v.id
  limit (select lim from params);
$$;

comment on function public.venues_in_bbox(double precision, double precision, double precision, double precision, integer, smallint, smallint) is
  'Mapbox viewport query: venues in bbox with cached microclimate. Hour defaults to Australia/Melbourne wall-clock (AEST/AEDT).';

grant execute on function public.venues_in_bbox(double precision, double precision, double precision, double precision, integer, smallint, smallint)
  to anon, authenticated, service_role;