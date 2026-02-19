# Deployment Guide: SunStay Melbourne

Follow these steps to deploy the SunStay "Room-Level Sun Intelligence" demo to a public URL using Netlify.

## Step 1: Prerequisites

Ensure you have the following environment variables ready:

- `VITE_MAPBOX_TOKEN`: Your Mapbox access token (starts with `pk.`).
- `VITE_OPENWEATHER_KEY`: Your OpenWeatherMap API key.

## Step 2: Production Build

I have already executed the build, but if you make changes, run:

```bash
npm install
npm run build
```

This generates a `dist` folder at the project root.

## Step 3: Deployment (Manual Drop)

Netlify "Drop" is the fastest way to get this live:

1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. **Drag and drop** the `dist` folder directly onto the page.
3. Once uploaded, Netlify will provide a randomly generated URL (e.g., `https://sunstay-demo-1234.netlify.app`).

## Step 4: Configure Environment Variables

If the map or weather data does not appear:

1. In your Netlify Site Dashboard, go to **Site settings** > **Environment variables**.
2. Add `VITE_MAPBOX_TOKEN` and `VITE_OPENWEATHER_KEY` with your real keys.
3. Go to **Deploys** and click **Trigger deploy** > **Clear cache and deploy site** to apply the changes.

## Step 5: SEO and Sharing

The site is pre-configured with:

- **Title**: SunStay – Room-Level Sun Intelligence for Melbourne Stays
- **SPA Routing**: Handled via `netlify.toml` (redirects all paths to `index.html`).

---
**Build Success Confirmation**: `npm run build` completed successfully at 2026-02-15.
**Output Folder**: `dist/`
