# After Dark distance and rain copy polish

Before: latest main `846bc2e` (PR #249 merged). After: this branch.
Mobile Chromium captures use the same fictional Sunday evening events/weather
as the Volt/Pink review, with all external requests intercepted or blocked.
No live Supabase requests. The existing map failure is expected without a token.

| Size | Before | After |
| --- | --- | --- |
| 390×844 | [Before](before-390.png) | [After](after-390.png) |
| 320×568 | [Before](before-320.png) | [After](after-320.png) |
| 320×568, tip scrolled into view | [Before detail](before-details-320.png) | [After detail](after-details-320.png) |

Each of four rainy cards now mentions rain once, in the forecast block, rather
than twice. DOM Range measurements show `30\u00a0m` occupies one line at both
widths; before, it split over two lines at 390px. No horizontal page overflow or
unhandled browser errors. The outdoor-show helper test also checks that its
jacket/indoor advice does not repeat the forecast's rain mention.

`npm test`: **1,306 passed**. `npm run build`: passed, with expected large-chunk
warnings. No Supabase changes or deployment. Physical iPhone rendering remains
a device check; these are Chromium fixture checks.

Run `node docs/screenshots/after-dark-copy-polish/capture.mjs after` from the
repo root to reproduce the after captures/assertions. The `before` argument was
run against the base code before editing. Measurements are saved in the two
`*-observations.json` files. The harness uses local port 5214 and Chromium at
`/usr/bin/chromium` (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).
