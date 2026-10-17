# Venue card: Perfect for

390 × 844 mobile Chromium screenshots, captured with touch emulation.

- `before-390.png`: previous header layout (the new paragraph is disabled by browser-only module interception).
- `after-390.png`: Morning coffee and Sunset drinks, directly below the amenity chips.
- `all-moments-390.png`: all four moments wrap naturally without horizontal overflow.
- `shaded-390.png`: the line is absent when all moments are shaded.
- `no-horizon-390.png`: the line is absent while sun data is missing.

These are deterministic browser fixtures using the existing Wonderland Bar demo venue.
The browser date is 17 October 2026, 11 am Australia/Melbourne. Only the browser's
`useVenueSunHorizon` module response is intercepted: a 36-sector horizon leaves
sectors 6–10 and 27 open for the before/after pair, uses 89° in all sectors for the
shaded case, returns null for missing data, or uses 0° in all sectors for the
all-moments case. The real `outdoorSunDay` and `sunMomentsFromDay` computations run
and feed both the header line and the Sun moments today panel. Weather requests
are blocked, so the existing unavailable-weather state is visible.

The browser checks assert that the new line agrees with the available moments in
the lower Sun moments today panel, disappears in both hidden cases, never causes
horizontal page overflow, and preserves the 44 × 44 close target. No fixture data
or interception is shipped in the app. Supabase was not used or changed.

Validation: `npm test` (832 tests pass), `npm run build` (passes with the existing
large-chunk advisory). No physical-device validation was performed.
