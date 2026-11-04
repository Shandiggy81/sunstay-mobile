-- ============================================================
-- Migration: revoke anon/authenticated write privileges on the venue tables
-- Created:   2026-11-04
-- ============================================================

-- public.venues and public.venue_outdoor_points still carry Supabase's
-- default grants: anon and authenticated hold SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER on both tables.
--
-- RLS is on for both tables and each has a single public SELECT policy, so an
-- INSERT, UPDATE or DELETE sent with the anon key (it ships in the client
-- bundle) is already rejected. TRUNCATE, REFERENCES and TRIGGER are not
-- covered by RLS, so the privileges themselves are the last line of defence.
--
-- Nothing needs them. The app and sunstay-admin only read these tables.
-- enrich-microclimate uses the service role. The import and label functions
-- that write venues (promote_venue_candidates, apply_clue_venue_features,
-- relabel_clue_venues) are SECURITY DEFINER and anon and authenticated cannot
-- execute them. Revoking a table privilege also revokes the matching column
-- privileges. SELECT stays, so the public read policies keep working.
revoke insert, update, delete, truncate, references, trigger
  on table public.venues, public.venue_outdoor_points
  from anon, authenticated;
