-- ============================================================
-- Migration: harden public.venues RLS policies
-- Created:   2026-09-17
-- ============================================================

-- 1. Drop the public UPDATE policy.
--    "Allow public updates for demo" was PERMISSIVE, role public, using (true),
--    which let anyone holding the anon key (it ships in the client bundle)
--    rewrite every column of every venue row.
--
--    OwnerDashboard.jsx issues four venue updates through the browser client.
--    They are all optimistic: local state and the "Saved" flash happen before
--    the request, and the result is swallowed by a catch that logs
--    "(ignored for demo)". RLS makes a blocked UPDATE match zero rows rather
--    than error, so PostgREST still returns success and nothing is even
--    logged. The dashboard keeps working; owner edits simply stop persisting
--    and become session-local until those writes move behind an authenticated
--    role or a service_role endpoint.
drop policy if exists "Allow public updates for demo" on public.venues;

-- 2. Drop the duplicate SELECT policy.
--    "Allow public read access" and "Allow public read access on venues" were
--    both PERMISSIVE, role public, using (true) — byte-identical in effect.
--    Postgres evaluates every permissive policy for each row, which is what
--    the multiple_permissive_policies advisor flags. Dropping the unqualified
--    one leaves read access unchanged and keeps the naming consistent with
--    the microclimate tables.
drop policy if exists "Allow public read access" on public.venues;
