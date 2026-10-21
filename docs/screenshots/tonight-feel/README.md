# How it feels tonight — card checks

Captured in mobile Chromium at **390×844** and **320×568**, with touch emulation,
Melbourne timezone and reduced motion. The section sits directly after the
existing sun section and before Hour by hour.

| Case | 390×844 | 320×568 |
| --- | --- | --- |
| Warm evening | [Warm](warm-390.png) | [Warm](warm-320.png) |
| Cold/rainy evening, declared fireplace | [Cold/rain/fireplace](cold-rain-fireplace-390.png) | [Cold/rain/fireplace](cold-rain-fireplace-320.png) |
| After 11pm, section absent | [After 11pm](after-11pm-390.png) | [After 11pm](after-11pm-320.png) |

## Fixtures and verification

- The app's existing Open-Meteo request is fulfilled with a deterministic version
  of `e2e/fixtures/weather.js`. The normal weather parser still runs. Local app
  assets are allowed; all other external requests are blocked.
- Warm and cold cases fix the real clock to **19 October 2026, 6pm Melbourne**.
  The warm forecast has a lowest remaining-evening feels-like of 20° at 9pm,
  10km/h wind and 10% rain chance. The cold forecast reaches 11° at 9pm with
  25km/h wind and 60% rain chance.
- Warm uses the existing **The Vineyard** sample listing (`dv-03`), which declares
  `heating: "no heating"`; no warmth line is shown. Cold and late cases use the
  existing **Dick Whittington Tavern** (`dv-05`), whose own data declares both a
  Fireplace tag and `heating: "fireplace"`. The section says “Fireplace inside”
  and makes no claim that it is lit or on.
- The warm case selects the existing **Lunch** map time shortcut before opening
  the venue. The new section still reports the real evening forecast, proving
  it does not follow the map scrubber.
- The late case fixes the clock to **11:30pm Melbourne**. The new section is
  absent from the DOM, with Today's sun followed directly by Hour by hour.
- Every case opens the real list and venue card through their existing controls.
  Card entrance animations and all overlay ancestors are allowed to finish
  before capture; the list scrim is detached. Screenshots use normal animation
  settings, avoiding cancellation of Framer Motion entrance transitions.
- All six cases reported **zero browser errors and no horizontal document or
  section overflow**. The complete new section is readable at both sizes. Its
  Forecast badge has no visible flat marker; the section's semantic icons are
  existing clay assets.
- The weather request count is recorded before the card opens and checked again
  after rendering. Opening the card adds **zero weather requests**. This dev
  build makes two initial requests through React StrictMode's existing
  abort/restart behavior; the new section reuses that forecast.
- A separate Chromium clock check kept the card open from **10:59:30pm through
  11pm Melbourne** and verified the section disappears automatically, without
  reopening the card.

## Forecast decisions

Before 5pm, the helper requires every hourly sample from 5pm through the 11pm
endpoint. During the evening it uses the current hour onward, so an earlier
cold spell does not describe the rest of tonight. It uses the lowest feels-like
temperature and highest rain chance and wind in that window. Missing companion
temperature, rain or wind readings hide the section instead of assuming dry,
calm conditions. The helper reads the existing raw hourly series because the
display normalizer supplies defaults for missing readings.

The requested thresholds leave warm evenings with 40–49% rain unspecified.
These use the cautious “Jacket weather outside” verdict and explicitly show the
rain chance; they cannot receive the warm/dry verdict. Rain at 50% or wind at
30km/h selects “Best inside tonight” regardless of temperature.

## Checks

- `npm test`: **1,200 passed**, including 13 new tonight helper tests.
- `npm run build`: **passed**; the expected large-chunk advisories remain.
- Existing `e2e/venue-sun-consistency.spec.js`: **6 passed**, covering the card's
  sun display and venue-local time from other timezones.
- Six phone captures and the held-open 11pm cutoff check: **passed**.
- `git diff --check`: **passed**.

## Reproduce

With the dev server running on port 5173, run from the repository root:

```sh
node docs/screenshots/tonight-feel/capture.mjs
```

Pass another port as the first argument if needed. The harness requires system
Chromium at `/usr/bin/chromium` and writes all six captures to this directory.

## Limits

Forecasts are stubbed for reproducible threshold checks; they do not verify the
accuracy of a real evening forecast or actual venue heating availability. No
partner live note is provided by these fixtures. Physical iPhone/Safari safe-area,
text sizing and scrolling still need a real-device check. No Mapbox token is
configured in this environment; map tiles are irrelevant to the card captures
and no map, marker, WebGL or Supabase code is changed by this screenshot work.
