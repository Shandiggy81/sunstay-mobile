# Map caption venue count

Before/after home captures in mobile Chromium, with touch emulation and the list
closed at its normal peek. Baseline: `adf3f2d` (`origin/main` after PR #228).
Weather is the repository's existing Open-Meteo fixture, with the clock fixed to
19 October 2026, 11am Melbourne. The app's 56 sample venues are unchanged.

| Viewport | Before | After |
| --- | --- | --- |
| 390×844 | [Before](before-390.png) | [After](after-390.png) |
| 320×568 | [Before](before-320.png) | [After](after-320.png) |

## How the caption was checked without a Mapbox token

No Mapbox token is configured here, so a normal boot displays “Map failed to
load” and does not render its loaded-map caption. The capture harness uses the
same browser-only fixture technique as the existing map-first-polish captures:
it updates VenueMap's existing development React `mapLoaded` and `mapError`
state, then calls the existing MicroclimateContext `setBbox` action with a
Melbourne viewport. The app renders its real caption component, DataBadge and
styles on the blank map surface. No application hooks, map lifecycle code or
fake tiles/pins are added. The harness asserts that no Mapbox canvas exists.
It does not set the “Search this area” prompt.

The real provenance helper selects **“Live · just now”** from the stubbed weather
because these sample venues have no calculated microclimate rows. This verifies
the same DataBadge element and caption layout as the reported “Calculated”
state, but does not exercise a real calculated feed or a real map.

Before, the caption shows **“56 venues”** beside its badge while the sheet shows
**“56 venues · 41 in full sun”**. After, the caption shows only the badge and the
sheet retains its existing count. No stylesheet change was necessary: flex gap
only separates present children, and existing padding remains symmetric.

## Browser checks

At both phone sizes, the harness verifies:

- The sheet stays closed and the caption is entirely above it, at the existing
  16px side margin, without horizontal overflow.
- The duplicate caption count is present before and absent after; the DataBadge
  remains visible.
- With no badge and no cozy filter, no `.ss-map-caption` element is rendered.
- With the cozy filter alone, the visible caption says **“Cozy filter on”**,
  without a leading dot or empty badge space.
- With both present, the badge and cozy note remain visible together.
- No browser page errors. No Mapbox canvas is created by the fixture.

`before-observations.json` and `after-observations.json` record caption bounds,
text, sheet text and DOM checks. Before captures were taken before editing the
application JSX; after captures use the changed render block.

## Validation

- `npm test`: **1,210 passed**, zero failures.
- `npm run build`: **passed**; expected large-chunk advisories remain.
- The application diff is confined to the `.ss-map-caption` render block. Map
  initialization, generations, markers, resize and WebGL recovery are unchanged.

## Reproduce

With the dev server on port 5173, run from the repository root:

```sh
node docs/screenshots/map-caption-count/capture.mjs before
node docs/screenshots/map-caption-count/capture.mjs after
```

Run `before` against baseline commit `adf3f2d`, then `after` against this branch.
Pass another port as the second argument if needed. The harness uses
`/usr/bin/chromium` by default; override with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. All external requests except the stubbed
Open-Meteo request are blocked. No database requests or writes are needed.

## Limits

Real Mapbox tiles, pin placement, map gestures and lifecycle recovery cannot be
verified without a configured token and are outside this presentation change.
Physical iPhone/Safari safe-area and rendering checks remain a real-device task.
