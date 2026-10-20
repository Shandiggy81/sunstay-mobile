# Self-hosted Plus Jakarta Sans

Before/after home captures use the production builds at 390×844, a fixed
Melbourne clock, unchanged demo venues and mocked Open-Meteo weather. External
map, Supabase and telemetry requests were blocked. For the baseline, the actual
Google stylesheet and font responses were downloaded and replayed unchanged,
so the before capture uses Plus Jakarta Sans rather than a fallback font.
The after capture loads hashed font assets from the app's own origin.

- [Before](before-390.png)
- [After](after-390.png)

Seven visible text elements have identical content, computed typography and
bounds. Header/hero and bottom result-count pixels match exactly. Differences
elsewhere are confined to animated map/mascot controls. Both captures have no
horizontal overflow or unhandled page errors.

## Used faces

- Normal Latin weights 300, 400, 500, 600, 700 and 800 only, imported from
  `@fontsource/plus-jakarta-sans@5.3.0` by the Vite app entry.
- Weight 300 is authored for the wind arrow and filter `+` button; these can
  now use an explicit 300 face instead of matching the previously loaded 400.
- Weight 900 still matches the heaviest available face (800). The family has
  no 900 face. Existing italic text at weights 400/500 stays synthetic, as
  with the former normal-only Google request, preserving that appearance.
- No 200, non-Latin subsets or new italic faces are imported. Existing fallback
  stacks are unchanged. All six faces retain `font-display: swap`.

## Production build sizes

Built from main `d14762f` before the change and the same source plus the font
change afterward, using Node 22. Decimal kB; the main-file figures are from
`npm run build`. Font/whole-directory totals are measured from emitted files.

| Output | Before | After | Change |
| --- | ---: | ---: | ---: |
| Main CSS | 203.75 kB | 205.12 kB | +1.37 kB |
| Main CSS, gzip | 32.90 kB | 33.08 kB | +0.18 kB |
| Main JavaScript | 606.89 kB | 606.89 kB | Unchanged |
| Main JavaScript, gzip | 206.46 kB | 206.46 kB | Unchanged at build precision |
| All JavaScript, raw | 3,827,054 B | 3,827,054 B | Unchanged |
| Local WOFF2 assets | 0 B | 72,656 B | +72,656 B |
| Local WOFF fallback assets | 0 B | 96,048 B | +96,048 B |
| Entire dist directory | 32,152,534 B | 32,322,468 B | +169,934 B |

The baseline bundle excludes remotely hosted Google font payloads. Fontsource's
official stylesheets emit both WOFF2 and WOFF fallbacks; Chromium requested
only the five needed WOFF2 weights on this home screen. No font preload or
additional runtime code was introduced.

`npm test`: 908 passed, zero skipped. `npm run build`: passed, with only the
existing large-chunk advisory. Built HTML/CSS/JS contain no
`fonts.googleapis.com` or `fonts.gstatic.com` references; the after-browser
recorded zero requests to either host and successful first-party font responses.
Physical iPhone/Safari has not been tested.
