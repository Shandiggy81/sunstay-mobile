/**
 * Pick the chat-header avatar from live weather.
 *
 * Open-Meteo WMO codes live on `hourly.weather_code[hourly._currentIndex]`.
 * The context weather object does not expose `current.weatherCode`, so we
 * also honour `weather[0].main` / description for demo and adapter shapes.
 */

export const THUNDER_WMO = new Set([95, 96, 99]);
export const CLEAR_WMO = new Set([0, 1]);

const finiteNumber = (value) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
};

export function readWeatherCode(weather) {
    if (!weather || typeof weather !== 'object') return null;

    const hourly = weather.hourly;
    const idx = finiteNumber(hourly?._currentIndex);
    if (hourly && Array.isArray(hourly.weather_code) && idx != null) {
        const fromHour = finiteNumber(hourly.weather_code[idx]);
        if (fromHour != null) return fromHour;
    }

    const daily0 = finiteNumber(weather.daily?.weather_code?.[0]);
    if (daily0 != null) return daily0;

    return finiteNumber(
        weather.weatherCode
        ?? weather.current?.weatherCode
        ?? weather.weather?.[0]?.id
        ?? weather.rawWeather?.weatherCode
    );
}

const isThunderLabel = (weather) => {
    const main = String(weather?.weather?.[0]?.main ?? weather?.current?.condition ?? '').toLowerCase();
    const desc = String(weather?.weather?.[0]?.description ?? '').toLowerCase();
    return main.includes('thunder') || desc.includes('thunder') || desc.includes('thunderstorm');
};

const isClearLabel = (weather) => {
    const main = String(weather?.weather?.[0]?.main ?? '').toLowerCase();
    return main === 'clear';
};

/**
 * @param {object|null|undefined} weather
 * @returns {'thunder'|'sunny'|'default'}
 */
export function resolveChatAvatarKind(weather) {
    if (!weather) return 'default';

    const code = readWeatherCode(weather);
    if (code != null && THUNDER_WMO.has(code)) return 'thunder';
    if (isThunderLabel(weather)) return 'thunder';

    if (code != null && CLEAR_WMO.has(code)) return 'sunny';
    if (code == null && isClearLabel(weather)) return 'sunny';

    return 'default';
}
