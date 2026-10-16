-- Hardening from the 16 Oct review: put pg_temp last on the search_path of the
-- service-role SECURITY DEFINER import functions (standard practice; they were
-- already unreachable for anon/authenticated). No behaviour change.
alter function public.place_venue_candidate(text) set search_path = public, extensions, pg_temp;
alter function public.promote_venue_candidates(text[], int) set search_path = public, extensions, pg_temp;
