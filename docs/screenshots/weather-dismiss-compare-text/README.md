# Weather dismissal and readable stay comparison

Branch: `codex/weather-dismiss-compare-text`. Baseline: current main `ec517ec`.
These are new local Chromium captures of that baseline and this branch, not
screenshots reused from the investor-demo audit.

## Changes

- The unchanged weather panel dismisses with Escape or an outside pointer tap.
  It preserves another control's focus, otherwise returns focus to the weather
  tile. Search suggestions and a hidden header clear the open state. Visible
  dialogs keep their own Escape handling. The panel's position, tile dimensions,
  content and weather calculations are unchanged.
- Compare keeps a native data table but moves each fact label above a full-width
  row of equally sized stay values. Names are 14px/800, values 14px/600, title
  17px and supporting text 12px. The existing clay icons stay inline with labels;
  Best months uses the existing sun-calendar icon. Best stay uses `#92400e`.
  No bordered tiles or new colours were added.

## Screenshots

| View | Before | After |
| --- | --- | --- |
| Weather open, 390×844 | [Before](weather-open-before-390.png) | [After](weather-open-after-390.png) |
| Weather after Escape, 390×844 | [Still open](weather-escape-before-390.png) | [Closed, tile focused](weather-escape-after-390.png) |
| Weather open, 320×568 | [Before](weather-open-before-320.png) | [After](weather-open-after-320.png) |
| Weather after Escape, 320×568 | [Still open](weather-escape-before-320.png) | [Closed, tile focused](weather-escape-after-320.png) |
| Three stays, 390×844 | [Before](compare-before-390.png) | [After](compare-after-390.png) |
| Three stays, 320×568 | [Before](compare-before-320.png) | [After](compare-after-320.png) · [Scrolled to footnote](compare-after-320-bottom.png) |
| Three stays, 1440×900 | [Before](compare-before-1440.png) | [After](compare-after-1440.png) |

## Browser and accessibility checks

- The weather tile, panel and header have exactly the same bounding boxes before
  and after at both phone widths. After Escape, the panel is absent,
  `aria-expanded` is false and the tile is focused.
- At 320, 390 and 1440px, every rendered Compare text element computes to at
  least 12px. Every element fits horizontally; there is no horizontal page
  overflow. Stay names start at the same vertical position in all three columns.
  The 390px sheet fits without scrolling; the 320px sheet retains its own vertical
  scroll and the existing 85dvh maximum. The close target remains 44×44px.
- Escape closes Compare and restores focus to `Compare (3/3)` at all three
  widths. The sheet's scroll lock and dialog handling remain in place.
- The accessibility tree retains a real table, three column headers, five fact
  row headers and fifteen data cells. Every value's `headers` attribute references
  both its stay and its fact. No CSS display overrides remove table semantics.
  [390px tree](compare-accessibility-after-390.json) ·
  [320px tree](compare-accessibility-after-320.json).
- Axe-core **4.14.0**, using the AGENTS.md WCAG/best-practice tags: **no new
  violations**. Weather-open has the same existing `label-content-name-mismatch`
  rule and three affected nodes before and after at each phone width. Compare
  has zero violations before and after. Label-in-name findings were explicitly
  outside this task. See [comparison](axe-comparison.json),
  [baseline measurements](browser-before.json) and
  [current measurements](browser-after.json).

## Tests

- `npm test`: **1,466 passed**, zero failures.
- `npm run build`: **passed**; the expected index/map/mapsgl large-chunk advisories remain.
- `npm run test:smoke`: **53 passed**, including 12 new browser regressions.
  The unchanged experience-finder suite passes.
- New browser regressions cover keyboard and pointer dismissal, inside taps,
  search suggestions, venue hide/close, Escape ownership for Filters and Preview
  time (in both opening orders), and the offline modal's deliberately inert
  Escape. Background touch focus restoration waits one animation frame for the
  compatibility mouse event; another control or dialog keeps its focus.
- Compare tests exercise one, two and three stays, native header associations,
  text sizes, column alignment, overflow, Tab containment, Escape/focus return
  and page scroll lock. `e2e/experience-finder.spec.js` is unchanged.

Re-run with `npm test`, `npm run build`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:smoke`.
The executable override is only for environments using system Chromium.

## Reproduction and limits

The browser uses the repository's fallback venues and the existing raw
Open-Meteo test fixture shifted to **11 November 2026, 11am Melbourne**. Weather
is fixture data, not a live conditions claim. An advancing date offset preserves
native animation frames and timers. All external HTTP requests and WebSockets
are blocked; only local app assets and fulfilled weather responses are used.
The before build runs in a detached worktree at `ec517ec`; the after build runs
from this branch. No production API was called and no data or settings were
changed.

To reproduce the comparison: open the venue list, choose Morning stays, select
Compare on Quest St Kilda Bayside, Sheraton Melbourne Hotel and Pan Pacific
Melbourne, then open Compare (3/3). The small virtualized list must be scrolled
to reach the later rows. Data and ranking are identical in each before/after pair.

No Mapbox token is configured locally, so screenshots show the expected map
fallback. Taps on a rendered Mapbox map were **not tested**. Actual VoiceOver
speech and physical iPhone touch behavior remain device checks; the browser
checks inspect semantics, focus, geometry and touch-sized controls.
