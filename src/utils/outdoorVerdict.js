import { FULL_SUN_FRACTION, PART_SUN_FRACTION } from './microclimate.js';
import { directionName } from './roomProfiles.js';
import { SUNNY_CLEARNESS } from './skyClearness.js';
import { formatHour } from './sunForecastState.js';

const SUN_WORDS = { sun: 'Sunny', part: 'Part sun', shade: 'In shade', cloud: 'Cloudy', rain: 'Rain', dawn: 'Before sunrise', dark: 'After dark' };
// 'light' sits between green and yellow: the list's "Light wind" band (venueConditionChips.windWord).
const WIND_WORDS = { green: 'Calm', light: 'Light wind', yellow: 'Breezy', orange: 'Windy', red: 'Very windy' };
const VERDICTS = {
    sun: {
        green: 'Sunny and calm', light: 'Sunny with a light wind', yellow: 'Sunny, a bit breezy',
        orange: 'Sunny but windy', red: 'Sunny but windy',
    },
    part: {
        green: 'Part sun and calm', light: 'Part sun with a light wind', yellow: 'Part sun, a bit breezy',
        orange: 'Part sun and windy', red: 'Part sun and windy',
    },
    shade: {
        green: 'In shade, calm', light: 'In shade with a light wind', yellow: 'In shade and breezy',
        orange: 'In shade and windy', red: 'In shade and windy',
    },
    cloud: {
        green: 'Cloudy and calm', light: 'Cloudy with a light wind', yellow: 'Cloudy, a bit breezy',
        orange: 'Cloudy and windy', red: 'Cloudy and windy',
    },
    rain: {
        green: 'Rain, but calm', light: 'Rain with a light wind', yellow: 'Rain and a breeze',
        orange: 'Wet and windy', red: 'Wet and windy',
    },
    dawn: {
        green: 'Before sunrise, calm', light: 'Before sunrise, light wind', yellow: 'Before sunrise, breezy',
        orange: 'Before sunrise, windy', red: 'Before sunrise, very windy',
    },
    dark: {
        green: 'After dark, calm', light: 'After dark, light wind', yellow: 'After dark, breezy',
        orange: 'After dark, windy', red: 'After dark, very windy',
    },
};
// Sunny and not windy: the hours worth pointing a guest to.
const GOOD_WIND = new Set(['green', 'light', 'yellow']);

function validEntry(entry) {
    return entry != null
        && [entry.hour, entry.sunFraction, entry.windKmh, entry.feelsLike].every(Number.isFinite)
        && Number.isInteger(entry.hour) && entry.hour >= 0 && entry.hour <= 23
        && entry.sunFraction >= 0 && entry.sunFraction <= 1
        && (entry.skyClearness == null || (Number.isFinite(entry.skyClearness) && entry.skyClearness >= 0 && entry.skyClearness <= 1))
        && (entry.rain == null || typeof entry.rain === 'boolean')
        && entry.windKmh >= 0
        && (entry.windFrom === null || Number.isFinite(entry.windFrom))
        && typeof entry.isDaylight === 'boolean'
        && Object.hasOwn(WIND_WORDS, entry.windLevel);
}

function stateOf(entry, daylightAhead) {
    if (!entry.isDaylight) return daylightAhead ? 'dawn' : 'dark';
    // Rain wins over shade and cloud: it is what a guest would notice first.
    if (entry.rain === true) return 'rain';
    if (entry.sunFraction < PART_SUN_FRACTION) return 'shade';
    if (entry.skyClearness != null && entry.skyClearness < SUNNY_CLEARNESS) return 'cloud';
    return entry.sunFraction >= FULL_SUN_FRACTION ? 'sun' : 'part';
}

function sunSentence(state, nextChange, upcoming) {
    if (state === 'dark') return 'The sun is down.';
    if (state === 'shade' || state === 'cloud' || state === 'rain' || state === 'dawn') {
        const nextSun = upcoming.find(entry => entry.state === 'sun' || entry.state === 'part');
        if (nextSun) return `Sun from ${formatHour(nextSun.hour)}.`;
        if (state === 'dawn') {
            const daylight = upcoming.find(entry => entry.isDaylight);
            return `Daylight from ${formatHour(daylight.hour)}.`;
        }
        return state === 'shade' ? 'No more sun here today.' : 'No direct sun expected here today.';
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
 * The sun state of every hour, in the same words the verdict uses, for a strip
 * that draws the whole day. Null where a reading is missing or invalid. Night
 * hours are 'dawn' while daylight is still ahead in the same local day.
 * @param {Array<object>} hours same entries as outdoorVerdict's `hours`
 * @returns {Array<'sun'|'part'|'shade'|'cloud'|'rain'|'dawn'|'dark'|null>}
 */
export function outdoorHourStates(hours) {
    if (!Array.isArray(hours)) return [];
    const states = hours.map(() => null);
    let daylightAhead = false;
    for (let i = hours.length - 1; i >= 0; i -= 1) {
        const current = hours[i];
        if (!validEntry(current)) { daylightAhead = false; continue; }
        const next = hours[i + 1];
        // A gap or the next local day ends the run that daylight can be "ahead" in.
        if (i < hours.length - 1 && (!validEntry(next) || next.hour <= current.hour)) daylightAhead = false;
        states[i] = stateOf(current, daylightAhead);
        daylightAhead = daylightAhead || current.isDaylight;
    }
    return states;
}

/**
 * Combine venue-local hourly sun and wind readings into card copy and up to
 * six slots. Sun bands use the shared microclimate fraction thresholds.
 * The caller must pass every remaining hour of the venue's day through to
 * nightfall, because "for the rest of the day" is decided from this array.
 * Lookahead ends at a missing/invalid reading or the next local day.
 * `rain: true` on a daylight hour reads as rain whatever the shade or cloud.
 * `detail` is `sunSentence` and `feelsSentence` joined, for callers that have
 * a more precise sun sentence of their own.
 * @param {{ hours: Array<{ hour: number, sunFraction: number, skyClearness?: number|null, rain?: boolean|null, windLevel: 'green'|'light'|'yellow'|'orange'|'red', windKmh: number, feelsLike: number, windFrom: number|null, isDaylight: boolean }>, index: number }} input
 * @returns {{ state: 'sun'|'part'|'shade'|'cloud'|'rain'|'dawn'|'dark', verdict: string, detail: string, sunSentence: string, feelsSentence: string, changeHour: number|null, slots: Array<{ hour: number, label: string, words: string, good: boolean }> }|null}
 */
export function outdoorVerdict(input = {}) {
    const { hours, index } = input ?? {};
    if (!Array.isArray(hours) || !Number.isInteger(index) || index < 0 || !validEntry(hours[index])) return null;

    const remaining = [];
    // Keep unknown readings and tomorrow's sun out of today's promises.
    for (let i = index; i < hours.length; i += 1) {
        const current = hours[i];
        if (!validEntry(current) || (i > index && current.hour <= hours[i - 1].hour)) break;
        remaining.push({ ...current });
    }

    // Work backwards so each night slot knows whether daylight is still ahead.
    let daylightAhead = false;
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
        const current = remaining[i];
        current.state = stateOf(current, daylightAhead);
        daylightAhead = daylightAhead || current.isDaylight;
    }

    const entry = remaining[0];
    const { state } = entry;
    const upcoming = remaining.slice(1);
    const nextChange = upcoming.find(current => current.state !== state);
    const wind = entry.windFrom === null ? 'of wind' : `from the ${directionName(entry.windFrom).toLowerCase()}`;
    const speed = Math.round(entry.windKmh);
    const feelsSentence = speed === 0
        ? `Feels ${Math.round(entry.feelsLike)}° in still air.`
        : `Feels ${Math.round(entry.feelsLike)}° with ${speed} km/h ${wind}.`;
    const sun = sunSentence(state, nextChange, upcoming);

    return {
        state,
        verdict: VERDICTS[state][entry.windLevel],
        detail: `${sun} ${feelsSentence}`,
        sunSentence: sun,
        feelsSentence,
        changeHour: nextChange?.hour ?? null,
        slots: remaining.slice(0, 6).map(current => ({
            hour: current.hour,
            label: formatHour(current.hour),
            words: `${SUN_WORDS[current.state]} · ${WIND_WORDS[current.windLevel]}`,
            good: current.state === 'sun' && GOOD_WIND.has(current.windLevel),
        })),
    };
}
