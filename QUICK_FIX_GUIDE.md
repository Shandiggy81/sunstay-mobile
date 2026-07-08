# Sunstay Mobile - Quick Fix Guide

## 🚀 APPLY FIXES IN THIS ORDER

---

## FIX #1: Remove Hardcoded Supabase Credentials ⚡ SECURITY

**File**: `src/lib/supabase.js`  
**Time**: 5 minutes  
**Impact**: CRITICAL

### Replace entire file:

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. ' +
    'Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### Update `.env.local` (create if missing):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_OPENWEATHER_KEY=your-openweather-key
VITE_OPENUV_API_KEY=your-openuv-key
VITE_TOMORROW_API_KEY=your-tomorrow-key
```

### Update `.gitignore`:
```
.env.local
.env.local.example
```

---

## FIX #2: Fix Broken Cozy Weather Feature ⚡ HIGH

**File**: `src/App.jsx`  
**Lines**: 243-249  
**Time**: 10 minutes  
**Impact**: HIGH (Feature completely broken)

### Find and replace:

**FIND**:
```javascript
    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        const minTemp = weather.minTemp || 20;
        const precip = weather.precipitation || 0;
        const wind = weather.windSpeed || 0;
        return minTemp < 8 || (precip > 0.5 || wind > 15);
    }, [weather]);
```

**REPLACE WITH**:
```javascript
    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        
        // Get actual weather values from the correct object structure
        const temp = weather.main?.temp ?? 20;
        const precipProbability = weather.precipProbability ?? 0;
        const windSpeed = weather.wind?.speed ?? weather.windGusts ?? 0;
        
        // Check if it's raining based on weather condition
        const isRaining = weather.weather?.[0]?.main?.toLowerCase().includes('rain');
        
        // Cozy mode: Cold (< 8°C) OR (Rainy AND Windy > 15 km/h)
        return temp < 8 || (isRaining && windSpeed > 15);
    }, [weather]);
```

---

## FIX #3: Fix Rain Detection Off-by-One Error ⚡ HIGH

**File**: `src/hooks/useTomorrowRain.js`  
**Lines**: 31-41  
**Time**: 2 minutes  
**Impact**: HIGH (Rain alerts delayed)

### Find and replace:

**FIND**:
```javascript
        if (isMounted) {
          if (rainMin > 0) {
            setIsRainStartingSoon(true);
            setMinutesUntilRain(rainMin);
          } else {
            setIsRainStartingSoon(false);
            setMinutesUntilRain(0);
          }
        }
```

**REPLACE WITH**:
```javascript
        if (isMounted) {
          if (rainMin >= 0) {  // ✅ FIXED: Now includes rainMin = 0
            setIsRainStartingSoon(true);
            setMinutesUntilRain(rainMin);
          } else {
            setIsRainStartingSoon(false);
            setMinutesUntilRain(0);
          }
        }
```

---

## FIX #4: Add Error Handling to sessionStorage ⚡ HIGH

**File**: `src/App.jsx`  
**Line**: 162  
**Time**: 5 minutes  
**Impact**: HIGH (Crashes in private browsing)

### Find and replace:

**FIND**:
```javascript
    const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('splashShown') === 'true');
```

**REPLACE WITH**:
```javascript
    const [splashDone, setSplashDone] = useState(() => {
        try {
            return typeof sessionStorage !== 'undefined' 
                ? sessionStorage.getItem('splashShown') === 'true'
                : false;
        } catch (err) {
            console.warn('sessionStorage unavailable (private browsing?):', err);
            return false;
        }
    });
```

---

## FIX #5: Add Error Handling to localStorage ⚡ HIGH

**File**: `src/App.jsx`  
**Line**: 200  
**Time**: 5 minutes  
**Impact**: HIGH (Corrupted cache crashes app)

### Find and replace:

**FIND**:
```javascript
    const [customFilters, setCustomFilters] = useState(
      JSON.parse(localStorage.getItem('sunstay-custom-filters') || '[]')
    );
```

**REPLACE WITH**:
```javascript
    const [customFilters, setCustomFilters] = useState(() => {
        try {
            const stored = localStorage.getItem('sunstay-custom-filters');
            return stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.warn('Failed to parse stored custom filters, resetting:', err);
            try {
                localStorage.removeItem('sunstay-custom-filters');
            } catch (e) {
                // Ignore localStorage removal errors
            }
            return [];
        }
    });
```

---

## FIX #6: Add Timeout & Error Handling to weatherService.js ⚡ HIGH

**File**: `src/api/weatherService.js`  
**Lines**: 12-19 and 26-32  
**Time**: 15 minutes  
**Impact**: HIGH (Hangs indefinitely, crashes on parse errors)

### Replace entire file:

```javascript
// Sunstay Weather Service
// Fetches live weather data from OpenWeather API

const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const ONE_CALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';
const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
const TIMEOUT_MS = 8000;

/**
 * Helper to add timeout to fetch requests
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }
    const data = await res.json();
    return { res, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Weather API request timeout (>${TIMEOUT_MS / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get current weather for a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export async function getCurrentWeather(lat, lng) {
  try {
    const url = `${BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`;
    const { data } = await fetchWithTimeout(url);
    return data;
  } catch (err) {
    console.error(`getCurrentWeather failed for ${lat},${lng}:`, err.message);
    throw err;
  }
}

/**
 * Get hourly forecast for a location (next 12 hours)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 */
export async function getHourlyForecast(lat, lng) {
  try {
    const url = `${ONE_CALL_URL}?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric&exclude=minutely,daily,alerts`;
    const { data } = await fetchWithTimeout(url);
    return data.hourly?.slice(0, 12) || [];
  } catch (err) {
    console.error(`getHourlyForecast failed for ${lat},${lng}:`, err.message);
    throw err;
  }
}

/**
 * Calculate Sunstay Score (0-100) based on weather conditions
 * Higher score = better outdoor conditions for venues
 * @param {object} weatherData - OpenWeather current weather response
 * @param {number} uvIndex - UV index (0-11+)
 */
export function getSunstayScore(weatherData, uvIndex = 5) {
  const clouds = weatherData?.clouds?.all ?? 50;
  const windSpeed = weatherData?.wind?.speed ?? 0;
  const rain = weatherData?.rain?.['1h'] ?? 0;

  // Penalise for heavy wind (>10 m/s) and rain
  const windPenalty = Math.min(windSpeed / 10 * 15, 15);
  const rainPenalty = rain > 0 ? 20 : 0;

  const score = Math.round(
    (100 - clouds * 0.5 - windPenalty - rainPenalty) * (1 + uvIndex * 0.08)
  );

  return Math.max(0, Math.min(100, score));
}
```

---

## FIX #7: Fix useOpenUV.js Unhandled Promise + Response Validation ⚡ HIGH

**File**: `src/hooks/useOpenUV.js`  
**Time**: 10 minutes  
**Impact**: HIGH (Silent failures, no error logging)

### Replace entire file content with:

```javascript
import { useState, useEffect } from 'react';

export function useOpenUV(lat, lng) {
  const [burnTimeMins, setBurnTimeMins] = useState(15); // Default safe value
  const [uvIndex, setUvIndex] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lat || !lng) return;

    let isMounted = true;
    setLoading(true);

    async function fetchUV() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const apiKey = import.meta.env.VITE_OPENUV_API_KEY;
        if (!apiKey) {
          console.warn('OpenUV API key missing');
          return;
        }

        const url = `https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`;
        const response = await fetch(url, {
          headers: { 'x-access-token': apiKey },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`OpenUV API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data?.result?.safe_exposure_time?.st3) {
          throw new Error('Invalid OpenUV response structure');
        }

        if (isMounted) {
          const mins = Math.round(data.result.safe_exposure_time.st3 / 60);
          setBurnTimeMins(Math.max(5, Math.min(120, mins))); // Clamp to 5-120 min
          setUvIndex(data?.result?.uv ?? null);
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn('OpenUV request timeout');
        } else {
          console.warn('OpenUV fetch failed:', err.message);
        }
        
        if (isMounted) {
          setBurnTimeMins(15); // Safe default
          setUvIndex(null);
        }
      } finally {
        clearTimeout(timeout);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchUV();

    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  return { burnTimeMins, uvIndex, loading };
}
```

---

## FIX #8: Fix useOpenAQ.js Response Validation + Timeout ⚡ HIGH

**File**: `src/hooks/useOpenAQ.js`  
**Time**: 10 minutes  
**Impact**: HIGH (JSON parsing errors crash, no timeout)

### Add this helper at the top of the file:

```javascript
async function fetchWithTimeout(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      throw new Error(`Air Quality API error: ${res.status}`);
    }

    const data = await res.json();
    
    // Validate response structure
    if (!data?.hourly?.pm2_5) {
      throw new Error('Invalid Air Quality API response structure');
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Air Quality API request timeout (>6s)');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
```

### Then update the fetch call in the useOpenAQ function:

**FIND**:
```javascript
        const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
        if (!res.ok) throw new Error('AQ fetch failed');
        const data = await res.json();
```

**REPLACE WITH**:
```javascript
        const data = await fetchWithTimeout(
          `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
          6000
        );
```

---

## FIX #9: Fix useTomorrowRain.js Response Validation ⚡ HIGH

**File**: `src/hooks/useTomorrowRain.js`  
**Line**: 30 (in the fetch)  
**Time**: 5 minutes  
**Impact**: HIGH (JSON parsing errors not caught)

### Find and replace:

**FIND**:
```javascript
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Tomorrow.io error: ${res.status}`);
        }
        
        const data = await res.json();
```

**REPLACE WITH**:
```javascript
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Tomorrow.io error: ${res.status}`);
        }
        
        let data;
        try {
          data = await res.json();
        } catch (parseErr) {
          throw new Error(`Tomorrow.io response parsing failed: ${parseErr.message}`);
        }
        
        // Validate response structure
        if (!data?.data?.timelines?.[0]?.intervals) {
          throw new Error('Invalid Tomorrow.io response structure');
        }
```

---

## FIX #10: Fix useAirQuality.js Cache Parsing ⚡ MEDIUM

**File**: `src/hooks/useAirQuality.js`  
**Time**: 10 minutes  
**Impact**: MEDIUM (Corrupted cache crashes)

### Find the line with `JSON.parse(cachedString)`:

**FIND**:
```javascript
      if (cachedString) {
        const { data, timestamp } = JSON.parse(cachedString);
        if (Date.now() - timestamp < CACHE_EXPIRY) {
          if (!cancelled) setAirQuality(data);
          return;
        }
      }
```

**REPLACE WITH**:
```javascript
      if (cachedString) {
        try {
          const parsed = JSON.parse(cachedString);
          const { data, timestamp } = parsed;
          
          // Validate structure
          if (!data || typeof timestamp !== 'number') {
            throw new Error('Invalid cache format');
          }
          
          if (Date.now() - timestamp < CACHE_EXPIRY) {
            if (!cancelled) setAirQuality(data);
            return;
          }
        } catch (err) {
          console.warn('Cache corruption detected, clearing:', err);
          try {
            await storage.removeItem(cacheKey);
          } catch (e) {
            // Ignore removal errors
          }
        }
      }
```

---

## FIX #11: Add Memory Leak Protection to useAirQuality ⚡ MEDIUM

**File**: `src/hooks/useAirQuality.js`  
**Time**: 5 minutes  
**Impact**: MEDIUM (Potential memory leaks)

### Find storage.setItem calls and guard them:

**BEFORE**:
```javascript
          if (liveData) {
            try {
              await storage.setItem(cacheKey, JSON.stringify({...}));
            } catch (e) {
              // cache write failed
            }
          }
```

**AFTER**:
```javascript
          if (liveData && !cancelled) {  // ✅ Added cancelled check
            try {
              await storage.setItem(cacheKey, JSON.stringify({...}));
            } catch (e) {
              console.warn('Failed to save air quality to cache:', e);
              // cache write failed
            }
          }
```

---

## FIX #12: Fix window.innerWidth SSR Access ⚡ LOW

**File**: `src/App.jsx`  
**Line**: 213  
**Time**: 2 minutes  
**Impact**: LOW (SSR safety)

### Find and replace:

**FIND**:
```javascript
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
```

**REPLACE WITH**:
```javascript
    const [isMobile, setIsMobile] = useState(() => 
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    );
```

---

## FIX #13: Remove Unused Import ⚡ LOW

**File**: `src/App.jsx`  
**Time**: 1 minute  
**Impact**: LOW (Code cleanliness)

### Find and remove:
```javascript
import { getMelbourneWeather } from '../util/weatherService';
```

---

## PERFORMANCE OPTIMIZATIONS

### Enable Request Caching in weatherService.js

```javascript
const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedWeather(lat, lng) {
  const key = `${lat},${lng}`;
  const cached = CACHE.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  const data = await getCurrentWeather(lat, lng);
  CACHE.set(key, { data, timestamp: Date.now() });
  return data;
}
```

### Debounce Resize Handler in App.jsx

```javascript
useEffect(() => {
  let timeoutId;
  
  const handleResize = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      setIsMobile(window.innerWidth < 768);
    }, 250);
  };
  
  window.addEventListener('resize', handleResize);
  return () => {
    window.removeEventListener('resize', handleResize);
    clearTimeout(timeoutId);
  };
}, []);
```

---

## ✅ VERIFICATION CHECKLIST

After applying fixes, verify:

- [ ] App starts without errors in console
- [ ] Splash screen appears and disappears
- [ ] Weather data loads
- [ ] Cozy weather filter activates when temp < 8°C or (rainy + windy)
- [ ] Rain alert shows immediately when rain starts (0 minutes)
- [ ] App works in private/incognito mode
- [ ] Network request times out after 5-8s (observable in slow 3G mode)
- [ ] Corrupted localStorage doesn't crash app
- [ ] No unhandled promise rejections in console
- [ ] No memory leaks on component unmount (check DevTools)

---

**Total Implementation Time**: ~90 minutes  
**Files to Modify**: 7  
**Lines of Code to Change**: ~150

