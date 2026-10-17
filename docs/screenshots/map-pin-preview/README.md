# Map pin preview

Chromium mobile emulation at 390 × 844 with touch input and the real Mapbox map.

- `before-390.png`: unchanged main (`781beb2`); tapping the pin opens the full venue card.
- `after-390.png`: the same pin opens a compact preview above the collapsed venue list, with a photo, sun status and three key amenities.
- `fallback-390.png`: another pin replaces the preview and uses its clay VenueIcon when no photo exists.

The local app uses three browser-response-only demo fixtures near the CBD to keep
all pins reachable. The first venue has a photo and all four key amenity tags to
verify the three-chip limit; the second has no photo and has a dog-friendly tag.
The browser clock and cached clear-sky weather are fixed to 17 October 2026,
11 am Australia/Melbourne. No demo source, credentials, or database data changed.
Network requests outside Mapbox/fonts were blocked; no Supabase writes or backend
chat requests were made. These fixtures and request interception do not ship.

Browser checks cover one preview at a time, photo loading, clay fallback, 44 × 44
close target, opening full details, downward swipe dismissal, upward swipe staying
open, keyboard opening after an upward swipe, Escape, real canvas drag dismissal,
opening Filters, and list rows still opening full details. Touch gestures were
sent through Chrome's input protocol; these are browser checks, not physical
phone validation. Both page errors and Mapbox HTTP failures were absent.

The App wrapper observes canvas pointer movement without intercepting it.
`VenueMap.jsx` and all map lifecycle/recovery helpers are unchanged.
