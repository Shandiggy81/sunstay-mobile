# Explore: bright clay restyle

Baseline: `c78806a` (latest `origin/main` when the branch was created). Captured in
mobile Chromium at 320×844, 390×844 and 768×1024 with touch enabled. A separate
320×568 smoke check covers short-phone layout and the open stay date picker.

The header, search/Ask Sunny, existing experience/filter chips, result sheet,
non-stay rows and map preview use warm-white surfaces, navy ink, clay icons and
warm shadows. Pins show the **same rounded sun score already used in their
accessible label**; score calculations and tier thresholds are unchanged.
The time control remains the existing continuous slider. Its handlers, bounds,
settling behavior and map lighting are unchanged. Mini sun graphs and all existing
source/confidence wording remain conditional on their original data. The mini
graph scope is stated as the venue point on a clear day, matching the existing
engine and detail-card description; it does not claim measured table sun.

## Screenshot method and limits

- Existing `e2e/fixtures/weather.js`: fixed 19 October 2026, 11am Melbourne,
  23° Open-Meteo fixture. Existing sample venue data; no live database requests.
- Only local app/assets and the stubbed weather response are allowed in the
  browser. The paired images use the same data, date and viewport.
- **No Mapbox token is configured in this environment.** These captures honestly
  show “Map failed to load”; they do not demonstrate live map tiles or live pins.
  The real `MapVenuePreview` is opened by calling its existing
  `VenueMap.onVenueSelect` callback through React's browser tree, because no pin
  can be tapped without a loaded map. No application source/state hook was added.
- A Café filter is selected through the existing Filters sheet. Captures wait
  until its closing scrim is removed. Reduced-motion captures use the browser's
  `prefers-reduced-motion: reduce` setting.
- No page errors or horizontal overflow at the three requested widths. Keyboard
  checks cover weather details, Filters, Ask Sunny and chat close. The unavailable
  weather label wraps at 320px; Filters and Ask Sunny retain ≥44px targets.

To reproduce after captures, start `npm run dev -- --port 5173 --strictPort`, then
run `node docs/screenshots/explore-bright-clay/capture.mjs after 5173` from the
repository root. Baseline captures used a disposable archive of `c78806a`, served
on port 5174, with the same harness (`before 5174`). The harness needs system
Chromium at `/usr/bin/chromium` and intentionally blocks external services.

## Before and after

| View | Width | Before | After |
| --- | --- | --- | --- |
| default | 320px | [Before](before-default-320.png) | [After](after-default-320.png) |
| default | 390px | [Before](before-default-390.png) | [After](after-default-390.png) |
| default | 768px | [Before](before-default-768.png) | [After](after-default-768.png) |
| category selected | 320px | [Before](before-category-selected-320.png) | [After](after-category-selected-320.png) |
| category selected | 390px | [Before](before-category-selected-390.png) | [After](after-category-selected-390.png) |
| category selected | 768px | [Before](before-category-selected-768.png) | [After](after-category-selected-768.png) |
| list expanded | 320px | [Before](before-list-expanded-320.png) | [After](after-list-expanded-320.png) |
| list expanded | 390px | [Before](before-list-expanded-390.png) | [After](after-list-expanded-390.png) |
| list expanded | 768px | [Before](before-list-expanded-768.png) | [After](after-list-expanded-768.png) |
| map preview | 320px | [Before](before-map-preview-320.png) | [After](after-map-preview-320.png) |
| map preview | 390px | [Before](before-map-preview-390.png) | [After](after-map-preview-390.png) |
| map preview | 768px | [Before](before-map-preview-768.png) | [After](after-map-preview-768.png) |
| Reduced motion | 390px | [Before](before-reduced-motion-390.png) | [After](after-reduced-motion-390.png) |

Additional checks: [unavailable weather at 320px](after-weather-unavailable-320.png)
and [expanded list on a short 320px phone](after-short-list-320.png).

## Validation

- `npm ci` — passed.
- `npm test` — 1,161 passed, zero failed.
- `npm run build` — passed; existing large-chunk advisories remain.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`
  — all 20 tests passed, with no selector changes. Includes discovery, filters,
  venue opening, date selection, comparisons and venue-local sun consistency.
- `git diff --check` — passed.

Still needs configured Mapbox access: inspect live pin shapes/selection rings,
time-slider wrapping and the overall composition over actual map tiles.
Still needs a physical iPhone: sheet drag, map panning with overlaid controls,
safe-area spacing, touch targets, and background/foreground behavior. Browser
emulation does not replace those checks. No merge or deployment was performed.
