# Homes results

390 × 844 Chromium touch captures in Europe/London, using the same fixed
19 October 2026 instant and mocked raw Open-Meteo weather on both builds.
Before is main at `5bd4c1a`; after is this fix.

| Case | Before | After |
| --- | --- | --- |
| No residential homes in the loaded listings | [Generic search error](before-empty-390.png) | [Inventory explanation](after-empty-390.png) |
| Stays and Homes selected together | [Count 2, list 1](before-mixed-390.png) | [Count 2, list 2](after-mixed-390.png) |

The missing-inventory case uses one synthetic Hotel. The mixed case uses that
Hotel plus a synthetic Residential Home. Responses are intercepted at the existing
fake Supabase host. All other external HTTP and WebSocket traffic is blocked.
No live backend inventory was queried, and no fixtures are added to demoVenues.
These are local production-build checks, not live-site or physical-iPhone checks.

The new tests also check loading before Homes arrive, a home excluded by search,
returning to browsing, and that homes never acquire stay comparison controls.
Existing area-empty behavior, stay ranking and property-type matching are preserved.

Validation on Node 22: 876 unit tests and 20 browser tests passed, zero skipped;
production build passed with the existing large-chunk advisory. Browser captures
show no page errors or horizontal overflow. The empty-state action retains its
52px minimum height.
