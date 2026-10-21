# Map-first home polish

Baseline: `b0aaad2` (`origin/main` after PR #222). Mobile Chromium with touch
emulation at 390×844 and 320×844, weather from `e2e/fixtures/weather.js`
(19 October 2026, 11am Melbourne), sample venues, all other requests blocked.
`observations.json` holds the measurements behind each statement below.

## Limits

- **No Mapbox token is configured locally** (the app logs `VITE_MAPBOX_TOKEN is not set`),
  so none of these images show real tiles, pins, pans or pinch-zoom.
- "Search this area" and the map caption only render once the map has loaded, and the
  prompt only after a user pan. The `search-this-area-*` images use a **browser-only UI
  fixture**: it flips VenueMap's existing `mapLoaded`/`mapError` state, sets its existing
  `areaPrompt` (what a pan sets) and reports a viewport through MicroclimateContext's
  existing `setBbox` (what the map's `moveend` does). The real button and caption render on
  a blank map surface. No application code was added for it.
- The expanded list is opened with a real 190px mouse-pointer drag on the peek header.
  Touch drag, safe-area insets and the iOS keyboard need a real iPhone.

## Screenshots

| View | 390px | 320px |
| --- | --- | --- |
| Default (map unavailable, no token) | [default-390](default-390.png) | [default-320](default-320.png) |
| List dragged up | [sheet-expanded-390](sheet-expanded-390.png) | [sheet-expanded-320](sheet-expanded-320.png) |
| Map moved: "Search this area" + caption (fixture) | [search-this-area-390](search-this-area-390.png) | [search-this-area-320](search-this-area-320.png) |
| Same, then list dragged up | [search-this-area-then-list-390](search-this-area-then-list-390.png) | [search-this-area-then-list-320](search-this-area-then-list-320.png) |
| Foggy weather chip (2×, top 200px) | [weather-foggy-390](weather-foggy-390.png) | [weather-foggy-320](weather-foggy-320.png) |
| Rainy weather chip (2×, top 200px) | [weather-rainy-390](weather-rainy-390.png) | [weather-rainy-320](weather-rainy-320.png) |
| Real Mapbox map | Not possible: no token | Not possible: no token |

## What the captures measured (both widths)

- **Expanded list:** the chip row ends at y=152 and the list starts at y=160. The
  "Venues" heading, the result count and "Sunniest first" each hit-test to themselves at
  both ends, top, bottom and centre: nothing sits over them. Weather details opened from
  the top bar while the list is up also hit-test to themselves (the top bar is now z-index
  41, above the list's 40).
- **One search field:** exactly one visible "Search venues" field in every state, the top
  pill, showing "Find me a sunny spot…" with the list down and up.
- **Disclaimer once:** one visible "Sun exposure is modelled, not guaranteed." line with
  the list down (peek header) and one with it up (list header).
- **Weather chip:** "14° Foggy" shows the clay fog, "15° Rain showers" the clay rain
  cloud, "23° Clear sky" the sun.
- **"Search this area":** top edge at the chip row's lower edge, centred (0px offset),
  a 30px visual pill inside a 44px touch area, nothing over it. Hidden while the list is up.
- **Caption:** starts at the 16px margin (x=17), ends at x=232, 27px clear of Locate at
  320px. Its maximum width stops 16px short of Locate and it wraps rather than overflowing;
  only the shorter "Live · just now" badge could be rendered here, not the longer
  "Calculated · 34 min ago". Hidden while the list is up.
- No page errors and no horizontal overflow in any capture.

## Reproduce

```sh
node docs/screenshots/map-first-polish/capture.mjs
```

It starts its own Vite dev server on port 5182 with the repository config. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a system Chromium.
