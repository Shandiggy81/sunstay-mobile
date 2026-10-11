-- ============================================================
-- Migration: fix_transposed_coordinates
-- Created:   2026-09-02
-- Ticket:    Venue pins misaligned on Mapbox map after Supabase
--            migration from demoVenues.js static data.
-- Root cause: lat and lng columns were populated in reverse order
--             for a subset of venues. Impossible latitude values
--             (|lat| > 90) are the definitive signature.
-- Impact:    Only rows where lat > 90 OR lat < -90 are touched.
--            All geographically valid rows are left unchanged.
-- ============================================================

BEGIN;

-- 1. Pre-flight audit (logged to migration output)
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO affected_count
  FROM venues
  WHERE lat > 90 OR lat < -90;

  RAISE NOTICE '[fix_transposed_coordinates] Rows with impossible lat: %', affected_count;

  IF affected_count = 0 THEN
    RAISE NOTICE '[fix_transposed_coordinates] No transposed rows found - migration is a no-op.';
  END IF;
END $$;

-- 2. Swap lat <-> lng for all rows with an impossible latitude.
--    Single UPDATE avoids intermediate constraint violations.
UPDATE venues
SET
  lat = lng,
  lng = lat
WHERE
  lat > 90     -- impossible latitude (Melbourne lng ~144-145 stored as lat)
  OR lat < -90; -- impossible latitude on the southern end

-- 3. Post-flight validation - roll back if any impossible lats remain
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM venues
  WHERE lat > 90 OR lat < -90;

  IF remaining_count > 0 THEN
    RAISE EXCEPTION '[fix_transposed_coordinates] % row(s) still have impossible latitudes after swap. Rolling back.', remaining_count;
  ELSE
    RAISE NOTICE '[fix_transposed_coordinates] All coordinates validated. Migration successful.';
  END IF;
END $$;

COMMIT;
