-- ============================================================
-- Seed: Sydney morphology heuristics -> microclimate_profiles
-- Created: 2026-09-17
--
-- Populates heuristic sun/wind morphology for venues inside the Sydney
-- bounding box (lat -33.95..-33.75, lng 151.10..151.30).
--
-- Idempotent: re-running refreshes the heuristic columns for matched venues
-- and leaves the live weather columns (wind_speed_10m, effective_sun, ...)
-- alone, since those are owned by apply_microclimate_weather.
--
-- TIME BASE
-- venues_in_bbox reads sun_hour_fraction[extract(hour from now() at utc) + 1],
-- so the stored array is indexed by UTC hour. The curve below is written in
-- Sydney local hours, then rotated into UTC. Storing the local curve directly
-- would report peak sun at 19:00-22:00 Sydney and zero sun at 08:00-12:00.
-- The offset is fixed at +10 (AEST), so values run one hour late while AEDT
-- is in effect. See the Melbourne seed for the same caveat.
-- ============================================================

WITH local_curve AS (
  -- Sydney local hour 0..23.
  SELECT '{0,0,0,0,0,0,0.1,0.4,0.8,1.0,1.0,1.0,1.0,0.9,0.7,0.3,0,0,0,0,0,0,0,0}'::real[] AS a
),
utc_curve AS (
  SELECT array(
    SELECT lc.a[((h + 10) % 24) + 1]
    FROM generate_series(0, 23) AS h
  )::real[] AS a
  FROM local_curve lc
)
INSERT INTO public.microclimate_profiles (
  venue_id, sun_score_annual, sun_hour_fraction, canyon_aspect_hw,
  wind_exposure_by_sector, geometry_confidence, source_sun, source_wind,
  geometry_computed_at, updated_at
)
SELECT
  id, 0.65, (SELECT a FROM utc_curve),
  -- Compass sectors N..NW; direction-indexed, so no time rotation.
  0.5, '{0.6, 0.7, 0.9, 1.0, 0.8, 0.5, 0.4, 0.4}'::real[], 0.2,
  'heuristic_sydney_seed', 'heuristic_sydney_seed', now(), now()
FROM public.venues
WHERE lat BETWEEN -33.9500 AND -33.7500
  AND lng BETWEEN 151.1000 AND 151.3000
ON CONFLICT (venue_id) DO UPDATE SET
  sun_score_annual = EXCLUDED.sun_score_annual,
  sun_hour_fraction = EXCLUDED.sun_hour_fraction,
  canyon_aspect_hw = EXCLUDED.canyon_aspect_hw,
  wind_exposure_by_sector = EXCLUDED.wind_exposure_by_sector,
  geometry_confidence = EXCLUDED.geometry_confidence,
  source_sun = EXCLUDED.source_sun,
  source_wind = EXCLUDED.source_wind,
  geometry_computed_at = EXCLUDED.geometry_computed_at,
  updated_at = EXCLUDED.updated_at;
