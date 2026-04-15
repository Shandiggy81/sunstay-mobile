# SunStay API Setup

## 1) Create environment file

Copy `.env.example` to `.env` and set keys:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## 2) Required keys

- `VITE_MAPBOX_TOKEN` (required for live map, should start with `pk.`)

## 3) Optional keys

- `VITE_OPENWEATHER_KEY` (if present, weather uses OpenWeather first)
- `VITE_OPENAQ_API_KEY` (if present, air quality uses OpenAQ first)

Without optional keys, the app still uses live public APIs:

- Weather fallback: Open-Meteo
- Air quality fallback: Open-Meteo Air Quality API

## 4) Run locally

```bash
npm install
npm run dev
```

## 5) Troubleshooting

- Map not loading: check `VITE_MAPBOX_TOKEN` and domain restrictions in Mapbox account.
- Weather not live: verify network access and inspect browser console for API failures.
- Air quality unavailable: OpenAQ key may be invalid; fallback should still return Open-Meteo data.
