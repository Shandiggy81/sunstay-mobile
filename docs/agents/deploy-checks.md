# Deploy checks

Moved from AGENTS.md.

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

Venue link previews (`netlify/edge-functions/venue-preview.js`) only run for
crawler user agents, so check them by sending one. The `x-sunstay-link-preview`
header says what happened: `venue`, `not-found`, `unavailable` or `unconfigured`.

```bash
curl -s -A 'facebookexternalhit/1.1' -D - 'https://sunstayglobal30.netlify.app/?venue=dv-01' \
  | grep -iE 'x-sunstay-link-preview|og:title'
```
