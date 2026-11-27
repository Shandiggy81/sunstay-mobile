/**
 * The outdoor venue card's sun text when it shows "Sun moments today".
 *
 * That panel's total is the venue's direct-sun window after the buildings
 * around it (outdoorSunDay). The stat row and the sentence above it used to
 * read the open-sky weather forecast instead (deriveSunForecast: every sunny
 * forecast hour from now to sunset, no buildings), so the same card could say
 * "6h 37m of direct sun left today" next to "1h 28m of sun at this venue
 * today". Here "left" is cut from the same windows as the total, so it can
 * never exceed it.
 *
 * The windows are a clear-sky estimate. When rain or cloud blocks the sun
 * right now, the sentence says so (skyNow.js) and says how much of the rest
 * of the window the forecast gives sun, not the clear-sky amount; rain wins
 * over the buildings' shade. A day the forecast cuts short is never told as
 * "had about 13h of direct sun".
 */
import { formatDuration, formatHour } from './sunForecastState.js';
import { venueHour } from './venueTime.js';
import { skyLeadSentence, skyNow } from './skyNow.js';
import { forecastSunMinutes } from './sunWindowsCard.js';

const MINUTE = 60 * 1000;

const time = (value) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.getTime() : null);

function localTime(instant, timeZone) {
    return formatHour(venueHour(instant, timeZone));
}

/**
 * @param {object} input
 * @param {object|null} input.daily outdoorSunDay() result for the venue's today
 * @param {object|null} [input.forecast] deriveSunForecast() result: the sky now, and how much of the windows it gives sun
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

    // The forecast's share of the clear-sky windows (null without an hourly forecast).
    const spans = windows.map(([a, b]) => ({ start: a, end: b }));
    const forecastToday = forecastSunMinutes({ windows: spans, forecast, timeZone });
    const forecastLeft = forecastSunMinutes({ windows: spans, forecast, timeZone, from: nowMs });
    const cutShort = forecastToday != null && Math.round(forecastToday) < totalMinutes - 1;
    // "About 3h of direct sun was forecast here today", or null when none was.
    const forecastDay = (tense) => (Math.round(forecastToday ?? 0) > 0
        ? `About ${formatDuration(forecastToday)} of direct sun ${tense} forecast here today.` : null);

    if (sunset != null && nowMs >= sunset) {
        let sentence = 'The sun has set for today.';
        if (totalMinutes > 0 && !cutShort) sentence = `The sun has set. This venue had about ${total} of direct sun today.`;
        else if (totalMinutes > 0 && forecastDay('was')) sentence = `The sun has set. ${forecastDay('was')}`;
        return result('after-sunset', 'night', 'Sun has set', sentence);
    }
    if (totalMinutes === 0 || windows.length === 0) {
        return result('no-sun', 'shaded', 'Shaded today', 'Buildings around this venue block direct sun all day today.');
    }
    if (sunrise != null && nowMs < sunrise) {
        return result('before-sunrise', 'night', `Sun up ${at(sunrise)}`, !cutShort
            ? `The sun's up at ${at(sunrise)}. Expect about ${total} of direct sun at this venue today.`
            : `The sun's up at ${at(sunrise)}. ${forecastDay('is') ?? 'No direct sun is forecast here today.'}`);
    }

    const current = windows.find(([a, b]) => nowMs >= a && nowMs < b);
    const next = windows.find(([a]) => a > nowMs);
    const sky = skyNow(forecast);
    // Rain is what a guest notices first, so it leads in or out of the buildings' shade;
    // cloud only matters while the venue would otherwise be in the sun.
    const lead = sky?.kind === 'rain' || (current && sky?.kind === 'cloud') ? skyLeadSentence(sky) : null;
    if (lead) {
        const statText = sky.kind === 'cloud' ? 'Cloudy now' : sky.rain === 'raining' ? 'Raining' : 'Rain likely';
        if (!current && !next) {
            return result('shaded-rest', sky.kind, statText, `${lead} Buildings shade this venue for the rest of today.`);
        }
        const later = forecastLeft == null
            ? `${pair} clear-sky sun at this venue is still to come.`
            : Math.round(forecastLeft) > 0
                ? `About ${formatDuration(forecastLeft)} of sun is forecast here later today.`
                : 'No direct sun is forecast here for the rest of today.';
        return result(current ? 'sun-now' : 'shaded-now', sky.kind, statText, `${lead} ${later}`);
    }
    if (current) {
        return result('sun-now', 'sun', `Sun until ${at(current[1])}`,
            `Direct sun here until ${at(current[1])}. ${pair} is still to come.`);
    }
    if (next) {
        return result('shaded-now', 'shaded', `Sun from ${at(next[0])}`,
            `Shaded by nearby buildings right now. Sun reaches this venue from ${at(next[0])}: ${pair} is still to come.`);
    }
    return result('shaded-rest', 'shaded', 'No more sun today', !cutShort
        ? `Shaded by nearby buildings for the rest of today. This venue had about ${total} of direct sun.`
        : ['Shaded by nearby buildings for the rest of today.', forecastDay('was')].filter(Boolean).join(' '));
}
