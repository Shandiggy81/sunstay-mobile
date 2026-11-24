# Microclimate reliability — review and rollout gate

Prepared 17 November 2026. Code review only. No Supabase project migration,
function deployment, schedule, secret, setting or production record was changed.
The SQL tests execute only against an ephemeral, in-memory PGlite database.

## Baseline and publishing safeguards

- Main inspected and re-fetched at `aaf10ce83674e4a3e12c863a1ce5fe648289797d`.
- Isolated branch: `codex/microclimate-reliability-20261117`.
- Existing oldest-first branch is already contained in main. Open PRs #309,
  #303 and #96 concern UI/diagnostics; they were not edited or incorporated.
- `.github/workflows/ci.yml` is the only repository workflow: pull requests to
  main and pushes to main run dependency installation, tests, build and smoke
  tests. No deployment, migration or secrets-writing steps. No branch-create
  trigger. Package installation/build scripts contain no deployment commands.
- Netlify builds a preview for every PR. These microclimate PRs first kept
  `[skip netlify]` in their commit messages and titles to suppress previews.
  Main's ruleset requires the `netlify/sunstayglobal30/deploy-preview` check,
  so a PR marked that way can't merge. Since 23 November 2026, PRs leave the
  marker out (see "Deploy checks" in AGENTS.md). A Netlify preview builds only
  the frontend and deploys nothing to Supabase. Merging is still the step that
  redeploys Edge Functions, and it needs the owner's approval.
  Official rule: https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/
- The connected Supabase Preview check on PR #309, check ID `133683455438`,
  completed as **skipped** on 16 November 2026 at 23:11 UTC, with the explicit
  provider message: “Creating a new preview branch per PR is disabled. You can
  re-enable it in Project Integrations Settings.” This is stronger evidence
  than inferring behavior from a UI-only PR. The project branch listing also
  contained only main. The integration settings page required sign-in, so
  the provider check is the verification source; settings were not modified.
  Evidence: https://api.github.com/repos/Shandiggy81/sunstay-mobile/check-runs/133683455438
- These observations assume nobody changes external integration settings
  between verification and publishing. Reverify them before future pushes.

## Exact changed files

1. `supabase/functions/enrich-microclimate/index.ts`: per-invocation adapter,
   refresh-ahead/keyset selection, abortable Supabase calls, new bulk RPC,
   sanitized structured response/log.
2. `supabase/functions/enrich-microclimate/reliability.js`: bounded execution,
   upstream retries, validation, paging, deduplication, bulk orchestration.
3. `supabase/functions/enrich-microclimate/scoring.js`: original scoring and
   Melbourne-hour functions extracted without mathematical changes.
4. `supabase/migrations/20261117140000_microclimate_weather_bulk_v1.sql`:
   additive, unapplied project migration containing only a new restricted RPC.
5. `src/utils/enrichMicroclimateReliability.test.js`: 23 reliability tests,
   automatically included by existing `npm test` glob.
6. `scripts/testMicroclimateMigration.mjs`: isolated PostgreSQL validation.
7. `docs/operations/microclimate-reliability-review.md`: this review/rollout plan.

`sky.js`, all building/geometry migrations, UI, booking code, Netlify config,
Supabase config, cron migration and the original single-row RPC are unchanged.

## Behavior and budgets

The old job selected at most 200 already-expired profiles, waited indefinitely
on Open-Meteo, matched rounded response-grid coordinates to requested cells,
and replaced unmatched or missing readings with calm/default values. It then
issued one RPC per venue. The new path:

- Uses a monotonic 45-second invocation deadline, leaving 15 seconds before
  pg_net's configured 60-second HTTP timeout. This is a handler budget; runtime
  cold starts, import loading, event-loop stalls and platform overhead are
  outside it. Production latency still needs measurement.
- Bounds each Open-Meteo attempt to 7 seconds across headers AND JSON body.
  Abort plus a promise deadline also handles transports that ignore abort.
  At most two attempts, with 250ms backoff. Retries only timeout/network/429/5xx
  failures, and only if another full attempt plus a 5-second write reserve
  fits. Retry-After causes deferral to the next scheduled invocation rather
  than retrying too early. Invalid JSON and other 4xx are not retried.
- Bounds each database selection/write to 4 seconds and the remaining overall
  budget, including the SDK's response-body consumption. A write that times
  out may have committed: it is NOT retried or counted as confirmed success.
- Selects null expiry or expiry <= invocation start +22 minutes, using a fixed
  cutoff. Pages by expiry (null first, oldest first), then venue ID for ties
  (composite keyset, not OFFSET); gathers pages before
  any writes. Default page size 200. Configured hints must be safe integers >=50;
  the effective page size is capped at 500 so legacy whole-run settings such as
  600 remain compatible without increasing per-request work. Hard caps: 2,000
  profiles and 40 pages. There is deliberately no self-invocation or schedule change.
- Deduplicates requested 0.05-degree cells across all selected pages. Fetches
  at most 80 locations per request, then writes valid rows in batches <=200.
- Requires response cardinality to equal the requested chunk. Associates by
  request order, checking optional location_id against its request index and
  coordinates within 15km of the request. The output is keyed by the REQUEST
  cell, not the returned weather-model grid coordinate. Multiple request
  cells may legitimately share a returned grid point.
- Relies on the provider's ordered multi-location JSON contract. Nearby
  permutations within 15km without location_id cannot be independently
  detected. No nearest-neighbor reassignment is attempted. The 15km bound is
  a conservative Melbourne-focused assumption, not a global model guarantee;
  validate it before expansion. Gross mismatches reject the whole chunk.
- Validates UTC Unix timestamps (integer, at most 30 minutes old / 5 minutes
  ahead), interval 1–3600 seconds and explicit units. Strict finite numeric
  ranges: wind 0–150m/s, direction 0–360 degrees, cloud 0–100%, optional solar
  radiation 0–1500W/m². Numeric strings, nulls and NaN are not weather.
- Requires wind speed, direction and cloud for a write. Missing optional
  radiation uses the existing reported-cloud fallback; existing sky math is
  unchanged. Essential missing data skips the venue without extending TTL.
  True numeric zero remains zero, including zero speed and north wind.
- Validates calculated scores before writing. Invalid morphology-derived
  results are skipped rather than persisted as plausible weather.
- Logs only fixed error codes, selected/updated/skipped/unprocessed counts,
  cells, pages, weather attempts/retries/failures, numeric HTTP status counts,
  fixed weather-error counts, bulk failures, unknown write
  outcome, capacity flag and elapsed milliseconds. No raw errors, credentials,
  request bodies, URLs or provider response bodies. Partial/capped/failed runs
  return 503 with `ok:false`; fully completed runs return 200.
- Configuration failures keep `code: invalid_config`; `invalid_config_field`
  contains only `ENRICH_BATCH_SIZE` or `ENRICH_TTL_MINUTES`, never the supplied
  value. It is null otherwise. Batch size is checked first if both settings
  are invalid. Absent settings still default to page size 200 and TTL 30.

Open-Meteo coordinate/unit documentation: https://open-meteo.com/en/docs

## Freshness assumptions and capacity

With the existing 20-minute cadence and 30-minute TTL, a successful refresh
normally has about 10 minutes left at the following run. Selecting 22 minutes
before expiry avoids the old wait-until-expired gap, allowing 2 minutes of
schedule jitter plus the sub-minute execution budget before the next cycle.
Only an already healthy schedule, adequate capacity, and successful valid
upstream data can maintain continuous freshness. An upstream outage cannot
truthfully be hidden by extending old data or manufacturing calm weather.

The 1,081-profile fixture completes in six default 200-row read pages and,
when sharing one weather chunk, six bulk writes. It is a synthetic capacity
test, not a production timing benchmark or a fresh production count.
Required time is approximately:

`selection time + sum(weather attempt/backoff times) + sum(bulk write times) <45s`

Actual write-call count is the sum of `ceil(valid venues in each weather
chunk /200)`, which can exceed `ceil(total venues /200)` for dispersed venues.
At 80 cells/request, 2,000 unique cells could require 25 upstream requests;
that is not a promised supported workload within 45 seconds. Worst-case
per-operation timeouts also do not all fit together: the overall deadline
wins and reports incompletion. The write reserve guarantees room for one
bounded write, not every outstanding batch.

All due profiles must fit each run. At/above 2,000 due profiles, capacity is
reported conservatively even if exactly 2,000 exist. Oldest-expiry ordering prioritizes unfinished profiles over ones already
refreshed by earlier runs. Permanently failing profiles can still consume
capacity; this is not a durable retry/dead-letter queue. Do not enable this for an oversized/dispersed population until
partitioning/capacity is separately designed and approved. Profiles arriving or externally modified
behind the current expiry/ID cursor wait until the next invocation. Overlapping manual
runs can repeat writes; the normal 20-minute cron cannot overlap a healthy
45-second run. No lease/table/schedule was added in this change.

TTL means time since validated enrichment, not observation time. Accepted
observations may already be up to 30 minutes old. The existing schema does not
store observation timestamps; that limitation is not disguised as live data.

## Migration review

`apply_microclimate_weather_bulk_v1(jsonb, integer)` is a new SECURITY DEFINER
function with a pinned `pg_catalog, pg_temp` search_path; all table references
are schema-qualified. EXECUTE is explicitly revoked from PUBLIC, anon and
authenticated (including Supabase default grants), then granted to service_role.
It rejects non-array/empty/>200 batches, duplicate or empty venue IDs, wrong
JSON types, null/missing fields, invalid score/weather ranges, unknown comfort
hints and TTL other than exactly 30 minutes. It validates the entire batch
before one set-based UPDATE. Missing target profiles raise an exception and
roll back all matched rows. It intentionally does not recreate a deleted
profile without morphology. Weather-only columns and timestamps change.
Geometry, source labels and schema structure stay intact. A 2-second lock
wait limit reduces contention; this is not a universal server execution limit.

The original `apply_microclimate_weather` RPC and its signature, definition
and grants remain intact. The migration contains no backfill or schedule
changes. It must be applied BEFORE deploying this new Edge Function, following
separate explicit approval. Do not replay all historical migrations as part
of this rollout: some historical files contain production data operations.

## Follow-up review fixes

- Selection now uses expiry NULLS FIRST, then ascending expiry and venue ID.
  The cursor carries both expiry and ID; null-to-timestamp transitions and
  equal-expiry boundaries are covered. All filter literals are quoted and
  escaped, and one combined predicate retains the fixed refresh cutoff.
- With the third batch failing in each of three 20-minute cycles, cumulative
  coverage is now 400, 800, then all 1,081 profiles (previously 400 every cycle).
  This proves recovery progress, not continuous freshness during failures.
- Selection counters update after each accepted row. A failed second page
  after 50 successful reads now reports selected=50 and unprocessed=50.
- New tests also check the actual SDK-generated request filters and ordering.
  No hosted database request is made by these tests.
- GitHub CI on the original PR commit passed all 77 browser smoke tests,
  resolving the earlier local browser startup limitation for that commit.
  Follow-up commit CI must be checked independently.

## Actual verification

- `npm ci`: succeeded; repository lockfile unchanged.
- `npm test`: **1,660 passed, 0 failed**, including 23 reliability tests.
- Isolated PostgreSQL/PGlite migration suite: **8 passed, 0 failed** (parent
  test plus 7 subtests). Checks legacy definition equality, grants and denied
  calls, geometry preservation, zero values, TTL, validation and atomic rollback.
- `npm run build`: passed. Existing >500kB bundle advisory remains.
- Strict TypeScript check of the Edge adapter against the exact npm
  `@supabase/supabase-js@2.45.4` typings: passed. Used a temporary copy with the
  esm.sh import mapped to that package and minimal Deno environment declarations;
  this does not validate esm.sh delivery or the deployed Deno environment.
- Native `deno check`: blocked by connection refusal to the unchanged esm.sh
  SDK import. Full runtime verification remains a deployment prerequisite.
- Browser smoke tests attempted: **77 failed at browser launch**, before test
  assertions, due to `socket() failed: Operation not permitted`. The managed
  Chromium download also failed (invalid/truncated ZIP). No UI assertions
  passed in this environment; repeat on a working browser runner.
- `git diff --check`: passed.
- No live Edge Function invocation, staging write or production write performed.

To repeat the isolated SQL tests without adding a project dependency:

```sh
npm install --prefix /tmp/sunstay-migration-test --no-package-lock @electric-sql/pglite@0.5.16
PGLITE_MODULE=file:///tmp/sunstay-migration-test/node_modules/@electric-sql/pglite/dist/index.js node --test scripts/testMicroclimateMigration.mjs
```

Confirm the installed PGlite version if using another release. This script
creates its own in-memory database and accepts no database connection URL.
It is an explicit supplemental check, not part of npm test or hosted CI.

## Prerequisites and staged rollout — NOT AUTHORIZED YET

1. Review this diff and migration, then explicitly approve the specific merge,
   migration target and deployment actions. Keep the PR draft until review
   and missing runtime/browser checks are complete. Review Netlify behavior
   before any merge: a merge can deploy the client independently of Supabase.
2. On an explicitly approved isolated Supabase development environment, verify
   actual schema/grants and existing function compatibility; run native Deno
   checking and the browser suite. Record the deployed old function revision
   and known-good bundle for rollback. Do not infer it equals latest main.
3. Verify cadence really is 20 minutes and pg_net timeout 60 seconds, eligible
   count <2,000, observed cell dispersion, valid ENRICH_BATCH_SIZE (safe integer
   >=50 or unset, capped to 500 per page), ENRICH_TTL_MINUTES (30 or unset), and
   production p95/p99 timings.
   No settings or schedules were changed in this task.
4. With separate migration approval, apply ONLY the additive migration to the
   approved development target. Verify anon/authenticated denial, service-role
   access, atomicity and legacy RPC availability there.
5. With separate deployment approval, deploy the function to that target and
   test a representative fixture first, then a >=1,081-profile load. Observe
   at least three 20-minute cycles; require no expiry gaps for eligible valid
   rows, no capped/deadline/unknown-outcome events, and handler p99 <45 seconds
   (operational target <35 seconds for headroom). Check stale counts separately;
   `updated` is only confirmed writes, not a freshness guarantee.
6. Present evidence and obtain explicit production approval. Apply the new RPC
   first, verify grants, then deploy the function. Keep the existing schedule
   and TTL. Monitor durations, skips, failures, upstream statuses in sanitized
   diagnostics, due backlog and actual expiry coverage for at least one hour.
   Do not mask failures by lengthening TTL. Roll back if the criteria fail.

## Failure alerting (Sentry Crons)

Incident, 16–23 Nov 2026: refreshes failed for about six and a half days and
nothing alerted anyone; the app quietly fell back to estimates. From 22:40 UTC
on 16 Nov the old function mostly hit the platform limit (HTTP 546, 13 good
runs in between). From 01:00 UTC on 18 Nov, after #310 deployed, every run
rejected the production `ENRICH_BATCH_SIZE` as `invalid_config`. The fix, #312,
was opened within two hours but deployed at 09:36 UTC on 23 Nov. The next run
succeeded.

`checkin.js` sends one Sentry Crons check-in per run: `ok` when the run returns
`ok: true`, `error` for anything else. A run that never reports (killed, cron or
pg_net stopped, broken deploy) is marked missed after the 10-minute margin. The
monitor settings travel with each check-in, so Sentry creates the monitor on
the first one. Two bad runs in a row (about 40 minutes) open an issue, and one
good run resolves it. The check-in is capped at 3 seconds, never throws and
never logs the DSN. A test keeps its schedule equal to the pg_cron job.

It stays off (`"checkin":"off"` in the run log) until the `SENTRY_CRON_DSN`
function secret is set. Every Sentry plan includes one cron monitor, and this
organisation had none on 24 Nov 2026, so it should cost nothing.

To switch it on (production settings: each step needs the owner's approval):

1. Merge the PR. This redeploys the function; with no secret nothing changes.
2. Set the function secret `SENTRY_CRON_DSN` to the Sentry project's DSN (the
   same value as Netlify's `VITE_SENTRY_DSN`), in Supabase under Edge Functions
   → Secrets.
3. After the next 20-minute run, confirm the run log shows `"checkin":"sent"`
   and Sentry → Crons lists `enrich-microclimate` with an OK check-in.
4. In Sentry → Alerts, connect an alert to that monitor that emails the owner.
   Monitor failures open issues, but nobody is notified without an alert.

Unit tests: `node --test src/utils/enrichMicroclimateCheckin.test.js`.

## Step-by-step rollback — future approved rollout only

1. Before any production rollout, save the exact currently deployed function
   bundle/revision and environment inventory securely; do not include secrets
   in this repository. Keep the existing single-row RPC intact.
2. If the new RPC migration alone has been applied, leave it unused and keep
   the old function running. No data backfill needs reversing.
3. If the new Edge Function is failing, obtain rollback deployment approval
   and redeploy the previously captured function bundle. Verify it calls the
   original single-row RPC and preserves existing schedule/settings.
4. Allow the already-running invocation to settle (45-second caller deadline;
   an uncertain DB write might finish later). Check function logs and recent
   confirmed database timestamps before assuming writes have stopped.
5. Verify old RPC access, old function health and weather provenance. The old
   version restores its old 200-row/expired-only limitations; rollback alone
   does not solve the original freshness incident.
6. Leave the additive bulk RPC installed and unused by default. If removal is
   explicitly approved AFTER confirming no running/new code uses it, remove
   only `public.apply_microclimate_weather_bulk_v1(jsonb, integer)` in a new
   reviewed migration. Never drop the original RPC or edit applied history.
7. Do not restore or delete weather/production records automatically. A bad
   cached result should be replaced by an approved valid refresh; any manual
   production correction requires its own explicit approval. No geometry or
   UI rollback is needed because neither was changed.
