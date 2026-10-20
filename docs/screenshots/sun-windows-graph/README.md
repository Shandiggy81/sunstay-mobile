# SunWindowsGraph development preview

Run `npm run dev` and open `/dev/sun-windows-graph.html` on that server.
It shows both surfaces; `?surface=light` or `?surface=dark` isolates one.
The page and its entry are excluded from the production build. No application
component is wired to the graph. All examples are labelled fabricated fixtures;
they make no venue, weather or map requests.

- [Light, all seven examples](light-390.png)
- [Dark, all seven examples](dark-390.png)
- [Light, first viewport](light-top-390.png)
- [Dark, first viewport](dark-top-390.png)

Captures use a 390×844 touch viewport, a Los Angeles browser timezone,
self-hosted Plus Jakarta Sans and reduced motion. The full-page captures show
two windows, one long window, three short windows, no sun, Now inside sun,
Now in a gap, and the mini variant. Window/clock metadata is fixed, not live.

## API and data contract

`layoutSunWindows({ windows, date, timezone, now, axisStart, axisEnd })` is pure.
The default timezone is Australia/Melbourne. Window endpoints accept Date
objects (including the shape from `sunMoments.js`), finite epoch milliseconds
or timezone-qualified ISO strings. Date objects and arrays are never mutated.
Date-only and unzoned strings are rejected as window instants. `date` may be a
venue calendar date or an instant; invalid date/timezone/axis input throws.

Windows are sorted, merged when overlapping/touching, and clipped first to the
venue date and then the displayed axis. Nonpositive windows are dropped;
malformed timestamps are counted separately so the UI can report unavailable
or partial data instead of inventing a no-sun result.

The default axis fits the supplied windows with 45-minute padding, rounded
outward to real venue-local hours. Empty dates use 6am–6pm. Explicit axes are
allowed and restricted to the requested date. Totals describe exactly the
displayed, clipped windows; a cropped axis is labelled as shown hours, including
when it excludes all sun. Durations preserve seconds/milliseconds when present,
so per-window labels never round apart from the headline. The reference example
correctly totals **8h 33m**, rather than the illustrative mockup's 6h 25m.

Elapsed milliseconds drive geometry and totals across DST. Labels use the venue
timezone, with UTC offsets when a clock change would make them ambiguous.
Hills/suns are decorative duration-scaled shapes, not solar-altitude or weather
forecasts. Hill height is capped; each sun stays at its window midpoint.

The graph has no internal clock: pass `now` to show a marker only on the matching
venue date. A current time outside the axis gets an honest header note rather
than a marker at the wrong displayed hour. Mini renders only the hills bar with
an accessible summary; full renders dates, ticks, readable window chips and an
optional React `footer` slot. No entrance animations are used in either mode.

## Verification

- 32 new node:test cases cover exact totals, normalization/clipping, malformed
  inputs, each supported input type, Date immutability, capped geometry, Now,
  long tick labels, Melbourne DST start (4 October 2026) and end, and identical
  output in five host timezones.
- Browser assertions passed for all seven examples on both surfaces: accessible
  summaries, headline/chip totals, one hill/sun per window, both Now states,
  no labels/chips/footer in mini, unique SVG IDs and valid references, loaded
  font, no horizontal overflow, and scrolling to the last example.
- Both motion preferences remain static. Measured HTML text contrast was at
  least 7.24:1. No page errors or external requests occurred.
- Independent browser checks in Europe/London passed for clipped/empty axes,
  invalid data, different-date/outside-axis Now, and ignored mini footers.
  Scrolling and no horizontal overflow were verified at 320, 390 and 768px.
- Full `npm test`: 980 passed, zero failed/skipped. Production build passed
  with only the existing large-chunk advisory; preview/graph entries are absent
  from emitted HTML/JavaScript.
- Existing accent/ink/surface plus Tailwind amber/slate/sky tokens only; no new
  colour tokens or dependencies. Window chips are informational, not buttons.
- Physical iPhone/Safari and screen-reader checks remain manual.
