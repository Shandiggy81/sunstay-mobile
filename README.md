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
- Mapbox access token ([Get one here](https://account.mapbox.com/))
- OpenWeather API key ([Get one here](https://openweathermap.org/api))

### Installation

1. **Navigate to the project directory**:

   ```bash
   cd sunstay-app
   ```

2. **Install dependencies** (already done):

   ```bash
   npm install
   ```

3. **Add your API keys**:

   **Mapbox Token** - Open `src/config/mapConfig.js`:

   ```javascript
   export const MAPBOX_TOKEN = 'your_mapbox_token_here';
   ```

   **OpenWeather API Key** - Open `src/context/WeatherContext.jsx`:

   ```javascript
   const WEATHER_API_KEY = 'your_openweather_api_key_here';
   ```

4. **Start the development server**:

   ```bash
   npm run dev
   ```

5. **Open your browser** to the URL shown (typically `http://localhost:5173`)

## 🎨 Tech Stack

- **Framework**: React 18 with Vite
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
│   │   │   └── VenueMap.js        # GL-optimized map (SymbolLayer)
│   │   ├── MapView.jsx            # Original Mapbox integration
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

All new modules (`useWeather`, `BookingSummary`, `bookingSlice`, `venues` API) use `PlatformStorage`, making them portable across platforms without code changes.

### Melbourne Test Coordinates

```text
Latitude:  -37.8136
Longitude: 144.9631
```

## 🎯 Key Components

### WeatherContext

- Fetches live weather from OpenWeather API
- **15-minute cache** with coordinate rounding (2 decimals) to batch nearby venues
- Calculates dynamic theme (sunny/rainy/cloudy)
- Computes Sunstay Score (0-100) for each venue
- Manages "Fireplace Mode" for rainy days

### VenueMap (New — Optimized)

- **GL-native symbol layer** instead of DOM markers
- Handles 1000+ venues efficiently
- Memoized sunshine overlay (camera-pan stable)
- Click handling via GL events

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

### MapView (Original)

- Custom emoji pill markers
- Smooth fly-to animations
- 2D Mapbox integration
- Interactive venue selection

### SunnyMascot

- Floating action button
- Wink animation on hover
- Spin effect
- Tooltip on hover

## 🌈 Weather Themes

- **Sunny**: Golden/orange gradients, warm vibes
- **Rainy**: Deep blue/cozy tones, Fireplace Mode activated
- **Cloudy**: Gray/slate gradients

## 📝 Notes

- The app uses placeholder API keys by default
- Replace with your actual keys before testing
- Weather data is cached for 15 minutes (previously refreshed every 30 minutes)
- All 22+ venues are geocoded with accurate Melbourne coordinates

## 🚢 Deployment

To build for production:

```bash
npm run build
```

The optimized build will be in the `dist/` folder.

---

**Built with ❤️ for venue owners and punters in Melbourne**
