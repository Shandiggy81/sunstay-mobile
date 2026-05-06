/**
 * Weather Provider Abstraction Layer
 * @module utils/weatherProvider
 */

const DEMO_WEATHER_NORMALIZED = {
    temperature: 22,
    feelsLike: 21,
    humidity: 55,
    cloudCover: 0.20,
    windSpeed: 5,
    windDirection: 225,
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

export function getCloudCoverImpact(cloudCover) {
    const clamped = Math.max(0, Math.min(1, cloudCover));
    const sunReduction = clamped < 0.3
        ? clamped * 0.3
        : clamped < 0.7
            ? 0.09 + (clamped - 0.3) * 0.7
            : 0.37 + (clamped - 0.7) * 1.5;
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

export function getWindImpact(windSpeed, windGust) {
    const effective = windGust ? Math.max(windSpeed, windGust * 0.7) : windSpeed;
    if (effective < 3) return { level: 'calm', outdoorComfort: 1.0, description: 'Calm, ideal for outdoor dining' };
    if (effective < 6) return { level: 'light', outdoorComfort: 0.9, description: 'Light breeze, pleasant' };
    if (effective < 10) return { level: 'moderate', outdoorComfort: 0.7, description: 'Moderate wind, manageable' };
    if (effective < 15) return { level: 'strong', outdoorComfort: 0.4, description: 'Strong wind, seek shelter' };
    return { level: 'extreme', outdoorComfort: 0.1, description: 'Extreme wind, indoor recommended' };
}

export class WeatherDataProvider {
    constructor() {
        this._lastFetch = null;
        this._cacheExpiry = 15 * 60 * 1000;
    }

    async fetchCurrent(lat, lng, options = {}) {
        const { apiKey, forceRefresh = false } = options;
        if (!forceRefresh && this._lastFetch) {
            const age = Date.now() - this._lastFetch._fetchedAt;
            if (age < this._cacheExpiry) return this._lastFetch;
        }
        if (apiKey) {
            try {
                const data = await this._fetchFromOpenWeatherMap(lat, lng, apiKey);
                this._lastFetch = { ...data, _fetchedAt: Date.now() };
                return this._lastFetch;
            } catch (err) {
                console.warn('[WeatherProvider] API fetch failed, using demo data:', err.message);
            }
        }
        this._lastFetch = { ...DEMO_WEATHER_NORMALIZED, _fetchedAt: Date.now() };
        return this._lastFetch;
    }

    async fetchForecast(lat, lng, hours = 12) {
        console.info('[WeatherProvider] fetchForecast is a placeholder \u2014 not yet implemented');
        return null;
    }

    getCloudCover() { return this._lastFetch?.cloudCover ?? DEMO_WEATHER_NORMALIZED.cloudCover; }
    getWindData() {
        const d = this._lastFetch || DEMO_WEATHER_NORMALIZED;
        return { speed: d.windSpeed, direction: d.windDirection, gust: d.windGust || d.windSpeed };
    }
    getUVIndex() { return this._lastFetch?.uvIndex ?? DEMO_WEATHER_NORMALIZED.uvIndex; }

    async _fetchFromOpenWeatherMap(lat, lng, apiKey) {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OpenWeatherMap API error: ${response.status}`);
        const raw = await response.json();
        return {
            temperature: raw.main?.temp ?? 20,
            feelsLike: raw.main?.feels_like ?? 20,
            humidity: raw.main?.humidity ?? 50,
            cloudCover: (raw.clouds?.all ?? 0) / 100,
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

export const weatherProvider = new WeatherDataProvider();
