-- Baseline microclimate profiles for the Melbourne venues.
--
-- Placeholder morphology, not measured geometry: every venue gets the same
-- curve, which is why geometry_confidence is 0.2. Re-run freely, it upserts.
--
-- TIME BASE
-- venues_in_bbox reads
--   sun_hour_fraction[extract(hour from now() at time zone 'Australia/Melbourne') + 1],
-- so the stored array is indexed by Melbourne wall-clock hour (AEST/AEDT via
-- the TZ). Slot 1 = 00:00 Melbourne. Storing a UTC-rotated curve would put
-- peak sun at 19:00-22:00 Melbourne and zero sun at 08:00-12:00.

with local_curve as (
  -- Melbourne local hour 0..23. Dawn at 06:00, plateau 09:00-12:00,
  -- fading out by 16:00.
  select '{0,0,0,0,0,0,0.1,0.4,0.8,1.0,1.0,1.0,1.0,0.9,0.7,0.3,0,0,0,0,0,0,0,0}'::real[] as a
)
insert into public.microclimate_profiles (
  venue_id, sun_score_annual, sun_hour_fraction, canyon_aspect_hw,
  wind_exposure_by_sector, geometry_confidence, source_sun, source_wind,
  geometry_computed_at, updated_at
)
select
  v.id,
  0.65,
  (select a from local_curve),
  0.5,
  -- Compass sectors N, NE, E, SE, S, SW, W, NW. Direction-indexed, so unlike
  -- the sun curve this needs no time rotation.
  '{0.6, 0.7, 0.9, 1.0, 0.8, 0.5, 0.4, 0.4}'::real[],
  0.2,
  'heuristic_melbourne_seed',
  'heuristic_melbourne_seed',
  now(),
  now()
from public.venues v
where v.lat between -38.0000 and -37.7000
  and v.lng between 144.8500 and 145.1000
on conflict (venue_id) do update set
  sun_score_annual        = excluded.sun_score_annual,
  sun_hour_fraction       = excluded.sun_hour_fraction,
  canyon_aspect_hw        = excluded.canyon_aspect_hw,
  wind_exposure_by_sector = excluded.wind_exposure_by_sector,
  geometry_confidence     = excluded.geometry_confidence,
  source_sun              = excluded.source_sun,
  source_wind             = excluded.source_wind,
  geometry_computed_at    = excluded.geometry_computed_at,
  updated_at              = excluded.updated_at;
