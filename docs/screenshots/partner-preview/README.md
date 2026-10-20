# Partner preview verification

Chromium with touch emulation, 320×844 and 390×844, reduced motion, device scale 1.
Before: `origin/main` at `9e5142c`. After: the partner-preview redesign branch.

| View | 320px | 390px |
| --- | --- | --- |
| Pub before | [Image](before-pub-320.png) | [Image](before-pub-390.png) |
| Pub after: sun | [Image](after-pub-320.png) | [Image](after-pub-390.png) |
| Pub after: weather tips | [Image](after-pub-weather-320.png) | [Image](after-pub-weather-390.png) |
| Pub after: status controls | [Image](after-pub-controls-320.png) | [Image](after-pub-controls-390.png) |
| Pub after: all toggles on | [Image](after-pub-toggles-on-320.png) | [Image](after-pub-toggles-on-390.png) |
| Pub after: tags and partner invitation | [Image](after-pub-hours-tags-320.png) | [Image](after-pub-hours-tags-390.png) |
| Stay before | [Image](before-stay-320.png) | [Image](before-stay-390.png) |
| Stay after | [Image](after-stay-320.png) | [Image](after-stay-390.png) |
| Stay after: tags and partner invitation | [Image](after-stay-hours-tags-320.png) | [Image](after-stay-hours-tags-390.png) |

## Data and limits

All external requests were intercepted or blocked. Weather is the existing
`e2e/fixtures/weather.js` Open-Meteo fixture (23°C); the clock is fixed to
19 October 2026, 11am Melbourne. No sign-in, real backend writes, or application
data-file edits were used.

The local catalogue does not include Lion & Wombat. A browser-only fixture uses
`df-02`, its known Pub & bar type and Beer Garden/Pet Friendly tags, with clearly
sample Melbourne coordinates and daily 12:00–23:00 hours. The screenshot title
explicitly says “browser fixture”. For the after sun graph only, a browser response
supplies an open 36-sector building horizon. The real sun engine and guest
`SunWindowsGraph` compute/render its windows. This validates the component wiring,
not the real pub’s building horizon or hours. No usable horizon means the production
component hides the graph.

Quest St Kilda Bayside uses its existing demo row unchanged. It has no structured
hours or confirmed usable outdoor access, so its after view has no weather advice,
no invented outdoor sun graph and no live status toggles. Its facade-only room
estimates are not treated as evidence of balconies.

The before Quest view reproduces the bug: “12am+” beer-garden advice and the
“Golden Hour!” mascot overlapping the controls. The after view has neither.

## Checks

- `npm ci --cache /tmp/sunstay-npm-cache`: passed.
- `npm test`: 1,139 passed, including 9 weather-tip cases and 4 control/space cases.
- `npm run build`: passed, with existing chunk-size advisories.
- Browser assertions at both widths: modal layering, no horizontal overflow,
  44px+ toggle targets, heater artwork, noon-opening pub tip, no Quest tip without
  hours, relevant status/tag selection, service-hour editing, custom tag Enter,
  venue-named mailto, Escape/close, focus return, device-local toggles retained
  on reopen, zero venue write requests and zero uncaught page errors.
- The map is unavailable without a Mapbox token. Feature updates retain the exact
  existing pin-preview keys and callback; visual pin rendering was not tested.
- Physical iPhone/Safari touch, keyboard and safe-area checks remain unperformed.

## Removed dashboard mascot

`OwnerDashboard.jsx` previously mounted `MascotReaction.jsx`. Its “Golden Hour!”
Brucey branch uses **`src/assets/Brucey_sit_front.png`** (the dog holding coffee).
The rain branch uses `src/assets/ThunderBuddy_cloud.png`. The dashboard instance
was removed; artwork files and other mascot placements were not changed.
