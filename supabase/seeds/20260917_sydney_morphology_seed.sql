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
-- venues_in_bbox indexes sun_hour_fraction by Australia/Melbourne wall-clock
-- hour. Sydney shares that offset (AEST/AEDT), so the stored array is the
-- local 0..23 curve with no UTC rotation. Slot 1 = 00:00 local.
-- ============================================================

WITH local_curve AS (
  -- Sydney local hour 0..23.
  SELECT '{0,0,0,0,0,0,0.1,0.4,0.8,1.0,1.0,1.0,1.0,0.9,0.7,0.3,0,0,0,0,0,0,0,0}'::real[] AS a
)
INSERT INTO public.microclimate_profiles (
  venue_id, sun_score_annual, sun_hour_fraction, canyon_aspect_hw,
  wind_exposure_by_sector, geometry_confidence, source_sun, source_wind,
  geometry_computed_at, updated_at
)
SELECT
  id, 0.65, (SELECT a FROM local_curve),
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
