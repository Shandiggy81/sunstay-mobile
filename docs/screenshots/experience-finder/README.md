# Experience Finder, Phase 1

Before screenshots use main at `777f2bb`. After screenshots use this branch.
Mobile pairs are 390 × 844 with touch emulation; the additional after views are
768 × 1024 (tablet) and 1440 × 900 (desktop). Chromium uses reduced motion,
Australia/Melbourne time and 19 October 2026, 11 am. Captures wait for the splash
to finish.

| View | Before | After |
| --- | --- | --- |
| Discovery | [Mobile home](before-mobile-home.png) | [Experience shortcuts](after-mobile-home.png) |
| Outdoor results | [Mobile list](before-mobile-list.png) | [Time, conditions, then amenities](after-mobile-list.png) |
| Stays | [Stay list](before-mobile-stays.png) | [Date, sun intent and estimated-room labels](after-mobile-stays.png) |
| Room sunlight | [Room card](before-mobile-room.png) | [Dated potential-sun timeline](after-mobile-room.png) |

Additional views: [tablet](after-tablet-home.png), [desktop](after-desktop-home.png).

These are deterministic local fixtures, not screenshots of production. They use
the unchanged demo venue fallback (56 listings) and mocked raw Open-Meteo weather.
All other external HTTP requests and WebSockets are blocked. Mapbox rendering,
map pin selection and GPU performance are therefore **not** validated; the empty
map/loading state is expected in these captures. No production Supabase calls,
reservations, credentials or live weather are involved. No horizontal document
overflow or browser page errors occurred at the three capture sizes.

The new browser tests additionally cover an arbitrary future stay date, comparing
two stays, loading/listing provenance, missing weather, empty search, keyboard
navigation, 44px experience targets, and an expanded date picker at 320 × 568
that leaves the results scrollable. The existing mobile smoke suite still checks
food filters, the Filters overlay and opening/closing venue cards.

## Design references

The requested Mobbin references could not be inspected: no callable Mobbin tool
was exposed, and opening the URLs from this environment returned CONNECT 403.
No observations about those screens are claimed:

- [Airbnb map discovery](https://mobbin.com/screens/24072f6f-71d3-47f1-92e3-3b63bf4b1b43)
- [Apple Weather hourly weather](https://mobbin.com/screens/077d4f75-232d-46ac-8a77-5f8bf0e91205)
- [Booking.com property details](https://mobbin.com/flows/70cc02a9-d3e8-45d0-8b49-3f2481a25193)
- [OpenTable discovery](https://mobbin.com/screens/bc2b703e-67bf-4273-ab1a-eeab9d291f2f)

The implementation builds on SunStay's existing controls and assets. Its design
principles are intent shortcuts, persistent date/time context, scan-first result
hierarchy and explicit separation of modelled exposure from weather forecasts.
These are design choices, not findings from the unavailable reference screens.

## Validation and remaining checks

Node 22: `npm ci`, `npm test` (864 passed, zero skipped), `npm run build` and
`npm run test:smoke` (15 passed, zero skipped). Local browser tests use the trusted
installed Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`;
CI uses Playwright's downloaded Chromium. Only the existing large-chunk build
advisory and environment color/npm notices remain. No new dependency is added.

Before release, check a real iPhone/Safari with live venue/weather data, map pin
selection, sheet transitions and an overseas timezone. The separate timezone
fix is PR #192; this branch does not duplicate its calculation changes. No
reliable forecast issuance/observation timestamp is exposed in the current UI
weather object, so this work adds no invented freshness indicator.

Suggested next phase: validate the four discovery intents with users on real
phones, then prioritise verified room geometry and source metadata before any
reservation flow or tracking work.
