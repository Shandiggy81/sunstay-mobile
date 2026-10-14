/**
 * One sun forecast per venue and every piece of text the card and the list
 * build from it: the stat-row chip, the "Today's sun" sentence, the list's
 * status line and the hour-by-hour strip. They all read the same
 * deriveSunForecast() result (the same one heroSunChip reads), so no two
 * places on screen can disagree.
 */

import { getSunData } from './getSunData.js';
import { checkIfShaded, getVenueSunStatus } from './solarMath.js';
import { deriveSunForecast, formatDuration, formatHour } from './sunForecastState.js';
import { forecastKindIconName, weatherIconName } from './clayIcons.js';
import { calculateApparentTemp, getWindProfile } from '../data/windIntelligence.js';

function finite(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// The Supabase venues table defaults every row to obstacle_height 2 and
// obstacle_distance 1, so that pair is a placeholder, not a survey.
const DEFAULT_OBSTACLE = Object.freeze({ height: 2, distance: 1 });

/**
 * Only venues with surveyed surroundings are marked shaded by geometry. The
 * 2 m-at-1 m default shades every venue whenever the sun is below 63°,
 * which in Melbourne is most of the year, and contradicts the forecast.
 */
export function hasObstacleData(venue) {
    const height = finite(venue?.obstacle_height);
    const distance = finite(venue?.obstacle_distance);
    if (height == null || distance == null) return false;
    return !(height === DEFAULT_OBSTACLE.height && distance === DEFAULT_OBSTACLE.distance);
}

/**
 * @param {object} input
 * @param {object} input.venue
 * @param {object|null} input.weather WeatherContext weather (hourly, utcOffsetSeconds, …)
 * @param {Date} [input.now]
 * @param {{ sunriseDate: Date, sunsetDate: Date }|null} [input.sunTimes] defaults to getSunData(lat, lng)
 */
export function venueSunForecast({ venue, weather, now = new Date(), sunTimes } = {}) {
    const lat = finite(venue?.lat);
    const lng = finite(venue?.lng);
    const times = sunTimes !== undefined ? sunTimes : (lat != null && lng != null ? getSunData(lat, lng) : null);

    let shaded = false;
    if (lat != null && lng != null && hasObstacleData(venue)) {
        const sun = getVenueSunStatus(lat, lng, now);
        shaded = sun.isSunUp && checkIfShaded(sun.altitude, Number(venue.obstacle_height), Number(venue.obstacle_distance));
    }

    const raining = (finite(weather?.precipitation) ?? 0) > 0
        || /rain|drizzle|thunder/i.test(String(weather?.weather?.[0]?.main ?? ''));

    return deriveSunForecast({
        hourly: weather?.hourly ?? null,
        utcOffsetSeconds: weather?.utcOffsetSeconds,
        now,
        sunrise: times?.sunriseDate,
        sunset: times?.sunsetDate,
        shaded,
        current: { cloudCover: weather?.cloudCoverPct ?? weather?.clouds?.all, clearness: weather?.skyClearness, isRaining: raining },
    });
}

/**
 * Feels-like at the venue: the current temperature with the venue's own wind
 * shelter applied. The list row and the card both show this number.
 *
 * @returns {number|null} whole degrees
 */
export function venueFeelsLike(venue, weather) {
    const temp = finite(weather?.main?.temp);
    if (temp == null) return null;
    const shelter = getWindProfile(venue ?? {}).shelterFactor;
    const value = calculateApparentTemp(temp, weather?.wind?.speed, weather?.main?.humidity, shelter,
        weather?.windDirection ?? weather?.wind?.deg, weather?.windGusts == null ? null : weather.windGusts / 3.6, venue);
    return Number.isFinite(value) ? Math.round(value) : null;
}

const hasDaylight = (f) => f?.sunriseHour != null && f?.sunsetHour != null && f.sunriseHour < f.sunsetHour;

/**
 * The stat row's middle cell: "Sun until 3pm", "Sun returns 6pm", …
 * @returns {string}
 */
export function sunStatText(forecast) {
    if (!hasDaylight(forecast)) return 'Sun times unavailable';
    const { nowHour, sunriseHour, sunsetHour, now, sunUntil, nextSunHour, hasHourly } = forecast;
    if (nowHour >= sunsetHour) return 'Sun has set';
    if (nowHour < sunriseHour) return `Sun up ${formatHour(sunriseHour)}`;
    if (now.kind === 'sun' && sunUntil != null) return `Sun until ${formatHour(sunUntil)}`;
    if (now.kind === 'shaded') return 'Shaded now';
    if (!hasHourly) return `Sunset ${formatHour(sunsetHour)}`;
    if (nextSunHour != null) return `Sun returns ${formatHour(nextSunHour)}`;
    return 'No more sun today';
}

/**
 * "Today's sun": one plain-English sentence.
 * @returns {string}
 */
export function sunSentence(forecast) {
    if (!hasDaylight(forecast)) return "Sun times aren't available right now.";
    const {
        nowHour, sunriseHour, sunsetHour, now, sunUntil, nextSunHour,
        hasHourly, sunMinutesToday, sunMinutesLeft,
    } = forecast;
    const today = sunMinutesToday ?? 0;
    const left = sunMinutesLeft ?? 0;

    if (nowHour >= sunsetHour) {
        return today > 0
            ? `The sun has set. Today had about ${formatDuration(today)} of direct sun.`
            : 'The sun has set for today.';
    }
    if (nowHour < sunriseHour) {
        const expect = hasHourly
            ? (today > 0 ? ` Expect about ${formatDuration(today)} of direct sun today.` : ' No direct sun is forecast today.')
            : '';
        return `The sun's up at ${formatHour(sunriseHour)}.${expect}`;
    }
    if (!hasHourly) {
        return `${formatDuration((sunsetHour - nowHour) * 60)} of daylight left. Sunset is at ${formatHour(sunsetHour)}.`;
    }
    if (now.kind === 'sun') {
        const until = sunUntil != null ? ` until ${formatHour(sunUntil)}` : '';
        const more = left > 0 ? ` About ${formatDuration(left)} of direct sun left today.` : '';
        return `Sunny now${until}.${more}`;
    }
    if (now.kind === 'shaded') {
        return left > 0
            ? `Shaded by nearby buildings right now, though ${formatDuration(left)} of sun is still forecast today.`
            : 'Shaded by nearby buildings right now, and no more direct sun is forecast today.';
    }
    const lead = now.kind === 'rain' ? 'Rain about right now.' : 'Cloud is blocking the sun right now.';
    if (nextSunHour != null && left > 0) return `${lead} Sun returns around ${formatHour(nextSunHour)}.`;
    return `${lead} No more direct sun is forecast today.`;
}

const STATUS_WORD = Object.freeze({
    sun: 'Sunny',
    cloud: 'Cloudy',
    rain: 'Rain',
    shaded: 'Shaded',
    night: 'After dark',
});

/**
 * The venue list's status line, e.g. "Shaded · sun from 6pm".
 * @returns {{ text: string, icon: string }}
 */
export function listSunStatus(forecast) {
    if (!hasDaylight(forecast)) return { text: 'Sun times unavailable', icon: 'sun-cloud' };
    const { nowHour, sunriseHour, sunsetHour, now, sunUntil, nextSunHour, hasHourly } = forecast;
    if (nowHour >= sunsetHour) return { text: 'After dark', icon: 'night' };
    if (nowHour < sunriseHour) return { text: `Sun up ${formatHour(sunriseHour)}`, icon: 'night' };
    const icon = forecastKindIconName(now.kind);
    if (!hasHourly) return { text: `Daylight · sunset ${formatHour(sunsetHour)}`, icon };
    const word = STATUS_WORD[now.kind] ?? 'Daylight';
    if (now.kind === 'sun') {
        return { text: sunUntil != null ? `${word} · until ${formatHour(sunUntil)}` : word, icon };
    }
    // The forecast can't say when the buildings stop blocking the sun.
    if (now.kind === 'shaded') return { text: word, icon };
    if (nextSunHour != null) {
        return { text: `${word} · sun from ${formatHour(nextSunHour)}`, icon };
    }
    return { text: `${word} · no more sun today`, icon };
}

/**
 * The hour-by-hour strip from the same hourly forecast, starting at the
 * current hour.
 *
 * @param {object|null} weather WeatherContext weather
 * @param {{ now?: Date, count?: number, forecast?: object }} [options]
 *   `forecast` (from venueSunForecast) marks night hours when the payload has no is_day.
 * @returns {Array<{ key: string, label: string, isNow: boolean, icon: string, temp: number|null, rainChance: number|null }>}
 */
export function hourlyStrip(weather, { now = new Date(), count = 12, forecast = null } = {}) {
    const hourly = weather?.hourly;
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    if (times.length === 0) return [];
    const offset = finite(weather?.utcOffsetSeconds) ?? finite(hourly._tzOffsetSeconds) ?? -now.getTimezoneOffset() * 60;
    const nowKey = new Date(now.getTime() + offset * 1000).toISOString().slice(0, 13);
    const start = times.findIndex((t) => typeof t === 'string' && t.slice(0, 13) === nowKey);
    if (start < 0) return [];

    const day = nowKey.slice(0, 10);
    const items = [];
    for (let i = start; i < times.length && items.length < count; i += 1) {
        const iso = times[i];
        const hour = Number(iso.slice(11, 13));
        const isDay = finite(hourly.is_day?.[i]);
        let isNight;
        if (isDay != null) isNight = isDay === 0;
        else if (forecast && hasDaylight(forecast) && iso.startsWith(day)) {
            isNight = hour + 1 <= forecast.sunriseHour || hour >= forecast.sunsetHour;
        } else isNight = hour < 6 || hour >= 20;

        const temp = finite(hourly.temperature_2m?.[i]);
        const rain = finite(hourly.precipitation_probability?.[i]);
        items.push({
            key: iso,
            label: i === start ? 'Now' : formatHour(hour),
            isNow: i === start,
            icon: weatherIconName(hourly.weather_code?.[i] ?? hourly.weathercode?.[i], { isNight }),
            temp: temp == null ? null : Math.round(temp),
            rainChance: rain == null ? null : Math.round(rain),
        });
    }
    return items;
}
