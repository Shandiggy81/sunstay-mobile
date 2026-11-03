# Home declutter: stage 1

Branch: `codex/home-declutter-stage1`, based on `claude/home-declutter-base` at `1cd913f`.

The home header uses the supplied HD logo, weather/wind card, shared radar switch and search/time pill. The existing time-controls portal stays mounted in its popover, including while the venue card hides the header. Quick picks and filters now share one scrolling row in the expanded Sun sheet. The peek and list use the same compact count/mode row; provenance is in the peek's info popover. Ask Sunny has one floating entry point.

On phones up to 700px tall, expanding the list hides the logo/weather row while retaining search, giving the unchanged stay-date picker room. The 320×568 date-picker check leaves a 150px results scroller.

The peek is measured separately so long area labels and conditions move the floating controls up. This observer measures only the UI; the map's lifecycle, camera, marker sync, radar implementation and recovery are unchanged. List rows, venue details, data helpers and Supabase files are unchanged.

## Verification

- `npm test`: 1,415 passed, zero failures. New pure-helper tests cover Melbourne preview labels (including golden hour and DST) and Sunny visibility.
- `npm run build`: passed, with the expected large-chunk advisories.
- CI Playwright smoke suite: 20 passed. Updated home selectors and entry paths for the relocated header/chips; source/context remains attached to the list count for assistive technology.
- Playwright with system Chromium, dev server, 390×844: home, weather details, time presets, Fine-tune slider input, Escape/outside dismissal and focus return, info, sheet expansion/collapse by drag, After Dark peek/list, quick picks, Stays, Filters, Ask Sunny and search suggestion selection all passed. Returning from the venue card preserves working time controls.
- Header radar → layers-menu radar and layers-menu radar → header stay synchronized in the UI fixture described below.
- The HD logo measures 136×110. Checked home controls are at least 44×44; the 40px compact mode segments sit inside 44px button targets. No horizontal page overflow. Long-count fixture moves the FAB clear of the peek. The gap between weather and radar lets pointer events reach the map area.
- Desktop 1280×900: sidebar, venue rows, quick picks, info and time controls remain available. Reduced-motion check disables the new switch transition. No unhandled browser errors.

## Screenshots

| File | State |
| --- | --- |
| [home-390.png](home-390.png) | Home, normal local no-token state |
| [expanded-390.png](expanded-390.png) | Sun list header and scrolling chip row |
| [after-dark-390.png](after-dark-390.png) | After Dark list, honest request-error state |
| [after-dark-peek-390.png](after-dark-peek-390.png) | After Dark headline and Ticketmaster source |
| [time-popover-390.png](time-popover-390.png) | Existing time presets in the new popover |
| [fine-tune-390.png](fine-tune-390.png) | Existing slider after keyboard input, 12:05pm |
| [info-popover-390.png](info-popover-390.png) | Context and honesty/source text |
| [info-provenance-fixture-390.png](info-provenance-fixture-390.png) | Relocated DataBadge, with a reported bbox fixture |
| [radar-menu-fixture-390.png](radar-menu-fixture-390.png) | Joined controls and synchronized radar state |
| [weather-details-390.png](weather-details-390.png) | Existing weather details toggle |
| [suggestions-390.png](suggestions-390.png) | Existing search suggestions |
| [ask-sunny-390.png](ask-sunny-390.png) | Existing Sunny chat opened from FAB |
| [short-expanded-320.png](short-expanded-320.png) | Short phone with the existing stay-date picker expanded |
| [desktop-1280.png](desktop-1280.png) | Desktop sidebar and header |
| [reduced-motion-390.png](reduced-motion-390.png) | Reduced-motion home |

## Fixtures and limits

Weather is the repository's raw Open-Meteo fixture (23°, clear, 7 km/h), with an advancing clock starting at 11am Melbourne on 19 October 2026. Venue data is the existing demo fallback. All external requests were intercepted or blocked; no live Supabase calls or writes were made.

There is no local Mapbox token, so normal captures show “Map failed to load”. For the two explicitly named fixture captures, the browser cleared the existing map-error UI state and reported a bbox through the existing context action, without constructing or simulating a map. This exposes the real layers-menu controls and the existing provenance calculation. It proves shared radar state and badge placement, not radar imagery, basemap rendering or pin interaction. The After Dark capture shows the real unavailable/error UI; no events were invented.

Still needs a real token and physical iPhone: map/radar rendering, pinch/pan over exposed gaps, native keyboard and safe-area spacing, sheet touch drag, and context loss → manual Resume map. No PR, merge or deployment was performed.
