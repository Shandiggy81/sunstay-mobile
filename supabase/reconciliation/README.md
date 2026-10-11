# Supabase migration reconciliation (review only)

Status: **reconciled.** Steps 1–5 are done. On 2026-10-11, `supabase migration
repair --status applied 20261011120000` recorded the corrective migration
without running it, and `supabase migration list` now shows all 12 versions on
both sides. No migration SQL was pushed.
Production project: `fksuqgvsazoxarocmaii` ("Sunstay global v2"), the project the
live site (`sunstayglobal30.netlify.app`) uses.

This folder sits outside `supabase/migrations/`, so the Supabase CLI ignores it.

## `supabase db push`

`supabase/migrations/` matches production's recorded history exactly, so
`db push` has nothing to apply. Before pushing new work, run
`supabase migration list` and confirm the only local-only versions are the new
ones you mean to push.

## Production vs repository before reconciliation (2026-10-11)

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
`supabase/migrations/20261011120000_lockdown_morphology_and_buildings.sql` records
the same statements so the fix is not lost. It is idempotent.

Separate, unapproved: `proposed/search_path_hardening.sql`.

## Reconciliation plan

Each step needs approval. None touches production except read-only fetches.

1. Done: moved every file in `supabase/migrations/` to `supabase/migrations_archive/`.
2. Done: recreated the 11 production migrations under their exact production
   versions from the verified, redacted review copies. Each matches the
   production hash.
3. Done: the cron migration reads the project URL and anon key from Vault
   (`vault.decrypted_secrets`). **Never commit the literal JWT.**
4. Done: `supabase migration list` showed `20261011120000` as the only
   local-only version and nothing remote-only.
5. Done: recorded the corrective migration with `supabase migration repair
   --status applied 20261011120000`; `migration list` then matched on both sides.
6. Done: added `supabase/functions/enrich-microclimate/index.ts` (the deployed
   v5 source, unchanged) and `[functions.enrich-microclimate] verify_jwt = true`
   to `supabase/config.toml`. Nothing was deployed.
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
