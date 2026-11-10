# PR review checklist

For a reviewer (human or agent) reading a SunStay pull request. Check only the sections the diff
touches, and say which items were checked by a test, in a browser, or not at all.

## Always
- `npm test`, `npm run build` and `npm run test:smoke` pass on the PR's head commit.
- The diff is focused: no unrelated files, no dependency or lockfile change without a reason.
- Nothing is merged or deployed by the reviewer. Merging to `main` deploys to production.

## Sunlight calculations
Files: `src/utils/balconySunEngine.js`, `stayRanking.js`, `roomProfiles.js`,
`stayRoomTypes.js`, `hotelSunReport*`, `homeConditions.js`.
- A change to a calculation comes with a unit test for it.
- Times are venue-local (Melbourne) and still correct when the browser is in another time zone.
- "Modelled" and "Estimated" labels are kept wherever the data is not hotel-confirmed.
- A side or stay is not called "best" on a few minutes of sun (the under-half-the-moment rule).
- The list row, map pin and venue card still show the same score for the same venue and time.

## Weather data
Files: `src/utils/openMeteoClient.js`, `weatherService.js`, `WeatherContext`, the OpenAQ, OpenUV and
Tomorrow.io hooks, `supabase/functions/weather`.
- Forecast calls go through `openMeteoClient.js`; no new direct calls to a weather host.
- The weather-unavailable and loading states still render and stay readable.
- The icon matches the condition, including rain and night.
- No new client-side API key, and no new paid or quota-bound call without Shannon's approval.

## Mobile UI
- Checked at 390×844 and 320×568: no horizontal page overflow, no ellipsis hiding facts.
- No text under 12px; sizes come from 22/17/14/13/12.
- Touch targets are at least 44×44.
- Gold is the only accent, dividers rather than bordered tiles, one chip style, no new `backdrop-filter`.
- Mascot images stay in `src/assets/mascots/` as imports, not in `public/`.

## Accessibility
- Axe (tags in AGENTS.md) shows no new violations on the screens the diff touches.
- Dialogs take focus on open, contain Tab, close on Escape and return focus to their opener.
- One Escape press closes one layer.
- `aria-expanded`, `aria-pressed` and `aria-checked` match what is on screen.
- Tables and lists keep their semantics after layout changes.

## Security
- No secrets, tokens or `.env` files in the diff or in screenshots and logs.
- No service-role or `sb_secret_` key in `src/` or any `VITE_*` variable; `src/lib/supabase.js` guards are intact.
- New tables have RLS enabled; new functions and tables have grants revoked from `public, anon, authenticated` by name.
- No new write path to `venues` from the browser.

## Deployment
- Any change under `supabase/` is called out as a production deploy on merge (functions redeploy, migrations may push).
- `supabase/migrations/` only gains new files; nothing from `migrations_archive/` is replayed.
- `netlify.toml` redirects and cache headers are unchanged, or the change is explained.
- The map keeps manual "Resume map" recovery, with no automatic WebGL retry.
- Sentry environment and release wiring (`vite.config.js`, `sentryEnvironment.js`) is unchanged, or explained.

## Cannot be checked automatically
Say so in the review rather than implying it passed:
- Taps and gestures on the real Mapbox map without a token.
- WebGL context loss, background/foreground returns and jetsam kills on a physical iPhone.
- VoiceOver, safe-area insets and sheet drag on device.
