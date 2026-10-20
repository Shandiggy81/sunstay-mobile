# Sunny advice and detail-graph sun verification

Chromium, 844px viewport height, device scale 1, touch enabled, at 320 / 390 / 768px widths.
Weather is the existing `e2e/fixtures/weather.js` Open-Meteo fixture (23°C), with the
clock fixed to 19 October 2026 at 11am Melbourne. No external weather, map, telemetry,
AI or Supabase requests leave the browser. A missing Mapbox token shows the documented
map error; it does not affect the advice or detail-card checks.

| State | 320px | 390px | 768px |
| --- | --- | --- | --- |
| Auto advice | [Image](bubble-auto-320.png) | [Image](bubble-auto-390.png) | [Image](bubble-auto-768.png) |
| After six-second timeout | [Image](bubble-timeout-320.png) | [Image](bubble-timeout-390.png) | [Image](bubble-timeout-768.png) |
| Chat open, no bubble | [Image](chat-open-320.png) | [Image](chat-open-390.png) | [Image](chat-open-768.png) |
| Café graph before | [Image](cafe-graph-before-320.png) | [Image](cafe-graph-before-390.png) | [Image](cafe-graph-before-768.png) |
| Café graph after | [Image](cafe-graph-after-320.png) | [Image](cafe-graph-after-390.png) | [Image](cafe-graph-after-768.png) |

Reduced motion at 390px: [shown](reduced-motion-auto-390.png) / [after timeout](reduced-motion-timeout-390.png).
The bubble and Sunny button have no transform in this mode.

The café is explicitly named “Café browser fixture”: the keyless demo catalogue has no
`Cafe` typeLabel. A browser-only module response supplies that sample venue and an open
36-sector horizon; the actual venue detail, café section, sun engine and graph render it.
No application data files or backend records were changed. Before screenshots load
`SunWindowsGraph.jsx` from base commit `d4e5f9c`; after screenshots use the branch code,
with identical fixture, date and viewport. The largest clay image grows from 52.5 to
63 SVG units (20%).

Browser assertions covered: automatic live advice; hidden while loading/unavailable;
six-second dismissal; no repeat after reload; storage throwing; keyboard focus and
`aria-describedby`; touch opening chat without a bubble; desktop hover; 80×80px touch
target; 240px/two-line bubble fitting each viewport without covering Filters or the
bottom handle; reduced-motion transforms; and no uncaught browser errors.

Full SVG image bounds were checked for the café's maximum-size sun and one-second
windows at both explicit axis edges at all three widths. Mini graph and sun layout
maths are unchanged.

Still requires a real iPhone / Safari: tap versus emulated hover, VoiceOver announcement,
and notch/home-indicator safe-area spacing (including landscape and expanded sheets).
