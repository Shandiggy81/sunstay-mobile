-- ============================================================
-- NOT APPLIED — proposed corrective migration (review only)
--
-- Records the containment already run by hand in the Supabase SQL Editor
-- on 2026-10-11, so a future rebuild or `supabase db reset` cannot bring the
-- exposure back. Every statement is idempotent, so applying it on top of the
-- already-contained production database changes nothing.
--
-- Why: the project's default privileges grant EXECUTE on new public
-- functions, and all table privileges on new public tables, to anon and
-- authenticated by name. Migrations 20260918024717 and 20260918034131 only
-- revoked from PUBLIC, which leaves those named grants in place, and
-- 20260918023917 / 20260918024717 created buildings and buildings_stage
-- without RLS.
--
-- Do not move this into supabase/migrations/ until the migration history
-- is reconciled (see ../README.md). search_path hardening is a separate
-- proposal: ./search_path_hardening.sql.
-- ============================================================

revoke execute on function public.seed_venue_morphology(text, real, real[]) from public, anon, authenticated;
revoke execute on function public.seed_melbourne_morphology()               from public, anon, authenticated;
revoke execute on function public.promote_buildings_stage()                 from public, anon, authenticated;

alter table public.buildings       enable row level security;
alter table public.buildings_stage enable row level security;

revoke all on table public.buildings, public.buildings_stage from public, anon, authenticated;
