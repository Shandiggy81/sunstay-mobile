# Map-first Explore home

Baseline: `2536698` (latest `origin/main`, including PR #220 and its pin follow-up).
Mobile Chromium captures use touch emulation at 320×844, 390×844 and 768×1024.

## Capture method and limits

- Weather is the existing `e2e/fixtures/weather.js` response, fixed at 19 October
  2026, 11am Melbourne, 23°. Listings are the existing sample venues. External
  services are blocked; no database or paid requests are made.
- No Mapbox token is configured. Default captures show the actual unavailable-map
  state. These images do not verify map tiles, live pins, map gestures or shadows.
- Pin previews use the real `MapVenuePreview`, opened through the existing
  `VenueMap.onVenueSelect` callback in the browser's React tree. No application
  source or test hook is added to open it.
- Before the change, the continuous time slider only renders after Mapbox loads.
  The baseline time images use a **browser-only UI fixture**: the existing
  `mapLoaded`/`mapError` React states are changed to render the real slider, while
  its map reference remains null. This deliberately shows a blank map surface,
  not simulated map tiles. The existing input selects 12pm through its ordinary
  input/change events. Baseline “time selected” and “fine tune open” are the same
  always-visible slider, because neither chips nor a fine-tune disclosure existed.
- Baseline expanded-sheet captures use the existing collapsed-handle click.
  The baseline handle does not support dragging up. Physical sheet drag and safe
  areas still require a real iPhone check.
- After captures select the real Lunch chip, open its Fine-tune popover and use
  an actual mouse-pointer drag 190px upward on the collapsed sheet handle. The
  sheet expands successfully at every requested width. The time is reset with
  Now before capturing previews and the expanded list, to match baseline data.
- Tomorrow remains disabled: the existing preview represents times today. Chip
  faces are visually compact (34–36px); their touch areas remain 44px high.
- Sunny's once-per-session tip and the splash screen are marked as previously
  shown so they do not obscure the paired layout captures. Other behavior is
  unchanged. Reduced motion uses the browser media preference.

## Visible map height

At **390×844**, before the change, the map container runs from y=357.625 to
y=844 (486.375px high). The collapsed sheet begins at y=780, leaving an
unobscured vertical map region of **422.375px, or 50.04% of the viewport**.
This measures the interval between the map's top edge, below the header/search/
experience block, and the sheet's top edge; floating map controls are not
subtracted from that interval.

After the change, the map container fills the viewport. At **390×844**, the single
chip row ends at y=152 and the collapsed sheet begins at y=748, leaving
**596px, or 70.62% of the viewport**. This gains **173.625px and 20.57 percentage
points** of unobscured vertical map space. The floating controls still sit over
the map; their bounding boxes are not subtracted from that vertical interval.

| Width | Before visible map | Before share | After visible map | After share |
| --- | --- | --- | --- | --- |
| 320px | 427.781px | 50.68% | 596px | 70.62% |
| 390px | 422.375px | 50.04% | 596px | 70.62% |
| 768px | 634.766px | 61.99% | 776px | 75.78% |

## Before and after

| View | Width | Before | After |
| --- | --- | --- | --- |
| Default | 320px | [Before](before-default-320.png) | [After](after-default-320.png) |
| Default | 390px | [Before](before-default-390.png) | [After](after-default-390.png) |
| Default | 768px | [Before](before-default-768.png) | [After](after-default-768.png) |
| Selected time | 320px | [Slider fixture](before-time-selected-320.png) | [Lunch chip](after-time-selected-320.png) |
| Selected time | 390px | [Slider fixture](before-time-selected-390.png) | [Lunch chip](after-time-selected-390.png) |
| Selected time | 768px | [Slider fixture](before-time-selected-768.png) | [Lunch chip](after-time-selected-768.png) |
| Fine tune open | 320px | [Slider fixture](before-fine-tune-open-320.png) | [After](after-fine-tune-open-320.png) |
| Fine tune open | 390px | [Slider fixture](before-fine-tune-open-390.png) | [After](after-fine-tune-open-390.png) |
| Fine tune open | 768px | [Slider fixture](before-fine-tune-open-768.png) | [After](after-fine-tune-open-768.png) |
| Pin preview | 320px | [Before](before-pin-preview-320.png) | [After](after-pin-preview-320.png) |
| Pin preview | 390px | [Before](before-pin-preview-390.png) | [After](after-pin-preview-390.png) |
| Pin preview | 768px | [Before](before-pin-preview-768.png) | [After](after-pin-preview-768.png) |
| Expanded list | 320px | [Before](before-sheet-expanded-320.png) | [Dragged up](after-sheet-expanded-320.png) |
| Expanded list | 390px | [Before](before-sheet-expanded-390.png) | [Dragged up](after-sheet-expanded-390.png) |
| Expanded list | 768px | [Before](before-sheet-expanded-768.png) | [Dragged up](after-sheet-expanded-768.png) |
| Reduced motion | 390px | [Before](before-reduced-motion-390.png) | [After](after-reduced-motion-390.png) |

Both capture runs reported no page errors or horizontal overflow at all three
widths. The 12pm baseline slider UI fixture also reported no page errors. Browser
dragging does not replace touch-drag verification on a real iPhone.

## Reproduce

Run `npm run dev -- --port 5173 --strictPort`, then from the repository root:

```sh
node docs/screenshots/map-first-home/capture.mjs after 5173
```

The same harness captures the baseline with `before 5176`, using a disposable
archive of `2536698` served on port 5176. It requires Chromium at
`/usr/bin/chromium`. The baseline time fixture depends on that revision's React
hook order and is explicitly limited to rendering its existing time control.

## Validation

- `npm ci` passed.
- `npm test`: **1,167 passed**, zero failed. New pure helpers cover existing
  pin-tier counts, missing scores, Melbourne time presets, DST, unavailable
  sunsets and the disabled tomorrow state.
- `npm run build` passed; existing large-chunk advisories remain.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`:
  **20 passed**. Existing assertions are unchanged; selectors follow the moved
  disclaimer, removed heading and renamed sheet handle.
- `node docs/screenshots/map-first-home/interaction-check.mjs`: all four checks
  passed. Focusing the slider pauses map panning; outside tap, Escape, close and
  opening a pin preview all release it. This uses a disclosed minimal dragPan
  spy through the existing map ref, not a real Mapbox map.
- Browser hit testing across the visible map: 24 of 25 points reached the map
  container; the remaining point hit the intended Locate button. Overlay
  wrappers pass gestures through and only the controls take pointer events.
- One Sunny button and Filters both measure 44×44px at all three widths. The
  existing advice shows once, fades after six seconds, reappears on focus and
  hides when chat opens; same-session reload does not auto-show it again.
- `git diff --check` passed.

Additional 320px checks: [Sunny advice anchored below the chips](after-sunny-tip-320.png)
and [unavailable weather](after-weather-unavailable-320.png).

## Physical iPhone and configured-map checks

Still requires a real iPhone: pinch-zoom anywhere on the exposed map, including
between floating controls; horizontal chip swipes; sheet drag and scroll handoff;
status-bar and bottom safe-area spacing; advice placement; keyboard/search and
background/foreground map redraw. The 70.62% measurement uses the requested
390×844 Chromium viewport with zero emulated safe-area insets; real device insets
will change the available area.

A configured Mapbox token is also needed to inspect live Layers/Locate placement,
actual tiles, live pin taps and pinch gestures. Keyless captures and pointer hit
tests do not establish live map gesture behavior. Map initialization, generations,
recovery, marker sync, clustering and existing time scrub/settle handlers are
unchanged. No merge or deployment was performed.
