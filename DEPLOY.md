# Netlify Deploy (GitHub Connected)

This repo is configured for Netlify with [`netlify.toml`](./netlify.toml):

- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect: `/* -> /index.html`

## 1) Push to GitHub

```bash
git add .
git commit -m "Update weather demo app"
git push
```

## 2) Netlify site settings

In Netlify Dashboard -> Site settings -> Build & deploy -> Environment variables, set:

- `VITE_MAPBOX_TOKEN` (required)
- `VITE_OPENWEATHER_KEY` (optional)
- `VITE_OPENAQ_API_KEY` (optional)

## 3) Trigger deploy

- If Git is linked, pushing to the connected branch triggers deploy automatically.
- Or run a manual deploy from Netlify dashboard.

## 4) Verify production

- Open the site URL in desktop + mobile.
- Hard refresh on mobile (`clear cache` + reload) when testing UI updates.
- Confirm map pins, weather chips, and venue detail panel update with live conditions.
