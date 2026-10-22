# After Dark walk origin

Mobile Chromium at **390×844** and **320×568**, with touch emulation, Melbourne
timezone and reduced motion. Baseline: `4f92b79` (latest main, including PR #241).

| Check | 390×844 | 320×568 |
| --- | --- | --- |
| No Mapbox token or Supabase settings | [Default origin](no-credentials-390.png) | [Default origin](no-credentials-320.png) |
| Intercepted event response, same no-token map | [Event walks](fixture-events-390.png) | [Event walks](fixture-events-320.png) |

## Method

The harness runs the app through its normal Vite development server and opens
After Dark with the real mode control. **No React state, camera, map or map-load
state is patched.** No Mapbox token is configured, so the app displays “Map
failed to load” and the After Dark origin must remain Flinders Street Station
(`-37.8183, 144.9671`). Both captures show the real panel label **“Walk times from
Flinders St Station”**. The sheet header says **“Within 3 km”**, so it does not
claim the default radius is centred on an unavailable map camera.

The first pair runs with empty public Supabase URL/key settings. The honest
events error and Retry button are shown, and there are zero event requests.
Live events cannot be requested locally with these settings.

The second pair uses the existing fake test-only Supabase settings and raw
Ticketmaster fixture from `../after-dark-mode/fixtures.mjs`. Every external
request is blocked except the intercepted weather and event requests. The
real fetch helper and event normalizer run; no sample feed is added to the app.
The request is asserted to contain exactly Flinders Street Station's latitude
and longitude and a **3km** radius. The first fixture event at CQ City Bar shows
**7 min walk**, measured from that same origin. The fixture clock is 19 October
2026, 6pm Melbourne; the event's source time and forecast are reproducible.

## Browser checks

The four cases assert the default label, no map canvas, no horizontal page or
event-row overflow, no visible interactive control smaller than 44×44px, and no
browser page errors. `observations.json` records the request coordinates and
measurements. The category row retains its existing intentional horizontal
chip scrolling; the document itself does not scroll horizontally.

## Validation

- `npm test`: **1,277 passed**, including the updated origin decision tests.
- `npm run build`: **passed**, with the expected large-chunk advisories.
- All four mobile browser cases: **passed**.

## Reproduce

```sh
node docs/screenshots/after-dark-walk-origin/capture.mjs
```

The harness starts Vite on ports 5190 and 5191. Pass another starting port as
the first argument if needed. It uses `/usr/bin/chromium`, overridable with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## Not verified here

Without a Mapbox token, real zoom ≥14 camera reporting, Locate Me flying to the
user, and manual WebGL recovery cannot be exercised in a real map. Unit tests
cover the zoom threshold, bounds, location distance and each origin label.
Physical iPhone/Safari safe areas, sheet drag and touch scrolling also remain
real-device checks. These captures do not verify live Ticketmaster availability
or actual venue heating.
