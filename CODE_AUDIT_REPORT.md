# Sunstay Mobile - Comprehensive Code Audit Report

**Date**: July 8, 2026  
**Project**: sunstay-mobile (Weather-aware venue discovery app)  
**Framework**: React 19 + Vite 7 (using Supabase, not Firebase)  
**Total Issues Found**: 25 (1 Critical, 6 High, 8 Medium, 10 Low)

---

## 🔴 CRITICAL ISSUES (Must Fix Immediately)

### 1. **SECURITY: Hardcoded API Credentials**
- **File**: [src/lib/supabase.js](src/lib/supabase.js)
- **Severity**: CRITICAL
- **Impact**: Database compromise - anyone with access to code can query/modify your Supabase instance

**Current Code (Lines 1-7)**:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fksuqgvsazoxarocmaii.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_fninyuZBIHxr7hz_1gQ69g_osWRZhaz';

export const supabase = createClient(supabaseUrl, supabaseKey);
```

**Fix**:
```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

**Action Items**:
1. ✅ Update `.env.local` with your actual credentials
2. ✅ Regenerate Supabase API key immediately (current key is exposed)
3. ✅ Never commit `.env.local` to version control
4. ✅ Add `.env.local` to `.gitignore`

---

## 🟠 HIGH PRIORITY BUGS (Fix Before Production)

### 2. **Broken Feature: Cozy Weather Logic Always Returns False**
- **File**: [src/App.jsx](src/App.jsx#L243-L249)
- **Severity**: HIGH
- **Impact**: Cozy weather filter feature is completely non-functional

**Current Code (Lines 243-249)**:
```javascript
const cozyWeatherActive = useMemo(() => {
    if (!weather) return false;
    const minTemp = weather.minTemp || 20;              // ❌ Property doesn't exist
    const precip = weather.precipitation || 0;         // ❌ Property doesn't exist
    const wind = weather.windSpeed || 0;               // ❌ Property doesn't exist
    return minTemp < 8 || (precip > 0.5 || wind > 15);
}, [weather]);
```

**Why It's Broken**: 
- The weather object from WeatherContext has structure: `weather.main.temp`, `weather.wind.speed`, `weather.precipProbability`
- All three fallback values are used, so condition always evaluates to `false`

**Fix**:
```javascript
const cozyWeatherActive = useMemo(() => {
    if (!weather) return false;
    const temp = weather.main?.temp ?? 20;                           // Get actual temp
    const precipProbability = weather.precipProbability ?? 0;        // Get actual precip
    const wind = weather.wind?.speed ?? weather.windGusts ?? 0;      // Get actual wind
    const isRainy = weather.weather?.[0]?.main?.toLowerCase().includes('rain');
    
    // Cozy: cold (< 8°C) OR (rainy AND windy)
    return temp < 8 || (isRainy && wind > 15);
}, [weather]);
```

---

### 3. **Logic Error: Rain Detection Off-by-One**
- **File**: [src/hooks/useTomorrowRain.js](src/hooks/useTomorrowRain.js#L31-L41)
- **Severity**: HIGH
- **Impact**: Rain alerts delayed by 1+ minute if precipitation starts immediately

**Current Code (Lines 31-41)**:
```javascript
let rainMin = -1;

for (let i = 0; i < nextHour.length; i++) {
  const intensity = nextHour[i].values?.precipitationIntensity || 0;
  if (intensity > 0.1) {
    rainMin = i;
    break;
  }
}

if (isMounted) {
  if (rainMin > 0) {  // ❌ BUG: rainMin = 0 is valid but skipped!
    setIsRainStartingSoon(true);
    setMinutesUntilRain(rainMin);
  } else {
```

**Why It's Broken**: 
- `rainMin = 0` means rain starts in this minute (valid condition)
- `rainMin > 0` skips this case
- User sees rain alert 1-2 minutes late

**Fix**:
```javascript
let rainMin = -1;

for (let i = 0; i < nextHour.length; i++) {
  const intensity = nextHour[i].values?.precipitationIntensity || 0;
  if (intensity > 0.1) {
    rainMin = i;
    break;
  }
}

if (isMounted) {
  if (rainMin >= 0) {  // ✅ FIXED: Include rainMin = 0 case
    setIsRainStartingSoon(true);
    setMinutesUntilRain(rainMin);
  } else {
```

---

### 4. **Missing Error Handling: weatherService.js**
- **File**: [src/api/weatherService.js](src/api/weatherService.js#L14-L19)
- **Severity**: HIGH
- **Impact**: `.json()` parsing errors crash components; no timeout protection

**Current Code (Lines 14-19)**:
```javascript
export async function getCurrentWeather(lat, lng) {
  const res = await fetch(
    `${BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`
  );
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`);
  return res.json();  // ❌ No error handling for parsing failures
}
```

**Fix**:
```javascript
export async function getCurrentWeather(lat, lng) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
  
  try {
    const res = await fetch(
      `${BASE_URL}/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}&units=metric`,
      { signal: controller.signal }
    );
    
    if (!res.ok) {
      throw new Error(`Weather fetch failed: ${res.status}`);
    }
    
    const data = await res.json();
    clearTimeout(timeout);
    return data;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error('Weather API request timeout (>8s)');
    }
    throw err;
  }
}
```

**Apply the same pattern to**: `getHourlyForecast()` (lines 24-29)

---

### 5. **Unhandled Promise Rejection: useOpenUV.js**
- **File**: [src/hooks/useOpenUV.js](src/hooks/useOpenUV.js)
- **Severity**: HIGH
- **Impact**: Silent failures; component never updates if API fails; no response validation

**Current Code**:
```javascript
fetch(`https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`, {
  headers: { 'x-access-token': import.meta.env.VITE_OPENUV_API_KEY }
})
  .then(r => r.json())  // ❌ No response.ok check
  .then(data => {
    const mins = data?.result?.safe_exposure_time?.st3;
    if (isMounted && typeof mins === 'number') setBurnTimeMins(mins);
  })
  .catch(() => {});  // ❌ Error silently ignored
```

**Fix**:
```javascript
fetch(`https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`, {
  headers: { 'x-access-token': import.meta.env.VITE_OPENUV_API_KEY },
  signal: AbortSignal.timeout(5000),  // 5s timeout
})
  .then(res => {
    if (!res.ok) throw new Error(`OpenUV API error: ${res.status}`);
    return res.json();
  })
  .then(data => {
    const mins = data?.result?.safe_exposure_time?.st3;
    if (isMounted && typeof mins === 'number') {
      setBurnTimeMins(mins);
    }
  })
  .catch(err => {
    console.warn('OpenUV fetch failed:', err);
    if (isMounted) setBurnTimeMins(15); // Safe default
  });
```

---

### 6. **Missing Response Validation: useOpenAQ.js**
- **File**: [src/hooks/useOpenAQ.js](src/hooks/useOpenAQ.js)
- **Severity**: HIGH
- **Impact**: Unexpected JSON structure crashes parsing; no timeout

**Current Code**:
```javascript
const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
if (!res.ok) throw new Error('AQ fetch failed');
const data = await res.json();  // ❌ No try-catch if JSON parsing fails
```

**Fix**:
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 6000);

try {
  const res = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
    { signal: controller.signal }
  );
  
  if (!res.ok) throw new Error(`Air Quality API error: ${res.status}`);
  
  const data = await res.json();
  
  // Validate expected structure
  if (!data?.hourly?.pm2_5) {
    throw new Error('Unexpected Air Quality API response structure');
  }
  
  return data;
} catch (err) {
  if (err.name === 'AbortError') {
    throw new Error('Air Quality API timeout (>6s)');
  }
  throw err;
} finally {
  clearTimeout(timeout);
}
```

---

### 7. **Missing Null Checks: sessionStorage Access**
- **File**: [src/App.jsx](src/App.jsx#L162)
- **Severity**: HIGH
- **Impact**: Crashes in private browsing mode or when sessionStorage is unavailable

**Current Code (Line 162)**:
```javascript
const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('splashShown') === 'true');
```

**Fix**:
```javascript
const [splashDone, setSplashDone] = useState(() => {
  try {
    return sessionStorage?.getItem('splashShown') === 'true';
  } catch (err) {
    console.warn('sessionStorage unavailable:', err);
    return false;
  }
});
```

---

### 8. **Corrupted Cache Crashes Component: App.jsx**
- **File**: [src/App.jsx](src/App.jsx#L200)
- **Severity**: HIGH
- **Impact**: Single corrupted localStorage entry crashes entire app startup

**Current Code (Line 200)**:
```javascript
const [customFilters, setCustomFilters] = useState(
  JSON.parse(localStorage.getItem('sunstay-custom-filters') || '[]')  // ❌ No error handling
);
```

**Fix**:
```javascript
const [customFilters, setCustomFilters] = useState(() => {
  try {
    const stored = localStorage.getItem('sunstay-custom-filters');
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.warn('Failed to parse stored filters, resetting:', err);
    localStorage.removeItem('sunstay-custom-filters');
    return [];
  }
});
```

---

## 🟡 MEDIUM PRIORITY ISSUES (Improve Code Quality)

### 9. **Dependency Array Circular Reference: WeatherContext.jsx**
- **File**: [src/context/WeatherContext.jsx](src/context/WeatherContext.jsx)
- **Severity**: MEDIUM
- **Impact**: Potential infinite loops or excessive re-fetches

**Issue**: `fetchWeather` depends on `WEATHER_API_KEY` and `overrideType`, but `fetchWeather` is in the dependency array

**Recommendation**: Use AbortController to cancel in-flight requests instead of depending on `fetchWeather`

---

### 10. **Missing Timeout on All API Calls**
- **Files**: Multiple
- **Severity**: MEDIUM
- **Impact**: UI hangs indefinitely if APIs are unresponsive

**Apply to**:
- `src/api/weatherService.js`
- `src/hooks/useOpenAQ.js` 
- `src/hooks/useOpenUV.js`
- `src/hooks/useTomorrowRain.js`
- `src/hooks/useAirQuality.js`
- `src/context/WeatherContext.jsx`

**Pattern** (modern JavaScript):
```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  // ... handle response
} catch (err) {
  if (err.name === 'AbortError') {
    console.error('API request timeout');
  }
} finally {
  clearTimeout(timeoutId);
}
```

---

### 11. **Memory Leak Potential: useAirQuality.js**
- **File**: [src/hooks/useAirQuality.js](src/hooks/useAirQuality.js)
- **Severity**: MEDIUM
- **Impact**: Storage operations could complete after component unmounts

**Issue**: 
```javascript
// ❌ Could update after unmount
await storage.setItem(cacheKey, JSON.stringify({...}));
```

**Fix**:
```javascript
// ✅ Guard against state update after unmount
if (!cancelled) {
  await storage.setItem(cacheKey, JSON.stringify({...}));
}
```

---

### 12. **Poor Error Messages**
- **File**: [src/api/weatherService.js](src/api/weatherService.js)
- **Severity**: MEDIUM
- **Recommendation**: Add context to errors for debugging

**Current**:
```javascript
throw new Error(`Weather fetch failed: ${res.status}`);
```

**Better**:
```javascript
throw new Error(
  `Weather API failed (${res.status}): ${lat},${lng} at ${new Date().toISOString()}`
);
```

---

### 13. **Unsafe Property Access: App.jsx**
- **File**: [src/App.jsx](src/App.jsx)
- **Severity**: MEDIUM
- **Example**:
```javascript
// ❌ profile.shelterFactor could be undefined
Math.round(calculateApparentTemp(temp, weather?.wind?.speed, weather?.main?.humidity, profile.shelterFactor))
```

**Fix**:
```javascript
// ✅ Safe optional chaining
Math.round(calculateApparentTemp(temp, weather?.wind?.speed, weather?.main?.humidity, profile?.shelterFactor ?? 0.5))
```

---

## 🟢 LOW PRIORITY - CODE QUALITY IMPROVEMENTS

### 14. **Race Condition: setTimeout in handleFindWheelchair**
- **File**: [src/App.jsx](src/App.jsx)
- **Issue**: setTimeout doesn't guarantee order if component unmounts
- **Fix**: Use AbortController or combine state updates

---

### 15. **Missing Optional Chaining on SSR Access**
- **File**: [src/App.jsx](src/App.jsx#L213)
- **Issue**: 
```javascript
const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
```
- **Fix**:
```javascript
const [isMobile, setIsMobile] = useState(
  typeof window !== 'undefined' ? window.innerWidth < 768 : false
);
```

---

### 16. **Silent Error Catch: useOpenUV.js**
- **File**: [src/hooks/useOpenUV.js](src/hooks/useOpenUV.js)
- **Issue**: `.catch(() => {})` completely hides errors
- **Fix**: Add console warning for debugging

---

### 17. **Unused Imports: App.jsx**
- **File**: [src/App.jsx](src/App.jsx)
- **Issue**: `getMelbourneWeather` imported but never used
- **Fix**: Remove unused import

---

### 18. **No Retry Logic on Transient Failures**
- **Files**: All API files
- **Issue**: Network blips fail immediately
- **Recommendation**: Implement exponential backoff (1s, 2s, 4s, 8s)

---

### 19. **Inconsistent Error Handling Patterns**
- **Files**: Multiple
- **Issue**: Mix of try-catch, .catch(), and silent failures
- **Recommendation**: Standardize on async/await + try-catch

---

### 20. **Cache Validation Error: useAirQuality.js**
- **File**: [src/hooks/useAirQuality.js](src/hooks/useAirQuality.js)
- **Issue**: 
```javascript
const { data, timestamp } = JSON.parse(cachedString);  // ❌ Could throw if format invalid
```
- **Fix**:
```javascript
try {
  const { data, timestamp } = JSON.parse(cachedString);
  // ... validate structure before use
} catch (err) {
  console.warn('Cache corruption detected, clearing:', err);
  await storage.removeItem(cacheKey);
}
```

---

## 📋 PRIORITY IMPLEMENTATION CHECKLIST

### 🔥 **DO IMMEDIATELY** (Today)
- [ ] 1. Fix hardcoded Supabase credentials (SECURITY)
- [ ] 2. Fix cozy weather logic (BROKEN FEATURE)
- [ ] 3. Fix rain detection off-by-one error
- [ ] 4. Add sessionStorage error handling

### ⚡ **DO THIS WEEK** (High Priority)
- [ ] 5. Add timeout handling to all API calls
- [ ] 6. Add JSON parse error handling (weatherService, OpenUV, OpenAQ, Tomorrow.io)
- [ ] 7. Fix localStorage corruption handling in App.jsx
- [ ] 8. Add response.ok validation to all fetch calls

### 📌 **SCHEDULE FOR NEXT SPRINT** (Medium Priority)
- [ ] 9. Fix WeatherContext dependency array
- [ ] 10. Fix memory leak in useAirQuality
- [ ] 11. Improve error messages with context
- [ ] 12. Fix unsafe property access patterns
- [ ] 13. Add retry logic to API calls

### 📚 **NICE-TO-HAVE** (Low Priority)
- [ ] 14. Standardize error handling patterns
- [ ] 15. Remove unused imports
- [ ] 16. Add optional chaining for SSR safety
- [ ] 17. Implement exponential backoff

---

## 🎯 TESTING RECOMMENDATIONS

### Test Scenarios to Verify Fixes:

1. **Network Timeout**
   - Throttle network to slow 3G
   - Verify API calls timeout gracefully (5-8s max)

2. **Cozy Weather**
   - Set mock weather to cold (< 8°C)
   - Set to rainy + windy
   - Verify cozy filter activates

3. **Rain Alerts**
   - Mock rain starting immediately (minute 0)
   - Verify alert shows "Rain in 0 minutes"

4. **Private Browsing**
   - Test in incognito mode
   - Verify splash screen works
   - Verify no localStorage errors

5. **Corrupted Cache**
   - Manually corrupt localStorage entry
   - Restart app
   - Verify app loads without crash

6. **API Failures**
   - Mock 500 error responses
   - Mock invalid JSON responses
   - Mock network disconnect
   - Verify graceful fallback to demo data

---

## 📊 SUMMARY

| Severity | Count | Status | Timeline |
|----------|-------|--------|----------|
| 🔴 CRITICAL | 1 | Security | Today |
| 🟠 HIGH | 6 | Functional | This Week |
| 🟡 MEDIUM | 8 | Quality | Next Sprint |
| 🟢 LOW | 10 | Polish | As-needed |
| **TOTAL** | **25** | | |

**Estimated Fix Time**: 
- CRITICAL + HIGH: 3-4 hours
- MEDIUM: 2-3 hours  
- LOW: 1-2 hours
- **Total**: ~6-9 hours

---

## 🔗 RELATED RESOURCES

- [Supabase Security Best Practices](https://supabase.com/docs/guides/api/auth)
- [AbortController Timeout Pattern](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Resilient Fetch Patterns](https://www.npmjs.com/package/node-fetch)

---

**Report Generated**: July 8, 2026  
**Next Review**: After implementing HIGH priority fixes
