/**
 * What the Wind & comfort panel shows, worked out away from React so it can be
 * tested: the comfort scale, the venue's wind factor in plain words, and the
 * hour-by-hour columns.
 */
import { COMFORT_ZONE_LIMITS } from '../data/windIntelligence.js';
import { compassPoint } from './comfortDisplay.js';

const SCALE_MIN = -5, SCALE_MAX = 45;
const COMFORT_LEVELS = ['cold', 'cool', 'mild', 'warm', 'hot', 'extreme'];
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const percent = degrees => Math.max(0, Math.min(100, ((degrees - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

/**
 * The feels-like scale from −5° to 45°. Segments use the same limits as
 * getComfortZone, so the marker always sits in the zone the label names.
 */
export function comfortScale(feelsLike) {
    const edges = [SCALE_MIN, ...COMFORT_ZONE_LIMITS, SCALE_MAX];
    const value = finite(feelsLike);
    return {
        segments: COMFORT_LEVELS.map((level, index) => ({ level, start: percent(edges[index]), end: percent(edges[index + 1]) })),
        position: value === null ? null : percent(value),
    };
}

export { freshMicroclimate } from '../data/windIntelligence.js';

const TYPE_WORDS = {
    rooftop: 'rooftop', floating: 'on the water', waterfront: 'waterfront', open_park: 'open ground',
    beer_garden: 'beer garden', courtyard: 'courtyard', streetside: 'street seating', indoor: 'indoors',
    cafe: 'café', hotel: 'hotel',
};

/**
 * The wind factor in plain words: what share of the open-air wind reaches the
 * venue, and where that figure came from.
 */
export function windFactorView({ factor, source, type, note = null, illustrative = false } = {}) {
    const value = finite(factor);
    if (value === null) return null;
    const headline = value > 1.05 ? 'Wind funnels through here'
        : value >= 0.67 ? 'Open to the wind'
            : value >= 0.34 ? 'Partly sheltered' : 'Sheltered spot';
    const share = value > 1.05
        ? `Wind speeds up to about ${(Math.round(value * 10) / 10).toFixed(1)}× here`
        : `About ${Math.max(5, Math.round((value * 100) / 5) * 5)}% of the open-air wind reaches here`;
    const sourceLabel = source === 'profile' ? (illustrative ? 'Illustrative wind profile for this venue' : 'From this venue’s wind profile')
        : source === 'measured' ? 'Measured from the buildings around it'
            : `Estimated from the kind of venue${TYPE_WORDS[type] ? ` (${TYPE_WORDS[type]})` : ''}`;
    return {
        headline, share, sourceLabel, note: typeof note === 'string' && note.trim() ? note.trim() : null,
        // Which of the four steps (sheltered → funnels wind) the venue sits on.
        step: value > 1.05 ? 3 : value >= 0.67 ? 2 : value >= 0.34 ? 1 : 0,
        estimated: source === 'type',
    };
}

const LEVEL_WORDS = { green: 'Calm', yellow: 'Breezy', orange: 'Windy', red: 'Very windy' };
export const WIND_LEVEL_KEYS = Object.freeze(['green', 'yellow', 'orange', 'red']);
export const windLevelWord = level => LEVEL_WORDS[level] ?? 'Wind unknown';
export const WIND_FACTOR_STEPS = Object.freeze(['Sheltered', 'Partly sheltered', 'Open', 'Funnels wind']);

/** km/h at the venue for one forecast row; the regional wind only when no exposure was worked out. */
export function rowWindKmh(row) {
    const here = finite(row?.windExposure?.effectiveWindMs);
    if (here !== null) return Math.round(here * 3.6);
    return finite(row?.wind);
}

/**
 * Columns for the hourly strip. Bars share one scale (at least 40 km/h tall)
 * so a calm day does not look windy. `current` carries the panel's headline
 * feels-like and wind, so the "Now" column never disagrees with them: the
 * forecast's slot for this hour is rounded and can be a degree out.
 */
export function hourlyWindColumns(rows, limit = 12, current = null) {
    const list = (Array.isArray(rows) ? rows : []).slice(0, limit);
    const headline = row => (row?.isCurrent === true && current ? current : null);
    const speeds = list.map(row => finite(headline(row)?.windKmh) ?? rowWindKmh(row));
    const top = Math.max(40, ...speeds.filter(speed => speed !== null));
    return list.map((row, index) => {
        const kmh = speeds[index];
        const level = LEVEL_WORDS[row?.windWarning?.level] ? row.windWarning.level : null;
        const from = compassPoint(row?.windDirection);
        const feels = finite(headline(row)?.feelsLike) ?? finite(row?.feelsLike);
        const label = row?.label ?? '–';
        return {
            key: row?.time instanceof Date ? row.time.getTime() : index,
            label, feelsLike: feels, windKmh: kmh, level,
            levelWord: windLevelWord(level),
            bar: kmh === null ? 0 : Math.max(0.08, Math.min(1, kmh / top)),
            from, isCurrent: row?.isCurrent === true, estimated: row?.source === 'estimate',
            spoken: `${label === 'Now' ? 'Now' : label}: ${feels === null ? 'feels-like unknown' : `feels like ${feels}°`}, `
                + `${kmh === null ? 'wind unknown' : `wind ${kmh} km/h${from ? ` from ${from}` : ''}`}, ${windLevelWord(level).toLowerCase()}`,
        };
    });
}

/** "Feels 8° cooler than the 20° air" — only when the gap is worth a sentence. */
export function feelsLikeGap(actual, feelsLike) {
    const air = finite(actual), feels = finite(feelsLike);
    if (air === null || feels === null) return null;
    const gap = Math.round(air - feels);
    if (Math.abs(gap) < 2) return null;
    return `Feels ${Math.abs(gap)}° ${gap > 0 ? 'cooler' : 'warmer'} than the ${Math.round(air)}° air`;
}
