# Archived migrations — do not apply

These six files used to live in `supabase/migrations/`. They were moved here on
2026-10-11 because they don't match the migration history recorded in
production (`fksuqgvsazoxarocmaii`). The Supabase CLI ignores this folder.

- `20260901000000_create_venues_table.sql` was never recorded in production, and
  it creates `"Allow public write on venues"` (FOR ALL, `using (true)`), which
  would let anyone with the anon key insert, update or delete venues.
  **Never replay it.**
- `20260902_fix_transposed_coordinates.sql` was never recorded in production.
- `20260917_harden_venues_policies.sql`, `20260917_venues_in_bbox.sql` and
  `20260917_venues_in_bbox_hourly.sql` are byte-identical to production's
  `20260917093834`, `20260917092106` and `20260917095111`, but they used versions
  that collide with each other and don't match production.
- `20260918035957_venues_in_bbox_melbourne_local_hour.sql` has the same function
  body as production's `20260918035613`, but different comments and version.

`supabase/migrations/` now holds production's history under its real versions.
See `supabase/reconciliation/README.md`.
