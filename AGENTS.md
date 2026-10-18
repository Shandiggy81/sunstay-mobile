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

Used to verify `src/components/common/NetworkErrorModal.jsx`. Order matters: the
modal only renders once the connection is gone, so anything it needs from the
network has to be cached *before* you cut the link.

```
1. emulate         { pageId, }                                  # no args -> online, no overrides
2. navigate_page   { pageId, url: "http://localhost:5173/" }
3. evaluate_script { pageId, function: sleep ~2500ms }           # let idle-time prefetches finish
4. emulate         { pageId, networkConditions: "Offline" }      # flips navigator.onLine, fires `offline`
5. take_snapshot   { pageId }                                    # a11y tree: confirm dialog + get button uid
6. click           { pageId, uid }
7. evaluate_script { pageId, ... }                               # assert on the DOM
8. emulate         { pageId }                                    # back online -> modal auto-dismisses
```

CDP offline emulation does set `navigator.onLine = false` and fire the `offline`
event, so `window.addEventListener('offline', ...)` handlers work under it.

To keep a viewport override across an offline toggle, repeat the `viewport`
argument on every `emulate` call — it is not sticky:

```
emulate { pageId, viewport: "390x844x3,mobile,touch", networkConditions: "Offline" }
```

Assert on state with `evaluate_script` rather than only screenshots:

```js
() => ({
  onLine: navigator.onLine,
  modalOpen: !!document.querySelector('[role="dialog"]'),
  status: document.querySelector('[role="status"]')?.textContent,
})
```

Two cases worth exercising on any network-error UI here:

- **Retry while still offline** — the probe in `NetworkErrorModal` must fail and
  leave the dialog open.
- **`navigator.onLine` wrongly false** (captive portals do this). Simulate it
  with the network actually up: `window.dispatchEvent(new Event('offline'))`
  reopens the modal, and retry should then succeed and dismiss it.

## Deploy checks

The site is on Netlify (`netlify.toml`), and every PR gets a deploy preview at
`https://deploy-preview-<PR>--sunstayglobal30.netlify.app`. Use it to verify
anything that depends on real CDN behaviour, which `vite dev` cannot show:

Mascots live in `src/assets/mascots/` and are imported as ES modules so Vite
emits them as hashed `/assets/<name>-<hash>.png` files. Do **not** put them
back under `public/` — that path is unhashed, and returning visitors will keep
seeing the old artwork until their cache expires. PWA icons
(`public/sun-badge.jpg`, `public/sunny-mascot.jpg`, `public/sunstay-logo.png`)
stay at the site root because `manifest.json` cannot take a hashed URL.

```bash
# After a production/preview build, the hashed filename is in the JS bundle:
curl -s https://sunstayglobal30.netlify.app/ \
  | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
# Then:
curl -s https://sunstayglobal30.netlify.app/assets/index-<hash>.js \
  | grep -oE '/assets/brucey-offline-v2-[A-Za-z0-9_-]+\.png'
curl -sI https://sunstayglobal30.netlify.app/assets/brucey-offline-v2-<hash>.png \
  | grep -i cache-control     # public,max-age=31536000,immutable
```

Netlify's default for static assets is `max-age=0, must-revalidate`. Hashed
`/assets/*.{js,css,png,jpg}` files get an explicit `immutable` header in
`netlify.toml` so the offline modal can still paint Brucey from cache. The
match is by extension so a missing path (SPA-rewritten to `index.html`) is
not cached as an image.
