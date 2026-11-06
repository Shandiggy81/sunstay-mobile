# Proposed PR: Polish mobile weather labels, stay badges and venue keyboard navigation

Venue details previously left keyboard focus behind the card, while narrow-phone
weather and stay labels hid useful information with ellipses. This focused pass
adds venue-dialog keyboard handling and makes the existing weather/status and
stay-side labels readable without changing their data or wording.

## Changes

- Label venue details as a modal, focus its close button, contain forward/reverse
  Tab, close with Escape and restore focus on dismissal. Keep separate Sun Report
  and partner-preview dialogs working.
- Wrap the unavailable/loading weather message and preserve wind speed plus unit
  at 320px, retaining readable text and the existing tile dimensions.
- Wrap stay-moment badges so guests can see the side and level, with Estimated
  still explicit and Compare retaining its 44px target.

The [audit and screenshot index](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/README.md) records five priorities, the three
implemented improvements, existing strengths and larger recommendations. Weather
disclosure dismissal and Compare's small type remain explicit follow-up work.

## Evidence

| Case | 390px | 320px |
| --- | --- | --- |
| Sunny home | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-sunny-before-390.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-sunny-after-390.png) | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-sunny-before-320.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-sunny-after-320.png) |
| Weather unavailable | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-unavailable-before-390.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-unavailable-after-390.png) | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-unavailable-before-320.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-unavailable-after-320.png) |
| Stay side/level badge | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/stays-before-390.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/stays-after-390.png) | [Before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/stays-before-320.png) · [After](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/stays-after-320.png) |

Venue keyboard entry: [390px before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/venue-keyboard-before-390.png) · [after](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/venue-keyboard-after-390.png); [320px before](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/venue-keyboard-before-320.png) · [after](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/venue-keyboard-after-320.png).
Desktop: [1440×900 header](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/home-sunny-after-1440.png),
[1440×1200 stay list](https://github.com/Shandiggy81/sunstay-mobile/blob/codex/investor-demo-polish/docs/screenshots/investor-demo-polish/stays-after-1440x1200.png).

## Validation

- `npm test`: **1,457 passed**, zero failures.
- `npm run build`: **passed**; expected large-chunk advisories for index, map and mapsgl.
- Playwright smoke/regression tests: **39 passed**, including ten new mobile checks.
- Keyboard entry/trap/return, matching-room scroll, Sun Report and partner-preview checks pass at both phone widths.
- Axe-core 4.14.0: mobile cards and reports have zero violations; existing
  label/name mismatches on home/list controls reproduce on untouched main.
  No new violation targets in the eight matching baseline scans. Full results
  and baseline comparison are linked from the audit. Changed colour pairs meet
  4.5:1 (slate/white 4.76, amber/white 7.09, ink/white 17.85).
- Sampled header/list/Filters controls meet 44×44px; no horizontal page overflow
  in the captured 390×844 and 320×568 states. Wrapped labels remain readable.

Weather screenshots use deterministic labelled fixtures and existing local venue
data. No local Mapbox token was available, so actual tiles, pin appearance,
pinch-zoom and GPU recovery were not visually verified. Live Netlify access was
blocked and Mobbin was unavailable. A physical iPhone still needs VoiceOver,
safe-area, native keyboard and sheet-drag checks.

PR #295–299's Filters, weather-specific icons, Supabase permissions and Sun Report
hierarchy/terminology remain intact. No solar/weather algorithm, map lifecycle,
database, API key, Supabase file, production setting or dependency changed. Nothing
has been merged or deployed.
