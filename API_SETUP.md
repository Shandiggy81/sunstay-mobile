# SunStay API Setup

## 1) Create an environment file

Copy `.env.example` to `.env` and set the values needed for the features you want to run locally:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 2) Browser-exposed variable warning

This is a React/Vite app. Every environment variable whose name starts with `VITE_` is compiled into the browser bundle and can be viewed by users.

Never put any secret, unrestricted credential, service-role key, or provider key intended to remain confidential in VITE_* variables.

## 3) Variables currently consumed by source code

These names were verified from `import.meta.env.VITE_*` references in `src/`.

| Variable | Current use | Production-safety note |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | Required for live Mapbox GL map paths and static map fallback. | Use a public `pk.` token only. Restrict allowed URLs/domains in Mapbox. |
| `VITE_OPENWEATHER_KEY` | Optional OpenWeather cloud tile layer on the map. | Currently used client-side and vulnerable to quota abuse; move behind a server-side function before production scale. |
| `VITE_OPENAQ_API_KEY` | Optional OpenAQ air-quality provider. | Currently used client-side and vulnerable to quota abuse; move behind a server-side function before production scale. |
| `VITE_OPENUV_API_KEY` | Optional OpenUV UV/safe-exposure hook. | Currently used client-side and vulnerable to quota abuse; move behind a server-side function before production scale. |
| `VITE_TOMORROW_API_KEY` | Optional Tomorrow.io rain-nowcasting hook. | Currently used client-side and vulnerable to quota abuse; move behind a server-side function before production scale. |
| `VITE_SUPABASE_URL` | Optional Supabase browser client URL. | Public by design; production requires Supabase Row Level Security. |
| `VITE_SUPABASE_ANON_KEY` | Optional Supabase browser anon key. | Anon keys are public by design; production requires RLS and authenticated owner-write policies. Never use `SUPABASE_SERVICE_ROLE_KEY` in Vite/browser code. |

## 4) Local run

```bash
npm install
npm run dev
```

The dev server is typically available at `http://localhost:5173`.

## 5) Current fallback behavior

- Without `VITE_MAPBOX_TOKEN`, the live map is expected to fail or show a map error state.
- Without optional weather/AQ/UV/nowcasting keys, related optional features may be disabled or fall back where code supports it.
- The app currently uses Open-Meteo for primary public weather data in `WeatherContext` without an API key.
- Supabase-backed owner/dashboard writes are optional in local/demo mode, but production write access must be protected by Supabase RLS and ownership policies.

## 6) Troubleshooting

- Map not loading: verify `VITE_MAPBOX_TOKEN` starts with `pk.` and its Mapbox allowed URLs include your local and deployed domains.
- Weather/AQ/UV features unavailable: verify optional provider keys and inspect browser console/network errors.
- Supabase writes not persisting: verify `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, auth state, RLS policies, and owner-write policy tests.
