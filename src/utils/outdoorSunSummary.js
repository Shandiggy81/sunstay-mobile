/**
 * The outdoor venue card's sun text when it shows "Sun moments today".
 *
 * That panel's total is the venue's direct-sun window after the buildings
 * around it (outdoorSunDay). The stat row and the sentence above it used to
 * read the open-sky weather forecast instead (deriveSunForecast: every sunny
 * forecast hour from now to sunset, no buildings), so the same card could say
 * "6h 37m of direct sun left today" next to "1h 28m of sun at this venue
 * today". Here "left" is cut from the same windows as the total, so it can
 * never exceed it. The forecast only says whether cloud or rain is in the way
 * right now.
 */
import { formatDuration, formatHour } from './sunForecastState.js';
import { venueHour } from './venueTime.js';

const MINUTE = 60 * 1000;

const time = (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.getTime() : null);

function localTime(instant, timeZone) {
    return formatHour(venueHour(instant, timeZone));
}

/**
 * @param {object} input
 * @param {object|null} input.daily outdoorSunDay() result for the venue's today
 * @param {object|null} [input.forecast] deriveSunForecast() result (sky right now only)
 * @param {Date} [input.now]
 * @param {string} [input.timeZone]
 * @returns {null | {
 *   state: 'no-sun' | 'before-sunrise' | 'after-sunset' | 'sun-now' | 'shaded-now' | 'shaded-rest',
 *   totalMinutes: number, remainingMinutes: number, kind: string, statText: string, sentence: string,
 * }} null without a usable day (the caller keeps the forecast text)
 */
export function outdoorSunSummary({ daily, forecast = null, now = new Date(), timeZone = 'Australia/Melbourne' } = {}) {
    const nowMs = time(now);
    if (!daily || !Array.isArray(daily.windows) || nowMs == null) return null;
    const windows = daily.windows
        .map((w) => [time(w?.start), time(w?.end)])
        .filter(([a, b]) => a != null && b != null && b > a)
        .sort((x, y) => x[0] - y[0]);

    const windowTotal = windows.reduce((sum, [a, b]) => sum + (b - a) / MINUTE, 0);
    const totalMinutes = Math.max(0, Math.round(Number.isFinite(daily.totalMinutes) ? daily.totalMinutes : windowTotal));
    const left = windows.reduce((sum, [a, b]) => sum + Math.max(0, b - Math.max(a, nowMs)) / MINUTE, 0);
    const remainingMinutes = Math.min(totalMinutes, Math.max(0, Math.round(left)));

    const total = formatDuration(totalMinutes);
    const pair = `${formatDuration(remainingMinutes)} of today's ${total}`;
    const sunrise = time(daily.sunrise);
    const sunset = time(daily.sunset);
    const at = (ms) => localTime(ms, timeZone);

    const result = (state, kind, statText, sentence) => ({ state, totalMinutes, remainingMinutes, kind, statText, sentence });

    if (sunset != null && nowMs >= sunset) {
        return result('after-sunset', 'night', 'Sun has set', totalMinutes > 0
            ? `The sun has set. This venue had about ${total} of direct sun today.`
            : 'The sun has set for today.');
    }
    if (totalMinutes === 0 || windows.length === 0) {
        return result('no-sun', 'shaded', 'Shaded today', 'Buildings around this venue block direct sun all day today.');
    }
    if (sunrise != null && nowMs < sunrise) {
        return result('before-sunrise', 'night', `Sun up ${at(sunrise)}`,
            `The sun's up at ${at(sunrise)}. Expect about ${total} of direct sun at this venue today.`);
    }

    const current = windows.find(([a, b]) => nowMs >= a && nowMs < b);
    if (current) {
        const sky = forecast?.now?.kind;
        if (sky === 'rain' || sky === 'cloud') {
            const lead = sky === 'rain' ? 'Rain about right now.' : 'Cloud is blocking the sun right now.';
            return result('sun-now', sky, sky === 'rain' ? 'Rain now' : 'Cloudy now',
                `${lead} ${pair} sun window at this venue is still to come.`);
        }
        return result('sun-now', 'sun', `Sun until ${at(current[1])}`,
            `Direct sun here until ${at(current[1])}. ${pair} is still to come.`);
    }

    const next = windows.find(([a]) => a > nowMs);
    if (next) {
        return result('shaded-now', 'shaded', `Sun from ${at(next[0])}`,
            `Shaded by nearby buildings right now. Sun reaches this venue from ${at(next[0])}: ${pair} is still to come.`);
    }
    return result('shaded-rest', 'shaded', 'No more sun today',
        `Shaded by nearby buildings for the rest of today. This venue had about ${total} of direct sun.`);
}
