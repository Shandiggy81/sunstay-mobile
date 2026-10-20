# Clay suns at sun-window peaks

Captured 21 October 2026 in Chromium, at 320, 390 and 768 CSS pixels wide
(844px viewport height, device scale factor 1). Before is fetched main
`044117d7abd2fce70233891ab3544ca089f9c714`, including café list-row PR #208.
After changes only `src/components/SunWindowsGraph.jsx`.

All pairs use identical inputs and a fixed clock: 20 October 2026, 1:15pm
Melbourne time. These are development fixtures, not real venue claims.
The graph preview also has its own explicit example clocks for the Now cases.

| Surface | Width / motion | Before | After |
| --- | --- | --- | --- |
| Café detail sun section | 320px | [Before](detail-320-before.png) | [After](detail-320-after.png) |
| Café detail sun section | 390px | [Before](detail-390-before.png) | [After](detail-390-after.png) |
| Café detail sun section | 768px | [Before](detail-768-before.png) | [After](detail-768-after.png) |
| Café detail sun section | 390px, reduced motion | [Before](detail-390-reduced-motion-before.png) | [After](detail-390-reduced-motion-after.png) |
| Café list rows | 320px | [Before](list-row-320-before.png) | [After](list-row-320-after.png) |
| Café list rows | 390px | [Before](list-row-390-before.png) | [After](list-row-390-after.png) |
| Café list rows | 768px | [Before](list-row-768-before.png) | [After](list-row-768-after.png) |
| Café list rows | 390px, reduced motion | [Before](list-row-390-reduced-motion-before.png) | [After](list-row-390-reduced-motion-after.png) |
| Dev graph preview | 320px | [Before](graph-preview-320-before.png) | [After](graph-preview-320-after.png) |
| Dev graph preview | 390px | [Before](graph-preview-390-before.png) | [After](graph-preview-390-after.png) |
| Dev graph preview | 768px | [Before](graph-preview-768-before.png) | [After](graph-preview-768-after.png) |
| Dev graph preview | 390px, reduced motion | [Before](graph-preview-390-reduced-motion-before.png) | [After](graph-preview-390-reduced-motion-after.png) |

## Capture setup

- Detail: `/dev/cafe-sun-section.html?wide`, rendering the actual
  `CafeSunSection` with its existing fabricated horizons/forecast and locally
  calculated engine windows. The `wide` option exercises the desktop-width sheet.
- Graph: `/dev/sun-windows-graph.html?surface=light`, including multiple,
  long, short, 12-minute, empty and mini examples.
- List: a temporary ignored harness renders the actual internal
  `VenueListCard` from `src/App.jsx`. The browser-intercepted module response
  adds an export solely for capture; no production export/file is changed.
  Three fictional cafés use long, split and short-window building horizons.
  A local WeatherContext fixture omits weather and score; no data providers
  are mounted. Capture waits for all three `[data-row-sun="ready"]` states.
- The browser clock is fixed before navigation. Fonts and SVG image decoding
  complete before capture; all fixture content is scrolled into view so lazy
  images load. Reduced-motion captures use the real media preference.
- No environment variables were changed. The fixture pages made no external
  data requests; the local Vite development connection was allowed.

## Verification

- `npm ci`: passed, 149 packages installed; audit reported zero vulnerabilities.
- `npm test`: **1,060 passed**, zero failed/skipped/cancelled.
- `npm run build`: passed; expected large-chunk warnings for index/map/mapsgl.
  The production build emits the existing hashed `sun.webp` asset.
- All 24 captures: zero console/page errors and no horizontal page overflow.
- Before/after comparison: identical graph hill paths, shade/night gap paths,
  graph counts and accessible summaries for every capture.
- Compact list image boxes: **21.33–23.99px** across the captured widths,
  with a size floor allowing for the asset's transparent padding. Longer
  windows retain larger icons. Peaks render outside the band's clip path.
- Every peak image keeps `data-window-sun="true"`, a centered square image,
  `preserveAspectRatio="xMidYMid meet"`, `aria-hidden="true"` and
  `focusable="false"`. No separate accessible image is exposed inside a graph.
- Forced `clayIconUrl('sun') === null` in the browser: all 13 fixture peaks
  use the existing vector fallback with valid definition references; graph
  summaries are identical. With the asset present, vector-only definitions
  are omitted. The dark preview also passes these checks.
- Scoped icon audit: `CafeSunSection` and PR #208's live list row already use
  `ClayIcon` for the other sun-data icons. Legacy `VenueRow`, forecast glyphs,
  map pins and unrelated sections were left untouched.

These checks cover Chromium desktop/mobile viewport rendering, not physical
iPhone/Safari behaviour. No layout calculations, sun windows, totals or test
expectations changed.
