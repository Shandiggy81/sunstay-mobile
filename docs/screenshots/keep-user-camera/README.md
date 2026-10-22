# Keep the user's camera

Checked at **390×844** in mobile Chromium, using the actual installed Mapbox GL
library and a real WebGL canvas. Baseline main `85d7f82` includes PR #243.

## Results

| Local camera check | Result | Screenshot |
| --- | --- | --- |
| Normal first load, no location or gesture | Initial citywide fit still runs; all 56 sample venues project inside the canvas. Final zoom 11.325. | [Normal load](normal-load-390.png) |
| Locate Me before map load | Mock location `-37.8159, 144.9679`, zoom 14, is retained for ten seconds after map load. | [Location retained](early-locate-390.png) |
| After Dark after that location check | Shows “Walk times from your location”. | [After Dark](early-locate-after-dark-390.png) |
| Early pan notification, then native pointer drag | Camera remains at the gesture's chosen position/zoom after ten seconds. | [Pan](early-pan-390.png) |
| Early wheel notification, then native wheel zoom | Camera remains at the gesture's chosen position/zoom after ten seconds. | [Wheel](early-wheel-390.png) |
| Early pinch notification, then CDP two-finger touch input | Camera remains at the gesture's chosen position/zoom after ten seconds. | [Pinch](early-pinch-390.png) |
| Programmatic flyTo before load | Does not opt out of the normal first fit; all 56 sample venues remain inside the canvas afterwards. | [Programmatic control](programmatic-move-390.png) |

All six camera scenarios passed, with zero browser page errors. The local test
records coordinates, zoom and Mapbox movement events in `observations.json`.
`npm test` passed **1,277 tests**; `npm run build` passed with the expected
map/mapsgl/index large-chunk advisories. No extra Boolean-wrapper unit test was
added; the checks above exercise the component and real camera API.

## What is real, and what is a fixture

The harness starts the normal Vite dev app and uses real Mapbox GL construction,
camera animations, events, gestures, clustering and venue marker rendering. It
uses Chromium's software WebGL renderer. There is no fake Map class, React state
patch, application-source replacement or new production test hook.

There is no valid local Mapbox token. A deliberately invalid test token is used,
and **every Mapbox service request is intercepted**. The style response is a
minimal flat background with no basemap tiles, fonts or geographic imagery;
telemetry/session responses are local fixtures. The screenshots therefore show
real application markers on a plain surface, not a production map. Weather is
the existing forecast fixture. Supabase credentials are absent, so venues use
the existing sample data and After Dark honestly shows its error/Retry state.

The Locate test grants browser geolocation permission with a fixed coordinate,
taps the actual Locate Me button while the style response is held, allows the
flyTo to finish, then releases map load. The unchanged camera and the real
After Dark origin label are asserted after another ten seconds. The normal and
programmatic-control cases exercise the same delayed-load sequence.

For gesture cases, the app's existing loading overlay intercepts physical input
until load. Each case therefore sends an explicit `movestart` event with an
`originalEvent` through the **real Mapbox event emitter** and uses a controlled
`jumpTo` to choose a distinct camera before releasing load, then checks that the
first fit is skipped. Once loaded, native pointer, wheel or
two-finger CDP touch input changes the camera, which is retained for ten more
seconds. These synthetic early-event fixtures verify the early listener binding;
they do not prove a native gesture during production startup. No loading overlay
or application state is changed for these checks.

## Deploy-preview access and remaining checks

A request to `https://deploy-preview-243--sunstayglobal30.netlify.app/` failed
before reaching Netlify: the environment proxy returned **CONNECT 403**
(`curl` exit 56). The real deploy preview and its Mapbox token/services could not
be tested here. No proxy bypass or manual deployment was attempted.

The preview still needs the exact real-service reproduction: grant location,
tap Locate Me immediately, wait ten seconds, confirm the camera and “Walk times
from your location”, then compare an untouched first load. Real iPhone/Safari
GPS permission and timing, early touch drag/pinch, safe areas, background returns
and manual WebGL recovery remain device checks. The fix does not add timers or
WebGL retries.

## Reproduce local checks

```sh
node docs/screenshots/keep-user-camera/capture.mjs
```

The harness starts Vite on port 5195 (override with the first argument) and uses
`/usr/bin/chromium` (override with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`). No live
Mapbox or database requests are made.
