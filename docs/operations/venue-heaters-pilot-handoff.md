# Venue Heaters Pilot Handoff

18 November 2026. Branch: `codex/venue-heaters-pilot-20261118`.

## Status And Scope

Implemented a heaters-only publishing path for independently enrolled hospitality managers. It is **not yet available to real managers in production**. No hosted database write, Auth email, migration, deployment, merge, setting change or manual microclimate refresh was performed.

Verified starting and pre-publication main: `25d5424910198dbb2d3d1e9c75cfbe1975a7a532`. PR #313 is merged. Netlify's current production deploy `6afd47949a1265cf62114486` reports that same commit, published at `2026-11-18T06:37:49.939Z`. This was checked, not inferred from GitHub main. Draft #312 remains open at `63da172`; it was not modified or included. Other open PRs were #303 (wind/sun UI) and #96 (map tracing). Historical auth/partner branches exist; their names are not proof of an active parallel publishing implementation. Unpublished work in another agent's workspace remains unverified.

Read-only schema inspection found no manager-membership, named guest-area or staff-report store. Existing `venue_outdoor_points` are measurement geometry, not guest areas, and remain untouched.

The smallest complete slice is heaters for an approved named area. Fireplace, staff-observed sunny tables, specials, permanent-access editing, hotel publication and real bookings are not added by this change. Existing partner previews, mascots, clay assets, sun calculations, weather freshness handling and map recovery are preserved.

Changed files (25 total):

| Group | Paths |
| --- | --- |
| Existing integration | `src/App.jsx`, `src/components/VenueCard.jsx`, `src/components/Map/VenueMap.jsx`, `src/utils/venueFeaturePin.js` |
| New UI | `src/components/VenueManagerPanel.jsx`, `src/components/GuestAreaHeaters.jsx`, `src/components/DemoAreaBooking.jsx`, `src/components/common/VenueActionDialog.jsx`, `src/components/VenuePublishing.css` |
| New data/helpers | `src/hooks/usePublishedVenueReports.js`, `src/utils/venueAreaReports.js`, `src/utils/venuePublishing.js`, `src/utils/demoAreaBooking.js` |
| Unit/SQL tests | `src/utils/venueAreaReports.test.js`, `src/utils/demoAreaBooking.test.js`, `src/utils/venuePublishingSql.test.js` |
| Isolated browser/DB fixtures | `scripts/venue-pilot/database.mjs`, `e2e/venue-pilot/publishing.spec.js`, `e2e/fixtures/venue-pin.html`, `playwright.venue-pilot.config.js` |
| Handoff/proposal/evidence | `docs/operations/venue-heaters-pilot-handoff.md`, `docs/proposals/venue-area-heaters.sql`, `docs/screenshots/venue-heaters-pilot/manager-390.png`, `docs/screenshots/venue-heaters-pilot/guest-390.png`, `docs/screenshots/venue-heaters-pilot/pin-renderer-390.png` |

## Useful In The First 60 Seconds Today

This table describes **main/production at the verified commit**, not the proposed publishing rollout.

| Partner | First screen and action | What saves / what a guest sees | Biggest gap |
| --- | --- | --- | --- |
| Pub/bar | Actual card > Run this venue > Today. Read next service; add an event or special; preview the real guest card. | Partner tools save in this browser. The embedded guest preview reflects the edit; another device does not receive it. | No authenticated shared publishing or area-specific current-condition feed. |
| Cafe | Today, with morning service and a cafe special rather than a pub's events workflow. | Cafe special persists locally and appears in that device's real-card preview. | No separate guest publication or returning-manager account flow. |
| Hotel | Room sun. Name two room types, choose building sides and compare a date; shared pool is separate. | Local room definitions and guest-card preview. Geometry remains modelled, not hotel/on-site verified. | No shared inventory, verified mixed orientations within a room category, or true stay-date booking. |
| Short stay/home | Your home. Inspect one home's balcony; identify another outdoor area and its shared/private access. | Local answers and the real guest preview. | No shared host publication or supported monthly historical sunshine series. Missing inventory is not a real enrolled property. |

The new hospitality path is distinct: **Manage this venue** opens sign-in and approved area selection. The older **Run ...?** entry still opens the explicitly device-local preview. A local preview is not treated as publication. Legacy warmth notes now say "Partner preview on this device", not "Set by the venue".

## Data And Permission Boundary

`VenueCard` > `VenueManagerPanel` > Supabase email OTP > `get_managed_venue_areas` > `publish_venue_area_heaters` > private PostgreSQL tables > public read RPC > shared report hook > card and pin.

- Identity comes only from `auth.uid()`. Neither venue IDs nor editable user metadata confer a role. The write RPC locks and checks an active manager membership and an active, approved area belonging to that venue.
- Proposed tables separate verified memberships, named guest areas and expiring reports. They do not alter `venues`, access instructions, building geometry or weather data. All three have RLS and explicit grants revoked; the identity sequence is also revoked.
- Narrow security-definer RPCs are intentional gateways to private tables, with fixed search paths, explicit identity/role checks for management and no dynamic SQL. Public readers return only area/report display fields. No email, actor ID, verification detail, request ID or draft is exposed. Public EXECUTE defaults are explicitly revoked before granting each permitted endpoint.
- Status is boolean, area names are bounded to 80 characters, duration is restricted to 30/60/120/240 minutes, and timestamps/source are assigned by the server. Default report duration is two hours.
- A request UUID is stable across retries. Conflicting reuse is rejected; per-publisher locking protects retry/rate checks and area locking orders publications. The limit is 12 new reports per publisher per minute. Double taps are blocked in the UI too.
- No optimistic success: timeout/error/unusable acknowledgement remains unconfirmed. A retry can confirm a transaction whose HTTP acknowledgement was lost without inserting another row.
- Public reads select the latest publication before checking expiry and active membership. A newer expired "off" cannot resurrect an older "on". Drafts never replace the public publication.
- One shared visible-app poll runs every 15 seconds, with a 10-second request deadline. Unchanged results keep stable references. Unsupported endpoints stop routine polling until visibility/publication triggers a retry. Reports have a local expiry timer even when subsequent reads fail; no cleanup job is required for expiry correctness.
- A report for Terrace never supplies a Courtyard claim. The card names the selected area, venue-staff source, explicit update time and expiry. The pin's accessible label identifies the reported areas and times; its heating marker uses the same validated reports. A venue's stored whole-venue "on" flag is not publication.
- The demo booking retains venue/area/time/party, labels both stages as demo and makes no booking request, contact collection, payment, notification or inventory hold. Its separate sessionStorage count is **not** central analytics or a genuine booking/enquiry count.

## Proposed Database Change And Approval Gate

SQL is in `docs/proposals/venue-area-heaters.sql`, deliberately **outside `supabase/migrations/`**. It has only been executed against an isolated, in-memory PostgreSQL database. Do not apply it to a hosted project from this handoff.

Before production approval:

1. Review the proposed private schema/RPC permissions, public function ownership and grants against a disposable real Supabase stack; run security advisors. PGlite exercises PostgreSQL permissions, not Supabase's HTTP/JWT gateway or platform configuration.
2. Generate a migration with an approved installed Supabase CLI; check reconciled migration history. Keep any production migration application and frontend deployment behind separate explicit approval.
3. Independently verify a handful of Melbourne managers in person or via a published venue phone. Obtain approved named areas. Enrol existing Auth accounts and active memberships through an approved staff operation, not self-claim. No such records were created here.
4. Verify actual email OTP delivery, SMTP, rate limits, approved email template containing `{{ .Token }}`, and sign-out/session handling. `shouldCreateUser: false` is deliberate. The code-entry UI will not work with an unmodified magic-link-only template. No production email was sent.
5. Verify browser public Supabase configuration without adding privileged keys. Confirm private schema is not exposed and the real gateway derives claims from validated tokens, not request parameters.
6. Approve the rollout explicitly, then test with two real accounts/devices before widening enrolment. Continue the separate microclimate recovery work; hiding a stale reading is not proof of fresh weather.

Public reads are bounded to 500 reports and 20 areas per venue. Keep this pilot below those limits; pagination, history retention/cleanup, abuse/load testing and broader onboarding need a separate design before expansion. Role revocation/new "off" propagation can take one visible-app polling interval; expiry is also enforced locally. Device clock error remains an operational caveat. A restored app can retain a timestamped report only until its original expiry, never renew it locally.

## Validation

No project dependency or package/lock file was changed. An **already installed** PGlite 0.3.16 in the Netlify CLI cache supplied isolated PostgreSQL. Test identities, sign-in codes and synthetic tokens are generated at runtime and are not committed or logged. Browser tracing is disabled for this auth fixture. Every external browser request is intercepted; no hosted RPC or weather provider receives test traffic.

| Check | Result |
| --- | --- |
| Full `npm test`, with `PGLITE_MODULE` set | 1,735 passed, 0 failed, 0 skipped |
| Isolated SQL boundary tests (included above) | 10 passed including parent; denied signed-out/guest/other-manager/mismatched-area writes, private reads/sequence/direct venue mutation, invalid payloads/names/lifetimes, retry/conflict, drafts/hidden areas, expiry ordering, revocation, rate limit and unchanged permanent facts |
| Pilot Playwright, separate manager/guest contexts | Passed at 390 x 844. Actual entry/sign-in SDK/publish RPC/shared SQL read; unconfirmed save and retry; duplicate taps; reload; area-specific demo choice; offline expiry; focus containment while busy and return on close; heating marker even with unknown sun score. Manager controls also checked at 320/375/390/430 widths for overflow and >=44px targets. |
| Separate guest propagation sample | 10,652 ms after manager confirmation, no guest refresh. This is a local sample, not a production latency SLA. Normal polling bound is 15 seconds plus network/processing. |
| Weather requests caused by publication | Zero in the isolated browser flow; client publisher imports/calls no weather API. |
| Production build | Passed with existing >500 kB chunk advisory. |
| Existing mobile smoke suite | 89 passed, 0 failed, 1 skipped in 9.3 minutes. The optional pilot test is skipped in the ordinary smoke configuration; its dedicated SQL-backed run passed separately. |
| Diff whitespace | `git diff --check` clean. |

The browser fixture emulates the trusted Auth gateway to map a synthetic session to a PostgreSQL claim, then calls the **actual proposed SQL functions** under anon/authenticated roles. It does not prove real email delivery, hosted JWT verification, multi-connection lock scheduling, production plan settings, full Mapbox positioning, WebGL recovery or physical-device behaviour.

No full axe scan was run for the new dialogs; keyboard/focus, accessible control roles, phone-width overflow and touch targets were checked. Physical iPhone Safari, mobile data, keyboard/safe-area behaviour and background/foreground testing are pending. Full Mapbox camera/pin placement is pending because no public Mapbox token was available in this local environment.

Repeat with existing dependencies and an installed runtime (the module path is machine-specific):

```powershell
$env:PGLITE_MODULE = 'ABSOLUTE_PATH_TO_INSTALLED_PGLITE/dist/index.js'
node --test src/utils/venuePublishingSql.test.js
npm test
npm run build
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npx playwright test --config playwright.venue-pilot.config.js
Remove-Item Env:PGLITE_MODULE
npm run test:smoke
git diff --check
```

Without `PGLITE_MODULE`, the SQL unit test and SQL-backed browser test explicitly skip. CI therefore does not automatically reproduce those checks unless an isolated runtime is supplied; ordinary CI green is not database security proof. No test dependency installation is implicit in these commands.

Screenshots contain **synthetic reports/areas on the demo Mr Tulk listing, not real staff observations**:

- [Manager at 390px](../screenshots/venue-heaters-pilot/manager-390.png)
- [Separate guest at 390px](../screenshots/venue-heaters-pilot/guest-390.png)
- [Actual pin DOM renderer at 390px](../screenshots/venue-heaters-pilot/pin-renderer-390.png) (fixture without basemap/camera, not a live Mapbox screenshot)

## Usage And Cost Boundaries

**A$300/month is a planning target, not a verified or enforced all-in cap.** No account invoice, contractual plan, exchange rate, tax treatment, actual production API volume or global budget gate was verified here. Netlify reports plan identifier `nf_team_pro`; that alone does not establish which current/legacy billing terms apply. The read-only environment inventory returned no usable result, so production enablement/credentials for optional providers remain unverified. Values were not printed or added to the repo.

| Trigger | Repository evidence / cost implication |
| --- | --- |
| Open the map | `VenueMap.jsx` creates `mapboxgl.Map`: this is a **web GL JS map**, including on iPhone/PWA, not native-SDK MAU metering. Remounts/reloads can create loads. `locationSearch.js` also calls Mapbox geocoding; `MapErrorBoundary.jsx` can request a static map. No global app-side Mapbox allowance stop was verified. |
| Header/forecast and venue detail | `WeatherContext.jsx` / `weatherService.js` cache Open-Meteo for 30 minutes at 2dp geographic keys; this is browser-local, not a global shared quota. `useOpenMeteo` reads shared context. Detail-card forecasts and air-quality data can fetch on a cold/missing cache once forecast detail is enabled. The weather client prefers `/functions/v1/weather` when configured, then allows direct public Open-Meteo fallback on failure/non-OK. A proxy limit is therefore not an all-path weather stop. |
| Optional weather/radar | `useTomorrowRain.js` (15-minute cache), `useOpenUV.js` (one-hour cache), OpenWeather cloud tiles and Xweather MapsGL radar are conditional on configured keys and UI use. `useOpenAQ.js` uses Open-Meteo air quality; RainViewer is another radar source. Production credential validity, active paid subscriptions and actual usage were not verified. |
| Nobody browsing | The existing microclimate job is scheduled every 20 minutes: up to 72 dispatches/day or 2,160 in a 30-day month before failures/retries. It can fetch Open-Meteo and write Supabase while guest traffic is zero. This is a schedule calculation, not measured successful invocations or upstream billed calls. No schedule/TTL/sky/geometry change is included. |
| New manager report | Auth requests plus one publish RPC; **zero weather-provider requests**. Each visible guest tab polls public reports four times/minute (240 reads per visible guest-hour), plus area lookup on opening a card. These are request-count estimates, not bill estimates. Hidden tabs do not intentionally poll. |
| Hosting and database | Netlify serves assets and the crawler preview edge function; Supabase serves venue/bbox/profile/report RPCs, Auth and scheduled weather functions. Egress, compute, storage/history, abuse traffic and email delivery have costs outside a count of listed venues. |

Current public terms checked on 18 November 2026, not the project's contracted entitlements:

- [Mapbox pricing](https://www.mapbox.com/pricing): GL JS starts with 50,000 monthly loads free; the next 50,000 tier is US$5/1,000. Other products have separate meters. No account-specific hard stop was verified.
- [Open-Meteo pricing](https://open-meteo.com/en/pricing): free endpoint is non-commercial/evaluation; commercial use requires a licence. Customer plans have fixed monthly call budgets; stated alerts are not an enforced application budget cutoff. Confirm pilot commercial permission before promotion. Do not describe public fallback as a licensed commercial plan.
- [Netlify pricing](https://www.netlify.com/pricing/) and [credit-plan rules](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/): the credit-based Free plan has a 300-credit hard limit; that is **not A$300**, and this project reports a Pro identifier. Paid plans can have recharge/overage behaviour. Verify the actual account and auto-recharge configuration before estimating cost.
- [Supabase pricing](https://supabase.com/pricing) and [cost control](https://supabase.com/docs/guides/platform/cost-control): Pro starts at US$25/month. Its spend cap covers certain usage items, not every cost. The actual project plan, cap status, compute/add-ons and email charges remain unverified.

Do not promise the pilot is capped. A separate approved cost task should verify provider dashboards/terms and build server-side usage accounting with headroom and an optional-refresh circuit breaker. Preserve timestamped staff reports and calculated clear-sky windows if paid forecasts pause; preserve list browsing if maps pause. Nearby forecast reuse already exists at browser geographic resolution; any server-wide reuse must respect provider terms and correct resolution. No broad analytics/budget redesign was added to this slice.

Listed venues are not enrolled pilot venues. The proposed membership store can establish enrolment, but no real partners were enrolled. Report history could later support aggregate returning-manager measures under an approved privacy/retention plan. The local demo counter does not establish investor traction, genuine enquiries or cost per customer. Those evidence gaps remain explicit.

## Rollback And Exact Phone Sequence

There is nothing to roll back in production from this task. For a separately approved rollout: capture the actual deployed app revision and schema grants first. If faulty, obtain approval to disable publishing EXECUTE for authenticated users and revert the frontend to that captured revision. Leave the private history and permanent venue/geometry data intact. Keep public expiry enforcement; do not extend TTL to make old reports look current. Remove new objects only in a later reviewed migration after readers/writers stop and retention/export is decided. Never drop or rewrite `venues`, Auth accounts or measurement geometry as a shortcut.

Keep `[skip netlify]` on the draft PR title and publication commit to suppress previews/branch deployment. Current CI only tests/builds; Supabase's inspected Preview check says per-PR branch creation is disabled, and branch inventory contains only main. No automatic migration is supplied. A future merge still deploys frontend code and needs separate approval; do not mark this draft ready merely because tests pass.

**After** the schema/Auth/enrolment/deployment and real-device checks are approved, the shortest repeatable sequence is:

1. Phone one: search the enrolled venue > open its actual card > **Manage this venue**.
2. Manager: email > **Send sign-in code** > enter code > **Sign in**. Returning signed-in managers skip this step.
3. **Guest area: Terrace** > **Heaters on** > choose duration > **Publish update**. Wait for the named-area confirmed publication message.
4. Phone two in a separate guest session: open the same venue > **Choose an area: Terrace**. Within the poll interval, check venue-staff source, update time and expiry; check the matching heating pin, then reload.
5. Select the desired area > **Book this area - Demo** > time/party > **Confirm demo choice**. Confirm the same area and "No real booking was made". Let the report expire and verify it disappears without refresh.

This sequence is a rollout acceptance recipe, **not a claim that today's production app can already complete it**. The local SQL-backed automated run demonstrates the app/database contract; a founder can inspect the saved screenshots and rerun the test now, but handing a live phone to a manager remains blocked on the approvals and pending checks above.
