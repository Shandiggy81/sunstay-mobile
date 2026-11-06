# Investor-demo polish: audit and evidence

Baseline: `de1e4a8` (`origin/main`, including PR #299). Work branch:
`codex/investor-demo-polish`. The audit identified five priorities; this pass makes
three bounded improvements to presentation and keyboard usability.

## Five findings, in priority order

| Priority | Observed issue | Decision |
| --- | --- | --- |
| 1 | Opening a venue with Enter leaves focus on the row behind it. Tab can remain outside the venue, Escape does not close it, and a deep link leaves focus on the page body. | **Implemented:** labelled modal semantics, initial close-button focus, forward/reverse Tab containment, Escape dismissal and focus return. The Sun Report and partner preview retain their separate dialog handling. |
| 2 | At 320px the disabled weather tile says “Live weather u…”; 390px also truncates the unavailable message. “Light breeze · 7 km/h” loses part of its unit at 320px. | **Implemented:** let the existing unavailable/loading label wrap; preserve the wind description and speed at a readable 12px minimum on narrow phones. The 58px weather tile and existing weather wording/rules stay intact. |
| 3 | Stay list badges truncate the side and level, hiding part of the information used to compare stays. Quest reads “Morning 6:13am–10:00am · Nor…” at 320px. | **Implemented:** wrap the existing badge naturally and align “Estimated” with its first line. Ranking, dates, side names, levels and comparison behavior stay intact. |
| 4 | The weather detail disclosure stays open after Escape and a blank-map tap; only its trigger dismisses it. | **Deferred:** follow up with the app's existing popover dismissal/focus pattern. No weather logic change is needed. |
| 5 | Stay Compare uses 11px table/caption text, a 9px “Best stay” label and approximately 8.8px metadata. | **Deferred:** give comparison a deliberate readable mobile layout, preserving its data and current scroll behavior. |

The first three changes are isolated to `VenueCard.jsx` and its `VenueHero` toolbar in
`VenueCardSections.jsx`, `MapFirstTopBar.css` and the stay-badge rules in `index.css`. No solar or weather helper, map component,
database, API key, production setting or Supabase file changed.

## What already works well

- Quest, Pullman, Industry Beans Fitzroy and The Vineyard fit both phone widths
  without horizontal page overflow. The long Pullman name wraps cleanly, including
  three lines at 320px, without colliding with its score.
- The sampled venue cards and Sun Report use text of at least 12px; the separate
  Compare sheet is the confirmed exception. Close/share/save and primary card
  actions retain at least 44px targets.
- Stays have the genuine property-website action; hospitality cards retain their
  directions action. The rainy café state uses the correct clay weather icon and
  keeps its source/model explanation.
- The Sun Report is substantially easier to scan after PR #299: compact best-side
  rows, a single shared-level description, one trust line and folded year/season
  details. Its layout and calculations are unchanged here.

Recent merged work was reviewed before editing: PR #295's quick-pick Filters,
four groups, focus behavior and 390px desktop docking; PR #296's weather-aware
venue headline icon; PR #298's weather-aware home clause; and PR #299's Sun Report
decluttering, room-type versus facade-side wording and shared-level handling.
PR #297's Supabase permission changes are outside this frontend pass and untouched.
The existing clay artwork, brand, warm-white/amber/slate palette and map-first
navigation are preserved.

## Capture method and limits

These are actual local Chromium captures, collected before editing and after the
corresponding change. They are not generated mockups. Phone captures use touch
viewports of **390×844** and **320×568**, Melbourne timezone, and local application
assets. Home weather uses the existing Open-Meteo fixture anchored to 19 October
2026, 11am Melbourne. Its separate cold/rain/wind scenario is a labelled synthetic
fixture: 9°C, feels 5°C, 90% rain, 36km/h wind and 65km/h gusts. The unavailable
scenario returns HTTP 503.

Card/report captures use an advancing clock starting 6 November 2026, 11am
Melbourne, with the existing clear-weather fixture shifted to that date. The rainy
card fixture is 10°C, feels 7°C, 2mm precipitation, 85% rain and 32km/h wind. These
weather scenarios exercise the existing UI; they are not claims about live venue
conditions. Before/after pairs use the same fixture and venue data.

External browser requests were blocked except fulfilled weather fixtures; no live
APIs or production writes were used. The repository's existing fallback venue data
is used, including real venue names. Local counts are not a production inventory
claim. No Mapbox token is configured, so the honest “Map failed to load” fallback is
visible: tiles, pin appearance, gestures and WebGL recovery could not be visually
checked. The live Netlify reference was unavailable from this environment, and no
Mobbin connector was callable. Repository design documentation and recent captures
were reviewed instead of claiming a live-site or Mobbin comparison.

## Before and after

| View | 390px before | 390px after | 320px before | 320px after |
| --- | --- | --- | --- | --- |
| Sunny home: wind speed/unit | [Before](home-sunny-before-390.png) | [After](home-sunny-after-390.png) | [Before](home-sunny-before-320.png) | [After](home-sunny-after-320.png) |
| Weather unavailable: full honesty label | [Before](home-unavailable-before-390.png) | [After](home-unavailable-after-390.png) | [Before](home-unavailable-before-320.png) | [After](home-unavailable-after-320.png) |
| Morning stays: side, level and Estimated | [Before](stays-before-390.png) | [After](stays-after-390.png) | [Before](stays-before-320.png) | [After](stays-after-320.png) |
| Venue keyboard entry | [Before](venue-keyboard-before-390.png) | [After](venue-keyboard-after-390.png) | [Before](venue-keyboard-before-320.png) | [After](venue-keyboard-after-320.png) |

Desktop regression evidence: [home header, 1440×900](home-sunny-after-1440.png)
and [stay badges, 1440×1200](stays-after-1440x1200.png). At 1440×900, activating
Morning stays already leaves a very short list viewport beneath the sidebar
controls, both before and after; the taller capture verifies the badge itself.
That pre-existing sidebar-density issue is not changed in this pass.

## Current-state audit evidence

These captures document strengths or deferred findings; they are not before/after
claims for an implemented change.

| View | 390px | 320px |
| --- | --- | --- |
| Weather disclosure after Escape (still open, deferred) | [Capture](audit-weather-disclosure-390.png) | — |
| Stay Compare readability (deferred) | [Capture](audit-compare-390.png) | — |
| Rainy Industry Beans Fitzroy card | [Capture](audit-cafe-rainy-390.png) | [Capture](audit-cafe-rainy-320.png) |
| Current Sun Report, unchanged | [Capture](audit-sun-report-390.png) | [Capture](audit-sun-report-320.png) |
| Long Pullman name, unchanged | [Capture](audit-pullman-390.png) | [Capture](audit-pullman-320.png) |

## Validation

- Browser measurements confirm unavailable-weather copy and wind speed fit after
  the header change. The weather tile remains 58px high, with no header shift;
  390px and desktop header geometry stays unchanged.
- At both phone widths, sampled stay badges have `scrollWidth === clientWidth`;
  side and level are visible on two lines with Estimated explicit. Compare remains
  approximately 79.5×44px, opens normally and closes with Escape.
- Home, expanded list and Filters audit captures have no horizontal document
  overflow, browser page errors or visible controls below 44×44px.
- Keyboard checks pass at both phone widths: Enter opens with focus on Close;
  forward/reverse Tab stays inside; Escape returns to the visible list handle.
  Matching-room autoscroll keeps the compact Close focused and skips the hidden
  toolbar. Scrolling back restores the full-toolbar focus correctly.
- Sun Report opens with Back focused, Escape closes only the report and returns
  to its trigger. Partner preview likewise keeps its own focus/close behavior.
  [Recorded keyboard measurements](keyboard-results.json).
- Changed text/background pairs retain WCAG AA contrast for normal text:
  slate `#64748B` on white **4.76:1**, amber `#92400E` on white **7.09:1**,
  ink `#0F172A` on white **17.85:1**. Changed visible text remains at least 12px.
- Axe-core 4.14.0: 17 scans across home, list, Filters, café/stay cards and Sun
  Report at 320/390px and desktop. Mobile cards and reports have zero violations;
  all scans have no horizontal overflow. Existing `label-content-name-mismatch`
  findings remain on home/list controls (also present behind the desktop card).
  The same targets reproduce on untouched `de1e4a8`: all eight matching baseline
  home/list/Filters scans have the same rule and target counts. This is **not** a
  zero-violation claim for the whole app. See [current results](axe-results.json),
  [baseline results](axe-baseline-results.json), and
  [baseline comparison](axe-baseline-comparison.json).
- Axe was run from a temporary downloaded package; no dependency or lockfile changed.
- `npm test`: **1,457 passed**, zero failures.
- `npm run build`: **passed**, with the expected large-chunk advisories for index,
  map and mapsgl.
- Playwright smoke: **39 passed**, including all existing regressions. Ten new browser regressions cover
  readable weather/stay text, venue keyboard navigation, matching-room scrolling
  and nested Sun Report behavior at both phone widths.

Re-run with `npm test`, `npm run build`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.
The new browser tests are in `e2e/investor-polish.spec.js`. They block external
requests and use native timers with an advancing fixed-date offset, so Framer
Motion actually paints and the tests wait for the visible card's opacity.

Physical iPhone checks still needed: VoiceOver announcements/focus return, safe-area
spacing, touch sheet drag, native keyboard behavior, map pinch gestures and context
loss/Resume with a real Mapbox token. Contrast and target checks are scoped to the
audited UI; this is not a whole-product WCAG certification.

## Future work

After the two deferred findings, consider a separate progressive-disclosure design
for repeated stay facade panels. Quest and Pullman currently require substantial
scrolling before secondary venue facts. Preserve the accurate side/room-type and
modelled-data distinctions, and reuse the Sun Report's improved hierarchy rather
than adding more cards or claiming bookable-room accuracy.
