# AGENTS.md

Practical commands and testing recipes for agents working on SunStay. Everything
here has been run in a Cursor Cloud Agent VM.

## Setup

```bash
npm ci     # node_modules is usually already present in Cloud Agent VMs
```

There is no committed `.env`; `.env.example` lists the `VITE_*` keys. Without
them the app still boots, so you can test almost everything:

- No `VITE_MAPBOX_TOKEN` — the map panel renders `Map failed to load`. Expected,
  not a bug. `MapErrorBoundary` catches it and the rest of the app is unaffected.
- No Supabase credentials — venue data falls back to `src/data/demoVenues.js`
  (48 venues), so the list, filters, search and venue sheet all work.
- Weather comes from Open-Meteo with no key, so the header and scores are live.

## Commands

```bash
npm run dev -- --port 5173 --strictPort   # dev server; the script itself is `vite --host`
npm run build                             # production build, must stay clean
npm test                                  # full suite
node --test src/utils/microclimate.test.js   # single file
```

Run the dev server inside tmux so it outlives a single command:

```bash
tmux -f /exec-daemon/tmux.portal.conf new-session -d -s sunstay-dev -c /workspace -- bash -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t sunstay-dev:0.0 \
  'npm run dev -- --port 5173 --strictPort' C-m
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/    # expect 200
```

### Tests

`npm test` runs `node --test src/utils/*.test.js src/hooks/*.test.js` — Node's
built-in runner. There is no jest, vitest or React Testing Library, so
**component behaviour is not covered by the suite**; verify components in a real
browser (see below). New tests must live in `src/utils/` or `src/hooks/` and end
in `.test.js`, or the glob will silently skip them.

## Verifying UI in a browser (chrome-devtools MCP)

Two separate Chrome instances run in this VM:

1. The **visible** browser, launched via `x-www-browser`. Not under your control.
2. The **CDP** browser, launched by chrome-devtools-mcp with
   `--user-data-dir=/home/ubuntu/.cache/chrome-devtools-mcp/chrome-profile`.
   This is the only one the `chrome-devtools` tools drive.

They look identical on screen, so it is easy to drive one and screenshot the
other. Every `chrome-devtools` call needs an explicit `pageId` (get it from
`list_pages`); omitting it is a validation error.

The X display is `:1`, not `:0`. To bring the CDP window to the front before
recording or screenshotting:

```bash
export DISPLAY=:1
CDP_PIDS=$(pgrep -f 'chrome-devtools-mcp/chrome-profile' | tr '\n' '|' | sed 's/|$//')
for id in $(xdotool search --name "Google Chrome"); do
  pid=$(xdotool getwindowpid "$id")
  echo "$pid" | grep -qE "^($CDP_PIDS)$" && CDP_WIN=$id
done
xdotool windowsize "$CDP_WIN" 1500 1000 windowmove "$CDP_WIN" 60 40 windowactivate "$CDP_WIN"
```

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

## Capturing artifacts

`take_screenshot` cannot write to `/opt/cursor/artifacts` or `/workspace` — both
are outside its allowed roots. Capture from X11 instead:

```bash
export DISPLAY=:1
ffmpeg -y -v error -f x11grab -video_size 1920x1200 -i :1 -frames:v 1 /tmp/grab.png
```

For a phone-sized still, emulate the viewport at `1x` (so screen pixels map 1:1),
put the CDP window at a known position, then crop. With the window at
`(win_x, win_y)` and the automation infobar visible, the page's top-left on
screen is `(win_x + 4, win_y + 136)`:

```bash
xdotool windowsize "$CDP_WIN" 501 1010 windowmove "$CDP_WIN" 60 40   # 1010 tall fits a 844px viewport
# emulate { pageId, viewport: "390x844x1,mobile,touch", networkConditions: "Offline" }
python3 -c "
from PIL import Image
Image.open('/tmp/grab.png').convert('RGB').crop((64,176,64+390,176+844)).save('/tmp/phone.png')"
cp /tmp/phone.png /opt/cursor/artifacts/screenshot_thing_mobile.png
```

Always open the cropped PNG to confirm the offset before using it.

Pillow is not installed by default; `pip3 install pillow` works. ImageMagick and
scipy are not available. ffmpeg is.

For videos, `RecordScreen` timelapses long sessions, so a state that is on screen
briefly can vanish from the result. Hold each step for a while (sleep 8-20s
between actions), then tighten the result afterwards:

```bash
ffmpeg -y -ss 38 -to 160 -i raw.mp4 -filter:v "setpts=PTS/3,fps=30" -an \
  -c:v libx264 -crf 24 -pix_fmt yuv420p demo.mp4
```

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
