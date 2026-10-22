# After Dark home sheet

Mobile Chromium with touch emulation, Melbourne timezone and reduced motion,
at **390×844** and **320×568**. Baseline main `df61e5d` includes PR #236.

| State | 390×844 | 320×568 |
| --- | --- | --- |
| Events near the map centre | [Events](events-390.png) | [Events](events-320.png) |
| First event: 18+, price, weather, fireplace pairing and Tickets | [Event details](event-details-390.png) | [Event details](event-details-320.png) |
| No events | [Empty](empty-390.png) | [Empty](empty-320.png) |
| Quota error with Retry | [Error](error-390.png) | [Error](error-320.png) |
| Loading skeletons | [Loading](loading-390.png) | — |

The list scrolls inside the sheet. At 320×568, the detail capture scrolls the
first event's fireplace pairing and Tickets into view. Empty/error actions fit
without scrolling at both sizes. The mode control, heading, filters and
attribution stay visible while the results scroll. Captures wait for sheet and
scrim animations to finish.

## Fixtures and method

- The harness starts its own Vite server with the repository's existing **fake,
  test-only Supabase settings**, never a real key or project. Every external
  request is blocked except the intercepted Open-Meteo and `events-tonight`
  requests. No database writes are made.
- `fixtures.mjs` supplies a raw Ticketmaster response, not pre-normalized rows.
  The application's real `fetchEventsTonight` and existing normalizer run. Its
  four fictional events are only browser fixtures; they are not application
  sample events or a fallback feed.
- The clock is fixed to **19 October 2026, 6pm Melbourne**, and `fetchedAt` is 6pm.
  The first fixture event starts at 7pm, is explicitly 18+, has a known AUD $45
  minimum, and is placed at CQ City Bar's location. CQ City Bar (`dv-09`) is an
  existing sample venue whose own data declares a fireplace. The engine's exact
  pairing line is shown; no claim is made that the fire is lit.
- A free family event, a comedy event with no price, and a theatre event exercise
  the category and Free filters. Unknown price produces no “From” price.
- Existing weather parsing runs on a deterministic Open-Meteo forecast:
  14°, dry, 25km/h wind at showtime. The city forecast is labelled. Ticketmaster
  does not declare exposure, so the engine returns no outdoor advice for these
  raw responses and the UI does not invent any.
- Empty data is an empty successful response. The screenshot error is an HTTP
  429 with `quota_exhausted`; a separate aborted-network check verifies the same
  honest generic error and a successful Retry.
- No Mapbox token is configured, so the map cannot draw real tiles or pins.
  The list uses the configured initial Melbourne centre. To exercise movement,
  the harness calls the existing MicroclimateContext `setBbox` action through
  development React state; no map, marker, lifecycle or WebGL code is patched
  and no map is simulated.

## Browser assertions

At both viewport sizes:

- Sun peek makes zero `events-tonight` requests. Opening After Dark fetches once.
- Event rows include Melbourne start times, walk minutes, known-only prices,
  18+ when declared, showtime weather, and the engine's first warmth pairing.
- Tickets uses `target="_blank"`, `rel="noopener noreferrer"` and the accessible
  name “Tickets on Ticketmaster”.
- Category and Free controls filter locally without another request.
- Switching to Sun restores the existing Venues list; reopening After Dark
  reuses its result. Moving the centre about 445m makes no request; moving it
  about 2.2km from the fetched centre makes one new request.
- Empty state offers Cosy spots, which selects the existing Cozy experience in
  the Sun list. A quota error offers Retry and recovers to the fixture events.
- No horizontal document or event-row overflow, visible flat icons, undersized
  controls or browser page errors were found.

Additional 390px checks keep an events request pending, close the sheet, observe
`net::ERR_ABORTED`, then reopen and fetch successfully. At 8pm Melbourne, After
Dark is selected by default without fetching while the sheet is closed. Choosing
Sun persists after a reload. Denied sessionStorage reads/writes do not break the
mode control. A network error uses the same generic error and Retry recovers.

`observations.json` records requests, viewports, measurements and browser errors.
These checks exercise no polling: only opening, explicit Retry and moving over
the threshold trigger requests; local controls, small moves and cached reopen do
not.

## Reproduce

```sh
node docs/screenshots/after-dark-mode/capture.mjs
```

The harness uses port 5188 by default; pass another port as its first argument.
System Chromium is `/usr/bin/chromium`, overridable with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Validation

- `npm test`: **1,247 passed**, including nine new home-mode, origin, request
  threshold and Melbourne time/price formatting tests.
- `npm run build`: **passed**, with the expected large-chunk advisories.
- The browser harness passes **10 scenarios**, covering both phone sizes and
  the additional cancellation, night/session, denied-storage and network cases.
- Sun regression checks cover the existing mobile list, filters, venue-card
  flow, stay picker and comparisons. The expanded sheet hides the floating
  time/moment row to make room for the mode control without squeezing the
  existing Sun date picker or results on short phones.

## Live request attempt

On 22 October 2026, one read-only request was attempted against the production
`events-tonight` endpoint near Melbourne CBD, radius 3 km. The environment's
proxy rejected the HTTPS connection with **CONNECT 403** (`curl` exit 56), before
the request reached Supabase. This is a network-policy failure, not a response
from the function or Ticketmaster. The app's `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are also unset locally. An authenticated live result
could not be verified; no live event count is claimed and no sample feed is used
in the application.

## Limits

These captures verify UI and request behavior with fixtures, not the accuracy or
availability of live Ticketmaster events or actual venue heating. A real-call
result and the full test/build results are reported in the PR. Real Mapbox
movement, iPhone/Safari safe areas, touch scrolling and sheet drag still need a
physical-device check. No event pins are added.
