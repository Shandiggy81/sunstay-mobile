# 🔑 Sunstay API Setup Guide

## Required API Keys

Before running the app, you need to obtain two free API keys:

### 1. Mapbox Access Token

**Get your token**: <https://account.mapbox.com/>

1. Create a free Mapbox account
2. Go to your Account page
3. Copy your "Default public token" or create a new one
4. **Add to**: `src/config/mapConfig.js`

   ```javascript
   export const MAPBOX_TOKEN = 'pk.eyJ1Ijoi...'; // Your token here
   ```

### 2. OpenWeather API Key

**Get your key**: <https://openweathermap.org/api>

1. Create a free OpenWeatherMap account
2. Go to API Keys section
3. Copy your API key (or generate a new one)
4. **Add to**: `src/context/WeatherContext.jsx`

   ```javascript
   const WEATHER_API_KEY = 'abc123...'; // Your key here
   ```

## Quick Setup Commands

```bash
# 1. Navigate to project
cd sunstay-app

# 2. Install dependencies (if not already done)
npm install

# 3. Add your API keys to the files mentioned above

# 4. Start the dev server
npm run dev
```

## Testing Without API Keys

The app will still run without API keys, but:

- **Without Mapbox token**: Map won't load (will show loading spinner)
- **Without OpenWeather key**: Will default to "sunny" theme, Sunstay Score will use default values

## Free Tier Limits

Both services offer generous free tiers:

- **Mapbox**: 50,000 free map loads/month
- **OpenWeather**: 1,000 free API calls/day

Perfect for development and demo purposes!

## Troubleshooting

### Map not loading?

- Check that your Mapbox token is valid
- Ensure you're using a public token (starts with `pk.`)
- Check browser console for errors

### Weather not updating?

- Verify your OpenWeather API key is active
- New keys can take a few minutes to activate
- Check browser console for API errors

### Build errors?

- Run `npm install` again
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version (requires 16+)
