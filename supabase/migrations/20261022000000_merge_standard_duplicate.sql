-- ============================================================
-- Merge the two rows for The Standard Hotel, 293 Fitzroy Street, Fitzroy.
--
-- dv-23 "The Standard" and df-10 "The Standard Hotel" are the same pub (same
-- address and website; flagged in 20261021000000_label_curated_venues.sql).
-- Keep dv-23: it has the address, curated tags, heating and vibe.
-- Retire df-10: it only has placeholder-era fields.
--
-- But df-10 has the right location. OpenStreetMap way 228466557 ("Standard
-- Hotel, 293 Fitzroy Street") is at -37.8007515, 144.9768301, exactly df-10's
-- point. dv-23 sits about 360 m north (-37.7975, 144.9772), so its building
-- horizon and sun hours were computed for the wrong street. So:
--   1. move dv-23 to the OSM point;
--   2. give dv-23 the building geometry df-10 already has for that point
--      (the weather columns refresh on the next 20-minute enrich run);
--   3. delete df-10 (its microclimate profile cascades; it has no outdoor points).
--
-- Guards: each step runs only while the rows still look as checked on
-- 22 Oct 2026, so a later hand edit is never overwritten and a rerun changes
-- nothing. Read-only checks that day: no other table references either id,
-- neither has outdoor points, no triggers on venues, and every guard matched
-- exactly one row. The Supabase CLI runs each migration file in one transaction.
-- ============================================================

-- 1. Correct location, only while dv-23 still has the old point.
update public.venues
   set lat = -37.8007515,
       lng = 144.9768301,
       updated_at = now()
 where id = 'dv-23'
   and lat = -37.7975
   and lng = 144.9772
   and exists (select 1 from public.venues where id = 'df-10'
               and lat = -37.8007515 and lng = 144.9768301);

-- 2. Building geometry for the correct point, copied from df-10's profile.
update public.microclimate_profiles as keep
   set sun_horizon_deg         = src.sun_horizon_deg,
       sun_hour_fraction       = src.sun_hour_fraction,
       sun_score_annual        = src.sun_score_annual,
       sun_score_monthly       = src.sun_score_monthly,
       sky_view_proxy          = src.sky_view_proxy,
       canyon_aspect_hw        = src.canyon_aspect_hw,
       wind_exposure_by_sector = src.wind_exposure_by_sector,
       wind_shelter_score      = src.wind_shelter_score,
       geometry_confidence     = src.geometry_confidence,
       geometry_computed_at    = src.geometry_computed_at,
       source_sun              = src.source_sun,
       source_wind             = src.source_wind
  from public.microclimate_profiles as src
 where keep.venue_id = 'dv-23'
   and src.venue_id = 'df-10'
   and exists (select 1 from public.venues where id = 'dv-23'
               and lat = -37.8007515 and lng = 144.9768301);

-- 3. Retire the duplicate, only once dv-23 carries the correct point.
delete from public.venues
 where id = 'df-10'
   and "venueName" = 'The Standard Hotel'
   and exists (select 1 from public.venues where id = 'dv-23'
               and lat = -37.8007515 and lng = 144.9768301);
