# After Dark: Volt and Pink

Local mobile Chromium checks at **390×844** and **320×568**, plus the desktop
panel at 1280×900. Screenshots use a fixed **Sunday 25 October 2026, 5:30pm
Australia/Melbourne** clock and intercepted fixtures, not live events or weather.
No request reached a live Supabase project. The map intentionally has no Mapbox
token and shows its existing failure state; map styling and lifecycle were not
part of these checks.

| View | Screenshot |
| --- | --- |
| Events, 390×844 | [events-390.png](events-390.png) |
| Events, 320×568 | [events-320.png](events-320.png) |
| First card scrolled to its details/Tickets, 320×568 | [event-details-320.png](event-details-320.png) |
| Empty, 390×844 | [empty-390.png](empty-390.png) |
| Empty, 320×568 | [empty-320.png](empty-320.png) |
| After Dark peek | [peek-390.png](peek-390.png) |
| Sun restored to its warm-white surface | [sun-unchanged-390.png](sun-unchanged-390.png) |
| Desktop After Dark panel | [desktop-events-1280.png](desktop-events-1280.png) |

## Checks

- At 390×844 the first show starts at **366px**, with its title at **411px**;
  both are in the top half (422px). At 320×568 the first show starts at 327px
  and its title at 370px. Its remaining content and Tickets button scroll
  normally inside the results area.
- No horizontal page or card overflow, no flat SVG icons in the After Dark
  panel, and no controls below 44×44px. Measurements allow 0.01px for translated
  sheet floating-point rects (a 44px CSS box can report 43.999984px).
- The ALL-CAPS title displays as “Noisemakers Australian Tour, Melbourne
  Edition”; its 18+ badge and “From $45” remain. Five raw records, including a
  duplicate show, render four cards.
- A rainy show ignores the closer outdoor-heater/beer-garden fixture and picks
  the nearby indoor/fireplace fixture: “Warm and dry before the show: The
  Lantern, 30 m away”. These venue facts and names are fictional test data.
- Comedy and Free filters work with real touch taps and do not refetch.
  Keyboard focus has a visible 2px outline. Keyboard activation of Tickets
  opens a new tab; that destination is fulfilled locally, never requested from
  Ticketmaster. The link retains `noopener noreferrer`.
- “Near me” still invokes the existing location handler; a mocked denial shows
  “Location off · showing Melbourne”. The default origin remains Flinders St
  Station, and the request retains its 3km radius. A real map/camera move was
  not tested without a Mapbox token.
- The empty-state Cosy spots button switches to Sun and selects the existing
  Cozy spots filter. After Dark's peek does not fetch until opened. Switching
  to Sun restores the white peek; this is a scoped-style check, not a pixel
  comparison against a prior build.
- No unhandled browser errors. `npm test`: **1,306 passed**. `npm run build`:
  passed, with the expected map/mapsgl/index large-chunk advisories.

## Text contrast

The harness reads computed foreground/background colours from actual text in
the mobile sheet, peek and desktop panel and calculates WCAG relative-luminance
ratios. Every used pair exceeds **4.5:1**; the lowest is 6.23:1. Borders and clay
artwork are not text/background pairs.

| Foreground | Background | Used for | Ratio |
| --- | --- | --- | --- |
| `#F7F7F5` | `#26282B` | Show titles, unselected controls, 18+ | 13.78:1 |
| `#1A1C05` | `#E4EF5A` | Selected tab/filter, Tickets and Cosy buttons | 13.85:1 |
| `#E4EF5A` | `#18191B` | Day eyebrow | 14.07:1 |
| `#F7F7F5` | `#18191B` | Header and peek headline | 16.40:1 |
| `#B9BCC2` | `#18191B` | Origin and peek details | 9.24:1 |
| `#E4EF5A` | `#26282B` | Show times | 11.82:1 |
| `#FF7DB5` | `#26282B` | Category/venue line | 6.23:1 |
| `#B9BCC2` | `#26282B` | Walk, weather and price text | 7.77:1 |
| `#FFC6DE` | `#3A2230` | Indoor tip text | 9.91:1 |
| `#B9BCC2` | `#121314` | Source caption | 9.77:1 |
| `#F7F7F5` | `#121314` | Empty/error state text | 17.34:1 |

## Reproduce and remaining device checks

```sh
node docs/screenshots/after-dark-volt-pink/capture.mjs
```

The harness starts local Vite on port 5212 (override with its first argument),
uses only the reserved `.invalid` Supabase fixture URL, and intercepts/blocks all
external browser requests, including the keyboard-opened Tickets tab. Chromium
defaults to `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to
override. [observations.json](observations.json) records measurements and the
deduplicated contrast pairs.

A real iPhone still needs checks for sheet drag and nested scroll gestures,
filter-row swipe, safe-area spacing, keyboard focus, and the native location
permission flow. Live feed/forecast availability and map movement were not
verified by these fixture checks.
