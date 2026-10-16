@AGENTS.md

# SunStay — Claude Code guide

AGENTS.md (above) holds the shared commands, test recipes, browser-verification and Netlify
deploy checks. It was written for a Cursor Cloud Linux VM; its tmux/xdotool/ffmpeg steps do not
apply on Windows. This file adds repository facts and rules for Claude Code.

## Purpose
Mobile-first web app that helps people find Melbourne venues and stays by sun, weather and
comfort: a Mapbox map of venues with sun-score pins, a venue list, and a venue detail card
with forecast, sun, wind, UV and air-quality panels.

## Stack (from package.json)
React 19, Vite 7, Tailwind CSS 4 (`@tailwindcss/postcss`), mapbox-gl 3, @supabase/supabase-js 2,
@sentry/react, @xweather/mapsgl, react-virtuoso, framer-motion, lucide-react, suncalc.
JavaScript/JSX. npm with `package-lock.json`. Hosted on Netlify (`netlify.toml`, Node 22).
`sunstay-admin/` is a separate Vite app with its own package.json and lockfile.

## Scripts
- `npm run dev` — `vite --host` (port 5173 from `vite.config.js`)
- `npm run build` — `vite build`; manual chunks `vendor`, `map`, `ui`, `mapsgl`
- `npm run preview` — `vite preview`
- `npm test` — `node --test src/utils/*.test.js src/hooks/*.test.js`
- `npm run seed` — `node scripts/seedVenues.js`. Do not run without explicit approval.
- There is no lint or typecheck script.

## Testing
- Node's built-in test runner only; no jest, vitest or React Testing Library.
- Test files must be in `src/utils/` or `src/hooks/` and end in `.test.js`, or the glob skips them.
- Components are not unit-tested. Put logic in pure helpers under `src/utils/` and test those;
  verify components in a browser.
- Single file: `node --test src/utils/mapRecovery.test.js`
- At commit 927b215, npm ci completed successfully, npm test passed 351/351 tests in 86 suites, and npm run build completed successfully. The build emits existing large-chunk advisories for map, mapsgl, and index; these are warnings, not errors.

## Entry points and data flow
- `index.html` → `src/main.jsx`: Sentry init → `watchSessionCrashes` → `<App/>` in `StrictMode`.
- `src/App.jsx`: `WeatherProvider` > `MicroclimateProvider` > `AppErrorBoundary` > `AppContent`,
  with `NetworkErrorModal` alongside. No router; panels and sheets are toggled with React state.
  `FilterSheet` and `OwnerDashboard` are loaded with `React.lazy`. Venue lists use `react-virtuoso`.
- State: React state and props, plus `WeatherContext` (Open-Meteo, Melbourne CBD, localStorage cache)
  and `MicroclimateContext`. No Redux/Zustand/React Query.
- Venues: `useVenues` starts with `src/data/demoVenues.js` and replaces it with Supabase `venues`
  rows when the client is configured; on failure it keeps the demo data.
  `MicroclimateContext` calls the `venues_in_bbox` RPC.
- `src/components/VenueCard.jsx` is wrapped in `VenueDetailErrorBoundary` and `ForecastErrorBoundary`,
  defers forecast fetching (`useDeferredForecastReady`), and calls the OpenAQ, Tomorrow.io and OpenUV hooks.

## Map lifecycle (src/components/Map/VenueMap.jsx)
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

## Monitoring
- `@sentry/react` is initialised in `src/main.jsx`. It sends only when `VITE_SENTRY_DSN` is set;
  otherwise a placeholder DSN keeps it disabled. Global error and unhandled-rejection handlers are on.
- `src/utils/sessionCrashWatch.js` keeps a sessionStorage flag (`ss-session-open`) that is cleared on
  `pagehide`. On the next load, a leftover flag is reported to Sentry: `foreground` as a fatal
  "Abnormal Session Termination (Possible Jetsam Kill)", `background` as an info "Background tab evicted".

## Supabase and authentication
The main SunStay app has no user authentication. The separate sunstay-admin app has Supabase email/password sign-in.
- `src/lib/supabase.js` exports `null` when the URL or anon key is missing, and refuses keys that look
  like service-role or `sb_secret_` keys. Callers must guard `if (supabase)`.
- Schema, RPCs and policies: `supabase/migrations/`. Seeds: `supabase/seeds/`.
  `20260917_harden_venues_policies.sql` drops the public UPDATE policy on `venues`.
- `supabase/migrations/` matches production's recorded migration history (project
  `fksuqgvsazoxarocmaii`) version for version. Older local files are in
  `supabase/migrations_archive/`; never replay them. Before any `supabase db push`, run
  `supabase migration list` and confirm only the new migrations are local-only; see
  `supabase/reconciliation/README.md`.
- New `public` functions and tables get anon/authenticated grants by default in this project.
  Revoke from `public, anon, authenticated` by name, and enable RLS on every new table.
- `OwnerDashboard.jsx` is reachable from the venue card ("Manage this partner venue" in
  `VenueCardActions.jsx`) without sign-in. It is a device-local preview: production has no UPDATE
  policy on `venues` for anon or authenticated, so it makes no Supabase writes and says so.
- Edge Function `supabase/functions/chat-sunny` calls Gemini with a server-side `GEMINI_API_KEY`
  secret. `supabase/config.toml` sets `verify_jwt = true`; the client sends the user token or the anon key.
- Do not apply migrations, deploy functions or change remote Supabase without explicit approval.
- **Merging to `main` deploys to production.** The Supabase GitHub integration redeploys every
  function in `supabase/functions/` from `main` (seen 2026-10-11: both functions redeployed 41 s
  after PR #104 merged) and may also push pending migrations. Treat merging a PR that touches
  `supabase/` as a production deploy.

## Integrations and environment variables
Every `VITE_*` value is compiled into the browser bundle. See `.env.example`.
- `VITE_MAPBOX_TOKEN` — Mapbox (required for the map)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — optional; demo data is used without them
- `VITE_SENTRY_DSN` — optional
- `VITE_XWEATHER_KEY` — Xweather radar via `@xweather/mapsgl`, loaded with dynamic `import()` in VenueMap
- `VITE_OPENWEATHER_KEY` — OpenWeatherMap cloud tile layer on the map
- `VITE_OPENAQ_API_KEY`, `VITE_OPENUV_API_KEY`, `VITE_TOMORROW_API_KEY` — optional detail-card data
- Keyless: Open-Meteo forecast and air quality.
- Stripe: Not currently verified in the repository.
- Airtable: Not currently verified in the repository (mentioned only in a code comment in `src/data/demoVenues.js`).
- Supabase Auth in the main app: Not currently verified in the repository.

## Styling
- Tailwind v4 through `@import "tailwindcss"` and an `@theme` block in `src/index.css`:
  `--color-accent` (amber-500), `--color-ink` (slate-900), `--color-surface` (slate-50),
  `--font-sans` (Plus Jakarta Sans, Inter). Prefer these tokens.
- Most component styling is hand-written `ss-` prefixed, BEM-style classes in `src/index.css`;
  Tailwind utilities and inline styles also appear. Follow the file you are editing.
- The base reset is inside `@layer base` on purpose; keep it there.
- Mascot images are ES-module imports from `src/assets/mascots/` so they get hashed filenames;
  do not move them to `public/` (see AGENTS.md).

## Project rules
- Make minimal, focused diffs.
- Preserve the current React/Vite/Tailwind/Mapbox/Supabase/Netlify stack unless a task explicitly changes it.
- Preserve the existing amber/slate visual language and mobile-first UX.
- Preserve 44×44-point minimum mobile touch targets.
- Preserve manual Mapbox recovery behavior.
- Do not add automatic WebGL retry loops.
- Never expose API keys, tokens, secrets, or private user data.
- Never hard-code secrets or commit `.env` files, except approved example files.
- Do not run destructive commands.
- Do not force-push.
- Do not merge or deploy to production without explicit approval.
- Run `npm test` and `npm run build` after relevant code changes.
- Separate automated validation from physical-device-only validation.
- Do not run `npm run seed` without explicit approval.

## Known risks and gaps

### Verified repository facts
- Third-party keys (Mapbox, Xweather, OpenWeatherMap, OpenAQ, OpenUV, Tomorrow.io) are `VITE_*`
  variables and ship in the client bundle; they are not proxied server-side.
- `OwnerDashboard` has no sign-in gate and cannot persist owner edits; `sunstay-admin` has sign-in
  but no venue editing. Real owner editing needs an authenticated, server-side write path.
- `chat-sunny` accepts the public anon key as its bearer token. Its limits (`limits.js`) are per
  instance and in memory, so they cap bursts but are not a global quota.
- Mapbox tokens and a Supabase publishable key appear in earlier Git history.
- `src/index.css` still has 61 `backdrop-filter` rules; Xweather radar, cloud tiles and the comfort
  heatmap are optional map layers.
- No component tests, lint script or typecheck script.
- `VenueCard.jsx` imports `src/data/venues.js` and `src/data/seedVenues.js` alongside the app's
  venue list; venue data lives in several files.

### Requires production configuration or dashboard verification
- Whether Gemini quota or rate limits protect `chat-sunny`. (Production verified 2026-10-11: the
  hardening migration is applied, `venues` has only a public SELECT policy with RLS on, and the
  deployed `chat-sunny` has `verify_jwt = true`.)
- Whether the Mapbox token is URL-restricted and whether keys from Git history have been rotated.
- Whether `VITE_SENTRY_DSN` is set in Netlify so Sentry events are actually sent.

### Not currently verified in the repository
- Stripe, Airtable integration, and Supabase Auth in the main app.
- Whether the Xweather `Account` is constructed with the arguments the installed SDK expects
  (VenueMap passes a single key).

### Physical iPhone / iOS Safari validation (cannot be replaced by unit tests)
- WebGL context loss and the "Resume map" flow under real memory pressure.
- Background/foreground and back/forward-cache returns redrawing the map at full size.
- Jetsam-kill reporting through `sessionCrashWatch`.
- Sheet drag, touch targets, safe-area insets and scroll behavior on device.
