# Deployment Guide: SunStay Melbourne

Follow these steps to deploy the SunStay "Room-Level Sun Intelligence" demo to a public URL using Cloudflare Pages.

## Step 1: Prerequisites

Ensure you have the following environment variables ready:

- `VITE_MAPBOX_TOKEN`: Your Mapbox access token (starts with `pk.`).
- `VITE_OPENWEATHER_KEY`: Your OpenWeatherMap API key.

## Step 2: Deployment via Cloudflare Pages (GitHub Integration)

Cloudflare Pages integrates directly with your GitHub repository to automatically build and deploy your site when you push changes.

1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create application**, select the **Pages** tab, and then click **Connect to Git**.
3. Connect your GitHub account and select the `sunstay-app` repository.
4. Set up the build settings:
   - **Framework preset:** `Vite` (if it doesn't auto-detect, set the build command to `npm run build` and the build output directory to `dist`).
5. Click **Save and Deploy**. (The first build might fail if environment variables are missing — this is expected. We will add them in the next step).

## Step 3: Configure Environment Variables

The map and weather data require environment variables to function correctly in production.

1. In your Cloudflare Pages project dashboard, go to the **Settings** tab.
2. Under **Environment variables**, click **Add variables** for the **Production** environment.
3. Add `VITE_MAPBOX_TOKEN` and `VITE_OPENWEATHER_KEY` with your real keys.
4. Go to **Deployments** and click **Retry deployment** (or trigger a new deploy by pushing a new commit) to apply the changes.

## Step 4: SEO and SPA Routing

The site is pre-configured with:

- **Title**: SunStay – Room-Level Sun Intelligence for Melbourne Stays
- **SPA Routing**: Handled via `public/_redirects` (redirects all paths to `index.html`).

---
**Build Command**: `npm run build`
**Output Folder**: `dist/`
