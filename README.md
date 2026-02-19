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

```
sunstay-app/
├── src/
│   ├── components/
│   │   ├── MapView.jsx          # Mapbox integration
│   │   ├── VenueCard.jsx        # Glassmorphism venue details
│   │   ├── WeatherBackground.jsx # Dynamic background
│   │   └── SunnyMascot.jsx      # Animated FAB
│   ├── context/
│   │   └── WeatherContext.jsx   # Weather state & Sunstay Score
│   ├── data/
│   │   └── venues.js            # 22 Melbourne venues
│   ├── config/
│   │   └── mapConfig.js         # Mapbox configuration
│   ├── App.jsx                  # Main app component
│   ├── main.jsx                 # Entry point
│   └── index.css                # Global styles
├── index.html
├── tailwind.config.js
└── package.json
```

## 🎯 Key Components

### WeatherContext

- Fetches live weather from OpenWeather API
- Calculates dynamic theme (sunny/rainy/cloudy)
- Computes Sunstay Score (0-100) for each venue
- Manages "Fireplace Mode" for rainy days

### VenueCard

- Glassmorphism bottom sheet design
- Animated Sunstay Score bar
- Premium tag badges
- Glowing "Book Now" CTA

### MapView

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
- Weather data refreshes every 30 minutes
- All 22 venues are geocoded with accurate Melbourne coordinates

## 🚢 Deployment

To build for production:

```bash
npm run build
```

The optimized build will be in the `dist/` folder.

---

**Built with ❤️ for venue owners and punters in Melbourne**
