# Known risks and gaps

Moved from CLAUDE.md. Update this file, not CLAUDE.md, when a risk is verified or closed.

### Verified repository facts
- Third-party keys (Mapbox, Xweather, OpenWeatherMap, OpenAQ, OpenUV, Tomorrow.io) are `VITE_*`
  variables and ship in the client bundle; they are not proxied server-side.
- `OwnerDashboard` has no sign-in gate and cannot persist owner edits; `sunstay-admin` has sign-in
  but no venue editing. Real owner editing needs an authenticated, server-side write path.
- `chat-sunny` accepts the public anon key as its bearer token. Its limits (`limits.js`) are per
  instance and in memory, so they cap bursts but are not a global quota.
- Mapbox tokens and a Supabase publishable key appear in earlier Git history.
- `src/index.css` still has 45 `backdrop-filter` lines; Xweather radar, cloud tiles and the comfort
  heatmap are optional map layers.
- No component tests, lint script or typecheck script.
- Venue data lives in several files: the app uses Supabase with `src/data/demoVenues.js` as the
  fallback; `src/data/venues.js` and `src/data/seedVenues.js` are used only by `scripts/`.
- Rain radar verified on production 2026-11-03 (#286): the Netlify Xweather key authenticates and
  radar tiles load. VenueMap waits for the MapsGL controller (`whenControllerReady`,
  `src/utils/mapsglReady.js`) before adding the layer. App owns `radarOn`, shared by the
  header switch and the map's layers menu.
- The Xweather `Account` matches the installed SDK (@xweather/mapsgl 1.9.4,
  `constructor(id: string, secret: string, serverOverrides?)`): VenueMap calls
  `new Account(id, secret)` with the pair from `parseXweatherCredentials`, and passes it to
  `new MapboxMapController(map, { account })`.
- Open-Meteo's free API is for non-commercial use only (https://open-meteo.com/en/terms). The app's
  forecast and air-quality calls and the `enrich-microclimate` job both use it keylessly; commercial
  use needs a paid Open-Meteo plan before launch.

### Requires production configuration or dashboard verification
- Whether Gemini quota or rate limits protect `chat-sunny`. (Production verified 2026-10-11: the
  hardening migration is applied, `venues` has only a public SELECT policy with RLS on, and the
  deployed `chat-sunny` has `verify_jwt = true`.)
- Whether the Mapbox token is URL-restricted and whether keys from Git history have been rotated.
- Whether `VITE_SENTRY_DSN` is set in Netlify so Sentry events are actually sent.

### Not currently verified in the repository
- Stripe, Airtable integration, and Supabase Auth in the main app.

### Physical iPhone / iOS Safari validation (cannot be replaced by unit tests)
- WebGL context loss and the "Resume map" flow under real memory pressure.
- Background/foreground and back/forward-cache returns redrawing the map at full size.
- Jetsam-kill reporting through `sessionCrashWatch`.
- Sheet drag, touch targets, safe-area insets and scroll behavior on device.
