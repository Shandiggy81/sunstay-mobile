# Map lifecycle (src/components/Map/VenueMap.jsx)

Moved from CLAUDE.md. Read this and the helpers below before editing the map.

Read this section and the helpers below before editing the map.
- Helpers, all unit-tested: `src/utils/mapLifecycle.js`, `mapRecovery.js`, `mapGpuGuard.js`,
  `mapMarkerLifecycle.js`, `webglRecoveryView.js`.
- Init: `claimMapboxMount` lock, then `new mapboxgl.Map` with the `mapbox://styles/mapbox/standard`
  style, `maxBounds` (greater Melbourne), zoom 9–18, pitch 45. Requires a `pk.` token or the map shows an error state.
- Mobile GPU limits (`mapMemoryOptions`, `suppressMobileGpuLayers`): no antialias, tile cache 10
  (desktop 20), Standard 3D objects hidden, terrain and extrusion layers suppressed.
- Generations: each map instance has a generation number. Camera timers, flyTo, resize and marker
  sync run only for the current generation (`dispatchGenerationCallback`, `markerSyncAfterRestore`);
  callbacks from a retired generation are ignored.
- Markers: DOM `mapboxgl.Marker`s synced from a clustered GeoJSON source through
  `mapMarkerLifecycle` (`syncMarkerLayer`, `releaseMarkerRecords`, a sync scheduler).
- Resize: a debounced `ResizeObserver`, plus a `pageshow`/`visibilitychange` handler that calls
  `resize()` and `triggerRepaint()` when a stale tab returns.
- WebGL context loss: a capture-phase `webglcontextlost` handler marks the generation stale,
  captures the camera, sends a Sentry `WebGL Context Lost` warning, pauses the recovery state
  machine, and tears the map down with `releaseMapOwners` (markers, listeners, canvas reset, `map.remove()`).
- Resume is manual: the user taps "Resume map". Recovery allows one resume per session after a
  5 s cooldown; a second context loss locks the session. A resume creates a new generation and
  restores the camera with `jumpTo`.
- `MapErrorBoundary` is separate: it catches React render errors and retries once after 3 s.
- Pins and clusters are map-aligned, so they tilt with the pitch. Their hit boxes use
  `--ss-pin-hit-height` from `pinHitHeight(pitch)` (`src/utils/sunPin.js`), set on load and `pitchend`,
  which keeps them 44 px tall on screen.
