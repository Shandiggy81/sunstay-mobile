# Venue list: keyboard focus ring on a row

Branch: `claude/a11y-label-in-name`. Baseline: main `a82f66f` (after #320).

A list row used to be one `div` with `role="button"`. The shared focus rule in `src/index.css`
(`:is(button, a[href], input, select, textarea, [tabindex]):focus-visible`, with `!important`) drew
its ring 2px outside the row, where the list clipped it and the next row covered it, so a keyboard
user saw no focus at all. The row's own inset rule never applied. Now the row's icon and words are
a real `<button>`, and while it has keyboard focus the whole row shows the shared `--ss-focus` ring,
2px inside its edges.

This is the only visual change in the branch. Pixel comparisons of the same tree before and after
matched exactly for the header, the sheet summary, the venue list, rain rows with reason lines, Stays
rows before and after Compare, and the sun report with two sides open.

## Captures

Playwright Chromium, the e2e build (`dist-e2e`, fake Supabase, demo venues), 390×844, device scale
factor 1. Sunday 18 October 2026 at 11am Melbourne time, with the mocked sunny forecast. Open the
list, focus the first row (The Vineyard), then press Shift+Tab and Tab, so the row has keyboard focus.
Each capture is the row with 6px above and below it.

| Before | After |
| --- | --- |
| [row-focus-before-390x844.png](row-focus-before-390x844.png) | [row-focus-after-390x844.png](row-focus-after-390x844.png) |
