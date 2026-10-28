# After Dark pins without sun scores

`nightMode` now reaches the pure `sunPinView` helper through marker creation,
updates and selection/highlight repaints. After Dark uses the existing moon or
condition treatment (unknown scores show only the venue icon), with no numeric
sun score in visible or accessible text. Sun mode retains its existing behavior.
The existing generation-scoped marker sync is reused; cluster rendering and map
creation/recovery are unchanged.

## Verification

- `npm test`: **1,320 passed**, including new After Dark/Sun-mode helper tests.
- `npm run build`: passed with expected map/mapsgl/index chunk warnings.
- Mobile Chromium, 390×844: actual marker DOM creation/repaint functions run in
  an isolated test page. This covers scores 50/38/90, selected/highlighted pins,
  unknown scores and conditions. After Dark shows no numeric venue scores or
  accessible sun-score labels; switching back restores all original scores.
- The baseline Sun renderer capture (main before edits) and the after capture
  are **byte-identical**. The cluster bubble stays at **7** across modes.
- No browser errors. No live Supabase calls; external requests are intercepted.

| Capture | Screenshot |
| --- | --- |
| Actual pin DOM, Sun | [Sun pins](after-sun-pins-390.png) |
| Actual pin DOM, After Dark | [After Dark pins](after-dark-pins-390.png) |
| Baseline Sun DOM | [Before Sun pins](before-sun-pins-390.png) |
| App, Sun | [Sun app](sun-app-390.png) |
| App, After Dark | [After Dark app](after-dark-app-390.png) |

There is **no local Mapbox token**. The isolated renderer screenshots are labelled
as such and have no basemap; app captures verify mode controls only. A real-token
browser still needs to verify visible pin updates on the night basemap during
zoom/pan and after Resume map on an iPhone. Full-map pixel equality could not be
verified here; the pin renderer's pixel equality was verified directly.

Run `node docs/screenshots/after-dark-night-pins/capture.mjs after` from the repo
root (local port 5220, `/usr/bin/chromium`, overridable with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). The `before` test-server transform uses the original renderer and helper from
base `5904162` for a reproducible baseline. The Vite plugin exports private renderer functions only for the test
server; production exports are unchanged. No merge or deployment performed.
