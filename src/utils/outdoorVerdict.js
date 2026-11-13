import { describeSun } from './microclimate.js';
import { directionName } from './roomProfiles.js';
import { formatHour } from './sunForecastState.js';

const SUN_STATES = { 'Full sun': 'sun', 'Partial sun': 'part', 'Mostly shaded': 'shade', 'In shade': 'shade' };
const SUN_WORDS = { sun: 'Sunny', part: 'Part sun', shade: 'In shade', dark: 'After dark' };
const WIND_WORDS = { green: 'Calm', yellow: 'Breezy', orange: 'Windy', red: 'Very windy' };
const VERDICTS = {
    sun: {
        green: 'Sunny and calm', yellow: 'Sunny, a bit breezy',
        orange: 'Sunny but windy', red: 'Sunny but windy',
    },
    part: {
        green: 'Part sun and calm', yellow: 'Part sun, a bit breezy',
        orange: 'Part sun and windy', red: 'Part sun and windy',
    },
    shade: {
        green: 'In shade, calm', yellow: 'In shade and breezy',
        orange: 'In shade and windy', red: 'In shade and windy',
    },
    dark: {
        green: 'After dark, calm', yellow: 'After dark, breezy',
        orange: 'After dark, windy', red: 'After dark, very windy',
    },
};

function validEntry(entry) {
    return entry != null
        && [entry.hour, entry.sunFraction, entry.windKmh, entry.feelsLike].every(Number.isFinite)
        && Number.isInteger(entry.hour) && entry.hour >= 0 && entry.hour <= 23
        && entry.sunFraction >= 0 && entry.sunFraction <= 1
        && entry.windKmh >= 0
        && (entry.windFrom === null || Number.isFinite(entry.windFrom))
        && typeof entry.isDaylight === 'boolean'
        && Object.hasOwn(WIND_WORDS, entry.windLevel);
}

function stateOf(entry) {
    return entry.isDaylight ? SUN_STATES[describeSun(entry.sunFraction)] : 'dark';
}

function sunSentence(state, nextChange, upcoming) {
    if (state === 'dark') return 'The sun is down.';
    if (state === 'shade') {
        const nextSun = upcoming.find(entry => entry.state === 'sun' || entry.state === 'part');
        return nextSun ? `Sun from ${formatHour(nextSun.hour)}.` : 'No more sun here today.';
    }
    if (state === 'part' && nextChange?.state === 'sun') {
        return `Full sun from ${formatHour(nextChange.hour)}.`;
    }
    const words = state === 'sun' ? 'Full sun' : 'Part sun';
    return nextChange
        ? `${words} until ${formatHour(nextChange.hour)}.`
        : `${words} for the rest of the day.`;
}

/**
 * Combine venue-local hourly sun and wind readings into card copy and up to
 * six slots. Sun bands come from microclimate.describeSun (0.75 / 0.4).
 * Lookahead ends at a missing/invalid reading or the next local day.
 * @param {{ hours: Array<{ hour: number, sunFraction: number, windLevel: 'green'|'yellow'|'orange'|'red', windKmh: number, feelsLike: number, windFrom: number|null, isDaylight: boolean }>, index: number }} input
 * @returns {{ state: 'sun'|'part'|'shade'|'dark', verdict: string, detail: string, changeHour: number|null, slots: Array<{ hour: number, label: string, words: string, good: boolean }> }|null}
 */
export function outdoorVerdict(input = {}) {
    const { hours, index } = input ?? {};
    if (!Array.isArray(hours) || !Number.isInteger(index) || index < 0 || !validEntry(hours[index])) return null;

    const entry = hours[index];
    const state = stateOf(entry);
    const remaining = [];
    // Keep unknown readings and tomorrow's sun out of today's promises.
    for (let i = index; i < hours.length; i += 1) {
        const current = hours[i];
        if (!validEntry(current) || (i > index && current.hour <= hours[i - 1].hour)) break;
        remaining.push({ ...current, state: stateOf(current) });
    }

    const upcoming = remaining.slice(1);
    const nextChange = upcoming.find(current => current.state !== state);
    const wind = entry.windFrom === null ? 'of wind' : `from the ${directionName(entry.windFrom).toLowerCase()}`;
    const feelsLike = `Feels ${Math.round(entry.feelsLike)}\u00b0 with ${Math.round(entry.windKmh)} km/h ${wind}.`;

    return {
        state,
        verdict: VERDICTS[state][entry.windLevel],
        detail: `${sunSentence(state, nextChange, upcoming)} ${feelsLike}`,
        changeHour: nextChange?.hour ?? null,
        slots: remaining.slice(0, 6).map(current => ({
            hour: current.hour,
            label: formatHour(current.hour),
            words: `${SUN_WORDS[current.state]} \u00b7 ${WIND_WORDS[current.windLevel]}`,
            good: current.state === 'sun' && (current.windLevel === 'green' || current.windLevel === 'yellow'),
        })),
    };
}
