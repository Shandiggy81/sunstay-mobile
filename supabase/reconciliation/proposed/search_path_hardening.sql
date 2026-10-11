-- ============================================================
-- NOT APPLIED — separate proposal, not part of the corrective migration
--
-- Low priority. All four functions schema-qualify every table they touch,
-- anon/authenticated cannot CREATE in public or extensions, and Postgres
-- never resolves functions through pg_temp unless it is listed. Pinning
-- pg_catalog first and pg_temp last matches apply_microclimate_weather and
-- removes any remaining doubt. extensions stays in the path because the
-- PostGIS ST_* calls are unqualified.
--
-- Review each function body before applying. Needs its own approval.
-- ============================================================

alter function public.seed_venue_morphology(text, real, real[]) set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.seed_melbourne_morphology()               set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.promote_buildings_stage()                 set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.upsert_buildings_batch(jsonb)             set search_path = pg_catalog, public, extensions, pg_temp;
