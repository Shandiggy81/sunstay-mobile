# After Dark: more map space on phones

Local mobile Chromium checks use fictional events and weather at a fixed Sunday
25 October 2026, 5:30pm Melbourne clock. All external requests are fulfilled or
blocked; no live Supabase calls. There is no local Mapbox token, so screenshots
show the existing map-failure state and verify layout rather than the night
basemap's appearance.

| Expanded view | Screenshot |
| --- | --- |
| After Dark, 390×844 | [390px](after-dark-390.png) |
| After Dark, 375×667 | [375px](after-dark-375.png) |
| After Dark, 320×568 | [320px](after-dark-320.png) |
| Sun, 390×844 | [Sun](sun-expanded-390.png) |

## Layout and interaction results

| Viewport/mode | Before sheet height | After sheet height | After sheet top |
| --- | ---: | ---: | ---: |
| 390×844 After Dark | 708.95px | 540.16px | 303.84px |
| 375×667 After Dark | 559px | 559px | 108px |
| 320×568 After Dark | 468px | 468px | 100px |
| 390×844 Sun | 708.95px | 708.95px | 135.05px |

At 390×844 the map strip is now **36% of screen height**, up from 16%. The mode
toggle, header, category row, origin and the first event's time and full title
are visible at scrollTop 0. Short-screen sheet heights and Sun's CSS height are
identical to the baseline. Baseline captures sometimes retain a subpixel Framer
entrance translation; height comparisons use 0.1px tolerance and visual top
comparisons allow 1.1px for that pre-existing animation timing.

The event list scrolls inside its sheet (`overflow-y: auto`), and a real wheel
scroll moves its scrollTop by 220px without dragging the sheet. Results retain
`calc(16px + env(safe-area-inset-bottom, 0px))`; Chromium's zero inset computes
to 16px. Dragging the grab handle down collapses the sheet, then tapping the
peek handle expands it again. These checks pass at all three phone sizes.

Where it fits, the weather button remains 44px tall, receives hit-tests and
opens/closes its existing details. At 320×568 it is hidden while After Dark is
expanded because its 44px target would cross the sheet edge; it reappears at
peek. At 390px its details end at y=233, clear of the sheet edge at y=303.84. Locate, layers and SDK top-right navigation controls are hidden while
After Dark is expanded. Local DOM-only probes check SDK/layer/Search-this-area
visibility rules because no real Mapbox controls can load without a token; they
are removed before screenshots. Locate becomes visible again after collapsing.
No horizontal page overflow or unhandled browser errors were observed.

`npm test`: **1,318 passed**. `npm run build`: passed with the expected large-chunk
advisories for map, mapsgl and index. The production change is CSS only.

## Reproduce and limits

Run `node docs/screenshots/after-dark-map-space/capture.mjs after` from the repo
root. It starts Vite on port 5218 and defaults to `/usr/bin/chromium` (override
with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). The before argument was run against
base `f756cfd` before editing CSS. Raw measurements are in the two observations
JSON files; [Sun before](before-sun-390.png) is retained for comparison.

Physical iPhone checks remain for sheet drag/nested touch scrolling and safe-area
spacing. A real-token browser is needed to see the night basemap and actual
Mapbox controls. Short screens retain their taller sheet. Sun's screenshot
checks scoped layout, not pixel equality of asynchronous venue badges.
