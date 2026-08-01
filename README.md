# 🌞 Sunstay - Elite Mobile Web App

A premium, weather-driven mobile web app for discovering Melbourne's best outdoor venues. Built with React, Tailwind CSS, Framer Motion, and Mapbox GL.

## ✨ Features

- **Dynamic Weather UI**: Background and theme shift based on live weather data
- **Custom 2D Map**: Mapbox integration with emoji pill markers
- **Glassmorphism Design**: Frosted glass venue cards with smooth animations
- **Sunstay Score**: 0-100 rating based on current weather conditions
- **Fireplace Mode**: Special indicator for cozy venues on rainy days
- **Sunny Mascot**: Animated FAB with wink effect
- **22 Melbourne Venues**: Curated list of iconic outdoor spots

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Mapbox public access token for live map functionality ([Get one here](https://account.mapbox.com/))
- Optional OpenWeather/OpenAQ/OpenUV/Tomorrow.io/Supabase values for related integrations

### Installation

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Create a local environment file**:

   ```bash
   cp .env.example .env
   ```

   Set only the `VITE_` variables needed for the features you are testing. Do not hardcode API keys in source files.

3. **Start the development server**:

   ```bash
   npm run dev
   ```

4. **Open your browser** to the URL shown (typically `http://localhost:5173`)

## 🎨 Tech Stack

- **Framework**: React with Vite (`react` is `^19.2.3` in `package.json`)
- **Styling**: Tailwind CSS
- **Animation**: Framer Motion
- **Map**: Mapbox GL JS
- **Icons**: Lucide React
- **HTTP Client**: Axios

## 📱 Mobile Optimization

The app is fully optimized for mobile devices with:

- Touch-friendly interactions
- Responsive design
- Smooth animations optimized for mobile performance
- Apple mobile web app support

## 🏗️ Project Structure

```text
sunstay-mobile/
├── src/
│   ├── api/
│   │   └── venues.js              # Brevity Fetch API (brief/detail)
│   ├── components/
│   │   ├── Map/
│   │   │   └── VenueMap.jsx       # Mapbox GL map and venue markers
│   │   ├── VenueCard.jsx          # Glassmorphism venue details
│   │   ├── WeatherBackground.jsx  # Dynamic background
│   │   └── SunnyMascot.jsx        # Animated FAB
│   ├── context/
│   │   └── WeatherContext.jsx     # Weather state & Sunstay Score
│   ├── hooks/
│   │   └── useWeather.js          # Weather API caching (15-min TTL)
│   ├── screens/
│   │   └── Booking/
│   │       └── BookingSummary.js   # Booking flow (race condition fix)
│   ├── store/
│   │   └── slices/
│   │       └── bookingSlice.js    # Weather-booking sync
│   ├── utils/
│   │   ├── platform.js            # Cross-platform abstraction
│   │   ├── sunCalcLogic.js
│   │   └── sunScore.js
│   ├── data/
│   │   ├── demoVenues.js          # Demo venue data
│   │   └── venues.js              # Melbourne venues
│   ├── config/
│   │   └── mapConfig.js           # Mapbox configuration
│   ├── App.jsx                    # Main app component
│   ├── main.jsx                   # Entry point
│   └── index.css                  # Global styles
├── app.json                       # Expo web configuration
├── index.html
├── tailwind.config.js
└── package.json
```

## 🔄 Cross-Platform Setup

This codebase includes a platform abstraction layer designed for future React Native / Expo deployment.

### Web (Current — Vite)

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # Production bundle → dist/
```

### Expo Web (Future)

```bash
npx expo install react-native-web react-dom
npx expo start --web   # Runs on Expo's Metro bundler
```

### Platform Abstraction

The `src/utils/platform.js` module auto-detects the runtime and provides:

| Feature | Web | Mobile (Future) |
| --- | --- | --- |
| Storage | `localStorage` | `AsyncStorage` |
| Maps | `mapbox-gl` | `@rnmapbox/maps` |
| Detection | `typeof window` | `Platform.OS` |

Some modules use the `src/utils/platform.js` storage abstraction where browser/local storage access is needed.

### Melbourne Test Coordinates

```text
Latitude:  -37.8136
Longitude: 144.9631
```

## 🎯 Key Components

### WeatherContext

- Fetches primary live weather from Open-Meteo via `fetchOpenMeteoWeather`
- **15-minute cache** with coordinate rounding (2 decimals) to batch nearby venues
- Calculates dynamic theme (sunny/rainy/cloudy)
- Computes Sunstay Score (0-100) for each venue
- Manages "Fireplace Mode" for rainy days

### VenueMap

- Mapbox GL map component in `src/components/Map/VenueMap.jsx`
- Uses a GeoJSON source for clustering plus DOM marker elements for visible venue/cluster markers
- Supports weather/cloud overlays when optional keys are configured

### BookingSummary (New)

- **Double-tap prevention** via `useRef` mutex
- Server-side availability check (pre-payment)
- Melbourne timezone timestamps
- Phased flow: verify → pay → confirm

### bookingSlice (New)

- **Weather severity listener** — auto re-checks availability on Sunny→Stormy transitions
- React Context + useReducer (no Redux dependency)

### Venue API (New)

- **`fetchVenuesBrief()`** — 4 fields only (id, lat, lon, sunshineScore) for map markers
- **`fetchVenueDetails(id)`** — full venue data on selection
- ~10x payload reduction for map rendering

### VenueCard

- Glassmorphism bottom sheet design
- Animated Sunstay Score bar
- Premium tag badges
- Glowing "Book Now" CTA

### SunnyMascot

- Floating action button
- Wink animation on hover
- Spin effect
- Tooltip on hover

## 🌈 Weather Themes

- **Sunny**: Golden/orange gradients, warm vibes
- **Rainy**: Deep blue/cozy tones, Fireplace Mode activated
- **Cloudy**: Gray/slate gradients

## 🔐 Environment variables and production safety

This is a React/Vite app. Every variable prefixed with `VITE_` is compiled into the browser bundle and can be viewed by users. Never put any secret, unrestricted credential, service-role key, or provider key intended to remain confidential in VITE_* variables.

Variables currently consumed by source code are documented in [`.env.example`](./.env.example) and [API_SETUP.md](./API_SETUP.md):

| Variable | Current use | Safety note |
| --- | --- | --- |
| `VITE_MAPBOX_TOKEN` | Live map behavior and static map fallback. | Use a public `pk.` token and restrict allowed URLs/domains in Mapbox. |
| `VITE_OPENWEATHER_KEY` | Optional OpenWeather cloud tile layer. | Currently client-side and vulnerable to quota abuse; move server-side before production scale. |
| `VITE_OPENAQ_API_KEY` | Optional OpenAQ air-quality provider. | Currently client-side and vulnerable to quota abuse; move server-side before production scale. |
| `VITE_OPENUV_API_KEY` | Optional OpenUV UV/safe-exposure hook. | Currently client-side and vulnerable to quota abuse; move server-side before production scale. |
| `VITE_TOMORROW_API_KEY` | Optional Tomorrow.io rain-nowcasting hook. | Currently client-side and vulnerable to quota abuse; move server-side before production scale. |
| `VITE_SUPABASE_URL` | Optional Supabase browser client URL. | Public by design; production requires Supabase RLS. |
| `VITE_SUPABASE_ANON_KEY` | Optional Supabase browser anon key. | Public by design; production requires RLS and authenticated owner-write policies. Never use `SUPABASE_SERVICE_ROLE_KEY` in Vite/browser code. |

## 📝 Notes

- Do not hardcode API keys in source files. Use `.env`/Netlify environment variables.
- Weather data is cached for 15 minutes in `WeatherContext` where supported.
- All 22+ venues are geocoded with accurate Melbourne coordinates

## 🚢 Deployment

To build for production:

```bash
npm run build
```

The optimized build will be in the `dist/` folder.

Before deploying, verify:

- Required Netlify environment variables for enabled production features are set.
- `VITE_MAPBOX_TOKEN` is a public `pk.` token and Mapbox allowed URLs are restricted.
- Supabase RLS is enabled and authenticated owner-write policies are tested before production use.
- No secret, unrestricted credential, service-role key, or provider key intended to remain confidential is present in any `VITE_*` variable.
- Quota-sensitive weather/AQ/UV provider keys are moved server-side before production scale, or the client-side exposure is explicitly accepted for a limited demo.
- `npm run build` passes before deploy.

---

**Built with ❤️ for venue owners and punters in Melbourne**
