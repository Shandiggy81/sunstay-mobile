# After Dark night map: local browser checks

The local Vite configuration has **no `VITE_MAPBOX_TOKEN`**. The real Standard
basemap could not be drawn, so these screenshots **do not visually verify night
lighting, restored sun lighting or map shadows**. The visible map failure is the
existing no-token state.

Mobile Chromium at **390×844** used a fixed Sunday 25 October 2026, 5:30pm
Melbourne clock and intercepted event/weather fixtures. All external browser
requests were fulfilled or blocked; no live Supabase project was called.

| Step | Screenshot |
| --- | --- |
| Sun, Lunch selected | [sun-before-390.png](sun-before-390.png) |
| After Dark open | [after-dark-open-390.png](after-dark-open-390.png) |
| After Dark collapsed to show the map area | [after-dark-map-390.png](after-dark-map-390.png) |
| Returned to Sun, Fine-tune slider changed | [sun-return-slider-390.png](sun-return-slider-390.png) |

The Sun → After Dark → Sun controls work. Lunch's **720 minutes** value survives
the mode changes. After returning to Sun, keyboard ArrowRight changes the slider
to 725, then **730 minutes**, and its output reads **12:10 PM**. There is no
horizontal page overflow or unhandled browser error. This verifies the controls
and preserved time state only; with no map instance it cannot verify calls to
Mapbox or the appearance of its lights.

The implementation accounts for Mapbox GL JS 3.17's custom `setLights`
overriding imported lights: the SDK [merges root/import lights](https://github.com/mapbox/mapbox-gl-js/blob/v3.17.0/src/style/style.ts#L928-L1001)
and [`setLights` updates the selected lights by type](https://github.com/mapbox/mapbox-gl-js/blob/v3.17.0/src/style/style.ts#L2235-L2287).
The component snapshots the Standard light definitions before
the sun writer changes them, then restores those definitions for the night
preset. The generation guard and current mode gate the sun writer. Those SDK
interactions need the real-token check below; these screenshots cannot establish
that the basemap has received or rendered them.

## Isolated component contract check

The same harness also runs the **actual `TimeOfDayLight` component** in an
isolated local page under the real Weather/Microclimate providers. A Vite plugin
exports the component only in the test server; production files and exports are
unchanged. Its fake Mapbox API logs calls and mutates light properties by type.
This is a nonvisual component test, not a running Standard basemap.

The probe passed these checks:

- Sun applies numeric custom lights; entering After Dark restores the saved
  Standard expressions and selects `night`.
- Real range-input events queue the existing throttle before a mode switch;
  neither the queued write nor subsequent keyboard changes writes sun lights
  while After Dark owns lighting.
- Returning to Sun selects `day` and applies the exact sun direction for the
  latest slider time (740 minutes).
- Detached callbacks from the retired generation cannot touch a replacement
  map. A stale generation writes nothing; an unloaded generation waits.
- A replacement generation opened in After Dark captures its own Standard
  definitions and restores night mode.
- All mobile light writes keep `cast-shadows: false` and `shadow-intensity: 0`;
  3D objects, terrain and extrusion layers remain suppressed.

`npm test`: **1,310 passed**, including four new light-mode helper tests.
`npm run build`: passed, with the expected map/mapsgl/index chunk warnings.

Run `node docs/screenshots/after-dark-night-map/capture.mjs` from the repo root.
The harness starts Vite on port 5216 (override with the first argument), uses
only the reserved `.invalid` Supabase host, and defaults to `/usr/bin/chromium`
(override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). Detailed measurements are
in [observations.json](observations.json).

## Remaining checks

With a configured real Mapbox token, verify Sun → After Dark makes Standard's
basemap dark; returning to Sun must restore the current sun position and allow
further slider lighting changes. Also check changing mode before the style
finishes loading.

On a physical iPhone, cause a WebGL context loss while After Dark is active,
then use the existing manual **Resume map** action. The new generation must
return in night mode without 3D objects, terrain or extrusions. Check returning
to Sun and scrubbing afterward, plus background/foreground recovery and gesture
responsiveness. These physical-device checks were not performed here.
