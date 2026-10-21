# Night score badge (390px)

Baseline: `44370b1` (latest `origin/main`). Checked with Playwright at 390×844 against `npm run dev` at 9:15pm Melbourne time.

| Where | Day (unchanged) | After dark at the selected time |
|---|---|---|
| List row badge | ☀️ score | 🌙 **Night**; the screen reader hears "Sun score not shown after dark" |
| Venue card pill | ☀️ score | 🌙 **Night** |
| Venue card "Sun score" tile | score, "out of 100" | **After dark**, "back at sunrise" |
| Map pin | score | 🌙; the accessible label keeps "After dark. Sun score 0" |
| Home sheet | "N in full sun" | "after dark" (now from the same shared flag) |

Night follows the time scrubber, the same as the scores. Tapping **Lunch** at 9pm shows the lunchtime scores again (rows and card show 99, and the sheet shows "41 in full sun"). Heater, cosy, rain, cold and windy pins still show their markers at night.

Map pins can't render locally without a Mapbox token; they are checked on the deploy preview.
