/**
 * Weather Provider Abstraction Layer
 * ───────────────────────────────────
 * Provides a unified interface for weather data, ready for multiple
 * provider backends (OpenWeatherMap, BOM, WeatherAPI, etc.).
 *
 * Currently backed by OpenWeatherMap with demo fallback.
 * Exposes normalized cloud cover, wind, and UV data for sun accuracy.
 *
 * @module util/weatherProvider
 */

// ── Demo Fallback Data ───────────────────────────────────────────

const DEMO_WEATHER_NORMALIZED = {
    temperature: 22,
    feelsLike: 21,
    humidity: 55,
    cloudCover: 0.20,       // 20% — realistic partly cloudy
    windSpeed: 5,           // m/s
    windDirection: 225,     // SW (common Melbourne direction)
    windGust: 8,
    uvIndex: 6,
    condition: 'partly_cloudy',
    description: 'Partly cloudy',
    icon: '02d',
    visibility: 10000,
    pressure: 1015,
    provider: 'demo',
    raw: null,
};


// ── Condition Normalizer ─────────────────────────────────────────

/**
 * Normalize an OpenWeatherMap condition string to a standard enum.
 * @param {string} owmCondition
 * @returns {string}
 */
function normalizeCondition(owmCondition) {
    const c = (owmCondition || '').toLowerCase();
    if (c.includes('clear') || c.includes('sunny')) return 'clear';
    if (c.includes('few clouds') || c.includes('scattered')) return 'partly_cloudy';
    if (c.includes('cloud') || c.includes('overcast')) return 'cloudy';
    if (c.includes('drizzle')) return 'drizzle';
    if (c.includes('rain')) return 'rain';
    if (c.includes('thunder') || c.includes('storm')) return 'thunderstorm';
    if (c.includes('snow') || c.includes('sleet')) return 'snow';
    if (c.includes('mist') || c.includes('fog') || c.includes('haze')) return 'fog';
    return 'unknown';
}


// ── Cloud Cover Impact on Sun ────────────────────────────────────

/**
 * Calculate how much cloud cover reduces effective sunshine.
 *
 * @param {number} cloudCover - Cloud cover fraction 0–1
 * @returns {{ sunReduction: number, effectiveIntensity: number, label: string }}
 */
export function getCloudCoverImpact(cloudCover) {
    const clamped = Math.max(0, Math.min(1, cloudCover));

    // Non-linear: thin clouds reduce less, thick overcast blocks most
    const sunReduction = clamped < 0.3
        ? clamped * 0.3          // Light clouds: 0–9% reduction
        : clamped < 0.7
            ? 0.09 + (clamped - 0.3) * 0.7   // Medium: 9–37% reduction
            : 0.37 + (clamped - 0.7) * 1.5;  // Heavy: 37–82% reduction

    const effectiveIntensity = Math.max(0, 1 - sunReduction);

    let label;
    if (clamped < 0.1) label = 'Clear skies';
    else if (clamped < 0.3) label = 'Mostly clear';
    else if (clamped < 0.6) label = 'Partly cloudy';
    else if (clamped < 0.85) label = 'Mostly cloudy';
    else label = 'Overcast';

    return {
        sunReduction: parseFloat(sunReduction.toFixed(3)),
        effectiveIntensity: parseFloat(effectiveIntensity.toFixed(3)),
        label,
    };
}


// ── Wind Impact Assessment ───────────────────────────────────────

/**
 * Assess wind impact on outdoor comfort.
 *
 * @param {number} windSpeed - m/s
 * @param {number} [windGust] - m/s
 * @returns {{ level: string, outdoorComfort: number, description: string }}
 */
export function getWindImpact(windSpeed, windGust) {
    const effective = windGust ? Math.max(windSpeed, windGust * 0.7) : windSpeed;

    if (effective < 3) return { level: 'calm', outdoorComfort: 1.0, description: 'Calm, ideal for outdoor dining' };
    if (effective < 6) return { level: 'light', outdoorComfort: 0.9, description: 'Light breeze, pleasant' };
    if (effective < 10) return { level: 'moderate', outdoorComfort: 0.7, description: 'Moderate wind, manageable' };
    if (effective < 15) return { level: 'strong', outdoorComfort: 0.4, description: 'Strong wind, seek shelter' };
    return { level: 'extreme', outdoorComfort: 0.1, description: 'Extreme wind, indoor recommended' };
}


// ── Main Provider Class ──────────────────────────────────────────

/**
 * Unified weather provider.
 *
 * Usage:
 *   const provider = new WeatherDataProvider();
 *   const data = await provider.fetchCurrent(-37.8136, 144.9631);
 *   console.log(data.cloudCover, data.windSpeed);
 */
export class WeatherDataProvider {
    constructor() {
        this._lastFetch = null;
        this._cacheExpiry = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * Fetch current weather for a location.
     * Returns normalized data regardless of backend provider.
     *
     * @param {number} lat
     * @param {number} lng
     * @param {object} [options]
     * @param {string} [options.apiKey] - OpenWeatherMap API key
     * @param {boolean} [options.forceRefresh=false]
     * @returns {Promise<object>} Normalized weather data
     */
    async fetchCurrent(lat, lng, options = {}) {
        const { apiKey, forceRefresh = false } = options;

        // Return cache if valid
        if (!forceRefresh && this._lastFetch) {
            const age = Date.now() - this._lastFetch._fetchedAt;
            if (age < this._cacheExpiry) {
                return this._lastFetch;
            }
        }

        // Try OpenWeatherMap if API key available
        if (apiKey) {
            try {
                const data = await this._fetchFromOpenWeatherMap(lat, lng, apiKey);
                this._lastFetch = { ...data, _fetchedAt: Date.now() };
                return this._lastFetch;
            } catch (err) {
                console.warn('[WeatherProvider] API fetch failed, using demo data:', err.message);
            }
        }

        // Fallback to demo data
        this._lastFetch = { ...DEMO_WEATHER_NORMALIZED, _fetchedAt: Date.now() };
        return this._lastFetch;
    }

    /**
     * Fetch hourly forecast for the next N hours.
     *
     * TODO: Implement with OpenWeatherMap One Call API or BOM forecast endpoint
     *
     * @param {number} lat
     * @param {number} lng
     * @param {number} [hours=12]
     * @returns {Promise<null>} Placeholder — returns null until implemented
     */
    async fetchForecast(lat, lng, hours = 12) {
        // TODO: Implement hourly forecast fetching
        // Will return array of { hour, temperature, cloudCover, windSpeed, condition }
        console.info('[WeatherProvider] fetchForecast is a placeholder — not yet implemented');
        return null;
    }

    /**
     * Quick accessor: cloud cover from last fetch (0–1 fraction).
     * @returns {number}
     */
    getCloudCover() {
        return this._lastFetch?.cloudCover ?? DEMO_WEATHER_NORMALIZED.cloudCover;
    }

    /**
     * Quick accessor: wind data from last fetch.
     * @returns {{ speed: number, direction: number, gust: number }}
     */
    getWindData() {
        const d = this._lastFetch || DEMO_WEATHER_NORMALIZED;
        return {
            speed: d.windSpeed,
            direction: d.windDirection,
            gust: d.windGust || d.windSpeed,
        };
    }

    /**
     * Quick accessor: UV index from last fetch.
     * @returns {number}
     */
    getUVIndex() {
        return this._lastFetch?.uvIndex ?? DEMO_WEATHER_NORMALIZED.uvIndex;
    }

    // ── Private: OpenWeatherMap Adapter ─────────────────────────

    async _fetchFromOpenWeatherMap(lat, lng, apiKey) {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`OpenWeatherMap API error: ${response.status}`);
        }

        const raw = await response.json();

        return {
            temperature: raw.main?.temp ?? 20,
            feelsLike: raw.main?.feels_like ?? 20,
            humidity: raw.main?.humidity ?? 50,
            cloudCover: (raw.clouds?.all ?? 0) / 100,       // OWM returns 0–100, normalize to 0–1
            windSpeed: raw.wind?.speed ?? 0,
            windDirection: raw.wind?.deg ?? 0,
            windGust: raw.wind?.gust ?? raw.wind?.speed ?? 0,
            uvIndex: raw.uvi ?? (raw.weather?.[0]?.main === 'Clear' ? 7 : 3),
            condition: normalizeCondition(raw.weather?.[0]?.description || ''),
            description: raw.weather?.[0]?.description || 'Unknown',
            icon: raw.weather?.[0]?.icon || '01d',
            visibility: raw.visibility ?? 10000,
            pressure: raw.main?.pressure ?? 1013,
            provider: 'openweathermap',
            raw,
        };
    }
}

// ── Singleton Export ──────────────────────────────────────────────

/**
 * Default singleton instance for app-wide use.
 * Import and call `weatherProvider.fetchCurrent(lat, lng)`.
 */
export const weatherProvider = new WeatherDataProvider();
