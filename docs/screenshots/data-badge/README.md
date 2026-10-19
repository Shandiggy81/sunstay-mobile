# Data badge development preview

Run `npm run dev`, then open `/dev/data-badge.html` on that development server.
The default page shows both surfaces. Add `?surface=light` or `?surface=dark`
to inspect one surface. This standalone entry is not imported by the app and
is absent from the production build; it will not appear in a Netlify preview.

The fixtures cover Live, Forecast, Calculated, Estimated, Demo, Cached, and
Unavailable (missing, invalid, or future update timestamp), in both sizes.
All metadata is fabricated. No venue or weather services are called.
The current-conditions fixtures describe model data, not station observations.
Live, Cached and Forecast examples show known ages directly on the pill. The
other kinds do too when supplied a timestamp; missing ages are never invented.
Accessible names retain the full update sentence and optional source.

`getBadgeState` requires an explicit `now`. Timestamps can be Date objects,
epoch milliseconds, or timezone-qualified ISO strings. Ambiguous local/date-only
strings and impossible calendar dates are rejected. Live requires a valid,
non-future timestamp no older than 15 minutes (inclusive); stale observations
become Cached, and missing/invalid/future observations become Unavailable.
The component refreshes at age/expiry boundaries and when a tab returns.

## Captures and verification

Both screenshots use Chromium at a 390×844 touch viewport, reduced motion,
and a controlled clock. External requests, including the optional web font,
were blocked. These are development fixtures, not live observations.

- [Light surface](light-390.png)
- [Dark surface](dark-390.png)

Browser assertions passed for all 18 badges per surface, accessible names,
no horizontal overflow (including deliberately narrow pills), automatic Live
expiry, and a suspended-tab clock jump. Ten consecutive renders with unchanged
kind/timestamp did not re-register listeners; changing kind refreshed correctly.
Computed badge text contrast was at least 7.24:1 on both surfaces. Reduced motion
disabled animation; normal motion pulsed only Live dots. No page errors.
The pill is informational and has no interactive target.

Live uses a filled amber dot, Cached a hollow amber ring, Forecast a sky cloud
icon, Calculated a slate dot, Estimated a dotted border and ≈ marker, Demo a
dashed border with slate fill and flask icon, and Unavailable muted text without
a marker. Text is always present, so meaning does not rely on colour.

Only existing surface, ink, accent, slate and sky palette tokens are used; no
tokens or dependencies were added. No existing application components are wired to it.
Physical iPhone/Safari and screen-reader checks remain manual.
