# AGENTS.md

Practical commands and testing recipes for agents working on SunStay. Everything
here has been run in a Cursor Cloud Agent VM.

## Setup

```bash
npm ci     # run first if node_modules is missing; npm test fails with ERR_MODULE_NOT_FOUND without it
```

There is no committed `.env`; `.env.example` lists the `VITE_*` keys. Without
them the app still boots, so you can test almost everything:

- No `VITE_MAPBOX_TOKEN` — the map panel renders `Map failed to load`. Expected,
  not a bug. `MapErrorBoundary` catches it and the rest of the app is unaffected.
- No Supabase credentials — venue data falls back to `src/data/demoVenues.js`,
  so the list, filters, search and venue sheet all work.
- Weather comes from Open-Meteo with no key, so the header and scores are live.

## Commands

```bash
npm run dev -- --port 5173 --strictPort   # dev server; the script itself is `vite --host`
npm run build                             # production build, must stay clean
npm test                                  # full suite
node --test src/utils/microclimate.test.js   # single file
```

Cursor Cloud VMs only: running the dev server in tmux, driving the chrome-devtools
MCP browser window, and capturing screenshots or video from X11 are in
[`docs/agents/cursor-vm.md`](docs/agents/cursor-vm.md).

### Tests

`npm test` runs `node --test src/utils/*.test.js src/hooks/*.test.js` — Node's
built-in runner. There is no jest, vitest or React Testing Library, so
**component behaviour is not covered by the suite**; verify components in a real
browser (see below). New tests must live in `src/utils/` or `src/hooks/` and end
in `.test.js`, or the glob will silently skip them.

## Verifying UI in a browser (chrome-devtools MCP)

Use a real browser at phone width (390×844) against the dev server. The tool
names below (`emulate`, `evaluate_script`, `take_snapshot`) are chrome-devtools
MCP calls; Playwright has equivalents.

### Gotchas that cost real time

- **Changing viewport emulation reloads the page.** Do it while online, or the
  reload lands on Chrome's own `ERR_INTERNET_DISCONNECTED` page instead of the app.
- **`scroll-behavior: smooth` is set globally.** Setting `el.scrollTop` and
  reading it back in the same `evaluate_script` returns the old value. Await
  ~500ms before asserting on scroll position.
- **Chrome enforces a ~500px minimum window width.** For a true phone width use
  viewport emulation, not `resize_page`/`xdotool`.
- Programmatic `.focus()` inside a scrollable overlay scrolls it. Assert on
  `scrollTop` when testing modals on short viewports.

## CDP offline-emulation recipe

For `src/components/common/NetworkErrorModal.jsx` or any network-error UI, follow
[`docs/agents/offline-emulation.md`](docs/agents/offline-emulation.md). Order matters: cache what the
modal needs before cutting the link.


## Deploy checks

The site is on Netlify (`netlify.toml`), and every PR gets a deploy preview at
`https://deploy-preview-<PR>--sunstayglobal30.netlify.app`. The curl recipes for hashed-asset caching
and crawler link previews are in [`docs/agents/deploy-checks.md`](docs/agents/deploy-checks.md).

Mascots live in `src/assets/mascots/` and are imported as ES modules so they get hashed filenames.
Do **not** put them back under `public/`. PWA icons stay at the site root because `manifest.json`
cannot take a hashed URL.


## Accessibility scan

Inject axe-core into a deploy preview with Playwright at 390×844, after removing
the Netlify drawer (`[data-netlify-deploy-id], iframe[title="Netlify Drawer"]`).
Run it with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` and
`best-practice`. Since #271 the result is **0 violations** on home, list, venue
card, Filters, After Dark and the Sunny chat, so treat any new one as a
regression. Color-contrast "needs review" items come from translucent layers
and are expected. Map pins should measure at least 44 px tall on screen after
the camera flies in at 45° pitch (`getBoundingClientRect` on `.ss-sun-pin`).
