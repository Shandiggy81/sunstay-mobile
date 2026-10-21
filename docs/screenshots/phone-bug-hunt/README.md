# Phone bug hunt (390px and 320px)

Baseline: `de7ea6c` (latest `origin/main`). Checked with Playwright at 390×844 and 320×640 against `npm run dev`, with no map token (map error state expected), at 8:30pm Melbourne time.

| Found | Fix |
|---|---|
| After sunset Sunny's tip said "18° and sunny. Great for an outdoor table." | `sunnyAdvice` reads `weather.isDay` (the flag the header's moon uses) and gives night copy for clear, cloudy, chilly, hot and wet nights. Unit tests added. |
| Chat header said "Great day out" after sunset | Night mood "Great night out" when `isDay === false` |
| Search and chat inputs were 13px, so iOS Safari zooms the page on tap | Typed text is 16px; the search placeholder keeps its 13px/12px look |
| Chat close (36px), send (40px) and input (40px) were under the 44px touch-target rule | All 44px; close button no longer shrinks at 320px |
| React warning: a `key` prop spread into `StatusTile` in the partner preview | Pull `key` out before spreading |

After the fixes the run logged no console errors, no page errors, no horizontal overflow and no visible touch targets under 44px in the screens checked.

Not checked here (needs a real iPhone): focus zoom behaviour itself, safe-area insets, sheet drag.
