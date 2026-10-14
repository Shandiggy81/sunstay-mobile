# Proposed database changes

Files here are NOT applied. Merging to `main` cannot push them to production.
Each needs explicit approval; to apply one, move it into `supabase/migrations/`
with a timestamped name and follow the migration checks in CLAUDE.md.

Retired: `buildings_near_readonly.sql` (a public read RPC on `public.buildings`)
was dropped in favour of keeping the table locked and computing room profiles
server-side. See `supabase/migrations/20261014130000_city_of_melbourne_buildings.sql`.
