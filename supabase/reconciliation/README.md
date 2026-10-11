# Supabase migration reconciliation (review only)

Status: **review in progress — nothing in this folder has been applied.**
Production project: `fksuqgvsazoxarocmaii` ("Sunstay global v2"), the project the
live site (`sunstayglobal30.netlify.app`) uses.

This folder sits outside `supabase/migrations/`, so the Supabase CLI ignores it.

## Do not run `supabase db push`

The active `supabase/migrations/` directory does **not** match production.
`db push` would find 11 recorded production versions with no local file and
would try to apply local files production never recorded, including one that
creates a public write policy on `venues`. It stays unsafe until the plan below
is finished.

## Production vs repository (as of 2026-10-11)

Production stores the original SQL for every recorded migration in
`supabase_migrations.schema_migrations.statements`. Hashes below are MD5 of
that SQL (LF line endings) and of the local file after CRLF→LF.

| Production version | Name | Local file | Match |
|---|---|---|---|
| 20260912024052 | add_venues_image_url | — | production only |
| 20260917092106 | venues_in_bbox | `20260917_venues_in_bbox.sql` | byte-identical, different version |
| 20260917093834 | harden_venues_policies | `20260917_harden_venues_policies.sql` | byte-identical, different version |
| 20260917095111 | venues_in_bbox_hourly | `20260917_venues_in_bbox_hourly.sql` | byte-identical, different version |
| 20260918023917 | buildings_multipolygon_osm | — | production only |
| 20260918024612 | upsert_buildings_batch_rpc | — | production only |
| 20260918024717 | buildings_stage_and_promote | — | production only |
| 20260918034131 | seed_venue_morphology_buildings | — | production only |
| 20260918034213 | fix_seed_venue_morphology_empty_nearby | — | production only |
| 20260918034428 | schedule_enrich_microclimate_cron | — | production only; contains an anon JWT |
| 20260918035613 | venues_in_bbox_melbourne_local_hour | `20260918035957_venues_in_bbox_melbourne_local_hour.sql` | same function body; comments, `int`/`integer`, `create`/`create or replace` and the COMMENT text differ; different version |

Local only (never recorded in production):

- `20260901000000_create_venues_table.sql` — creates `"Allow public write on venues"` (FOR ALL, `true`). Production has no such policy. Must never be replayed.
- `20260902_fix_transposed_coordinates.sql`

Local version collisions: three files share the prefix `20260917`, and
`20260902` is not a 14-digit version.

Production-only objects (not defined anywhere in the repo):

- Tables `public.buildings`, `public.buildings_stage`
- Functions `upsert_buildings_batch(jsonb)`, `promote_buildings_stage()`,
  `seed_venue_morphology(text, real, real[])`, `seed_melbourne_morphology()`
- Column `venues.image_url`
- pg_cron job `enrich-microclimate-every-20m` (every 20 min, runs as `postgres`)
- Edge Function `enrich-microclimate` (v5, `verify_jwt = true`, service-role client)

## Containment already applied (2026-10-11, by hand in the SQL Editor)

Revoked EXECUTE on the three exposed SECURITY DEFINER functions from
PUBLIC/anon/authenticated, enabled RLS on `buildings` and `buildings_stage`,
and revoked all table privileges on both from PUBLIC/anon/authenticated.
`proposed/20261011120000_lockdown_morphology_and_buildings.sql` records the same
statements so the fix is not lost. It is idempotent.

Separate, unapproved: `proposed/search_path_hardening.sql`.

## Reconciliation plan

Each step needs approval. None touches production except read-only fetches.

1. Move every file in `supabase/migrations/` to `supabase/migrations_archive/`.
2. Recreate the 11 production migrations under their exact production versions,
   from `supabase migration fetch --linked` (read-only) or from the verified,
   redacted review copies. Check each against the production hash.
3. In the cron migration, replace the embedded anon JWT and project URL with
   Vault lookups (`vault.decrypted_secrets`) or a documented placeholder.
   **Never commit the literal JWT.**
4. Run `supabase migration list` and confirm local and remote match exactly.
5. Add the corrective migration from `proposed/`. Because production already
   has these grants, record it with `supabase migration repair --status applied
   20261011120000` instead of pushing it.
6. Add `supabase/functions/enrich-microclimate/index.ts` from the deployed v5
   source and `[functions.enrich-microclimate] verify_jwt = true` to
   `supabase/config.toml`.
7. Only then consider `db push` for new work.

Files to review before step 1: all of `supabase/migrations/`,
`supabase/config.toml`, `supabase/functions/`, `supabase/seeds/`,
`scripts/seedVenues.js` (falls back to the anon key), `CLAUDE.md`.

## Least privilege per process

| Process | Role |
|---|---|
| Browser app | `anon`: SELECT on `venues` / `microclimate_profiles` via RLS, EXECUTE on `venues_in_bbox`, invoke `chat-sunny` |
| pg_cron job | runs as `postgres`; only makes the HTTP call, needs no function grants |
| `enrich-microclimate` | `service_role`: SELECT on `microclimate_profiles` + `venues`, EXECUTE on `apply_microclimate_weather` |
| Building / morphology ingest | `service_role`, from a trusted script or the SQL Editor |
| `chat-sunny` | no database access |

Open follow-ups: the cron job authenticates with the public anon key, so anyone
can trigger enrichment. A shared secret checked by the function would close
that. The function also returns internal error messages in its 500 response.
