/**
 * Plain-language weather for the compact header.
 *
 * The bar shows one line ("22° · Sunny") and keeps wind, rain, cloud and
 * comfort in a details row the user opens on tap.
 */

const PLACEHOLDER = '–';

function finite(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function sentenceCase(text) {
    const s = String(text || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Words people use, not metres per second: 13 km/h is a "light breeze". */
export function describeWind(kmh) {
    const n = finite(kmh);
    if (n == null) return null;
    if (n < 6) return 'Calm';
    if (n < 20) return 'Light breeze';
    if (n < 30) return 'Breezy';
    if (n < 40) return 'Windy';
    return 'Very windy';
}

export function describeCloud(percent) {
    const n = finite(percent);
    if (n == null) return null;
    if (n < 25) return 'Mostly clear';
    if (n < 60) return 'Some cloud';
    return 'Cloudy';
}

export function rainChancePercent(weather) {
    const reported = finite(weather?.precipProbability);
    if (reported != null) return Math.max(0, Math.min(100, Math.round(reported)));
    const humidity = finite(weather?.main?.humidity) ?? 0;
    const condition = String(weather?.weather?.[0]?.main || '').toLowerCase();
    return Math.min(100, Math.round(humidity * 0.3 + (condition.includes('rain') ? 40 : 0)));
}

/**
 * @param {object|null} weather OpenWeather-shaped weather from WeatherContext.
 * @param {{ windView?: { speedKmh?: number|null, gustKmh?: number|null }, comfort?: { label?: string }|null }} [extra]
 */
export function headerWeatherSummary(weather, { windView = null, comfort = null } = {}) {
    if (!weather) {
        return {
            temperature: ' ',
            condition: 'Loading weather…',
            comfort: null,
            details: [],
        };
    }
    // WeatherContext falls back to a fixed demo reading when Open-Meteo fails.
    // Showing it as live weather would be wrong, so say it is unavailable.
    if (weather.source === 'demo' || weather.unavailable) {
        return {
            temperature: PLACEHOLDER,
            condition: 'Live weather unavailable',
            comfort: null,
            details: [],
        };
    }
    const temp = finite(weather.main?.temp);
    const condition = sentenceCase(weather.weather?.[0]?.description) || PLACEHOLDER;
    const speed = finite(windView?.speedKmh);
    const gust = finite(windView?.gustKmh);
    const cloud = finite(weather.clouds?.all);
    const comfortLabel = comfort?.label && comfort.label !== 'Loading' ? comfort.label : null;

    return {
        temperature: temp == null ? PLACEHOLDER : `${Math.round(temp)}°`,
        condition,
        comfort: comfortLabel,
        details: [
            {
                label: 'Wind',
                value: describeWind(speed) ?? PLACEHOLDER,
                note: speed == null ? null : gust != null ? `${speed} km/h · gusts ${gust}` : `${speed} km/h`,
            },
            {
                label: 'Rain',
                value: `${rainChancePercent(weather)}% chance`,
                note: null,
            },
            {
                label: 'Sky',
                value: describeCloud(cloud) ?? PLACEHOLDER,
                note: cloud == null ? null : `${Math.round(cloud)}% cloud`,
            },
        ],
    };
}
