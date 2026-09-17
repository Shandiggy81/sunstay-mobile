# Netlify Deploy (GitHub Connected)

This repository is configured for a React/Vite SPA deploy on Netlify via [`netlify.toml`](./netlify.toml):

- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect: `/* -> /index.html`

## 1) Before deploying

Run and verify the production build locally or in CI before deploying:

```bash
npm ci
npm run build
```

Do not deploy if the production build fails.

## 2) Netlify environment variables

In Netlify Dashboard -> Site settings -> Build & deploy -> Environment variables, configure the variables required for the features enabled in production.

Variables currently consumed by source code:

- `VITE_MAPBOX_TOKEN` — required for live map behavior. Use a public Mapbox `pk.` token and restrict allowed URLs/domains in Mapbox.
- `VITE_OPENWEATHER_KEY` — optional OpenWeather cloud tile layer. Currently client-side; vulnerable to quota abuse until proxied server-side.
- `VITE_OPENAQ_API_KEY` — optional OpenAQ air-quality provider. Currently client-side; vulnerable to quota abuse until proxied server-side.
- `VITE_OPENUV_API_KEY` — optional OpenUV UV/safe-exposure hook. Currently client-side; vulnerable to quota abuse until proxied server-side.
- `VITE_TOMORROW_API_KEY` — optional Tomorrow.io rain-nowcasting hook. Currently client-side; vulnerable to quota abuse until proxied server-side.
- `VITE_SUPABASE_URL` — optional Supabase browser client URL. Public by design.
- `VITE_SUPABASE_ANON_KEY` — optional Supabase browser anon key. Public by design, but production requires RLS and authenticated owner-write policies.

Important: all `VITE_` variables are compiled into the browser bundle. Never put any secret, unrestricted credential, service-role key, or provider key intended to remain confidential in VITE_* variables.

## 3) Pre-deploy production-safety checklist

- [ ] Required Netlify environment variables for the intended production features are set.
- [ ] `VITE_MAPBOX_TOKEN` is a public `pk.` token and Mapbox allowed URLs include only approved local, preview, and production domains.
- [ ] Supabase Row Level Security is enabled for production tables used by the app.
- [ ] Supabase authenticated owner-write policies have been tested for allowed and denied users.
- [ ] No secret, unrestricted credential, service-role key, or provider key intended to remain confidential is present in any `VITE_*` variable.
- [ ] Quota-sensitive weather/AQ/UV provider keys are either acceptable for limited client-side demo use or have been moved behind server-side functions before production scale.
- [ ] `npm run build` passes before deploy.

## 4) Trigger deploy

- If Git is linked, pushing to the connected branch triggers deploy automatically.
- Or run a manual deploy from the Netlify dashboard.

## 5) Verify production

- Open the site URL in desktop and mobile browsers.
- Confirm map pins, weather chips, and venue detail panel update with live conditions.
- Verify missing/invalid optional API keys produce acceptable disabled/fallback states.
- Verify Supabase-backed owner/dashboard actions are authenticated and authorized by RLS before treating them as production-safe.
