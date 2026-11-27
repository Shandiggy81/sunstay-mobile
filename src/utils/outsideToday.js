/**
 * The venue card's "outside" block: one verdict for sun and wind together,
 * and today's sun and wind drawn on a single time axis.
 *
 * It adds no new source of truth. The sky for each hour is the card's own sun
 * forecast (venueSunForecast), the shade is the venue's sun windows or scored
 * hourly curve, and the wind rows are the same ones the Wind & comfort panel
 * shows. This file only lines them up by venue-local hour, so the headline,
 * the strip and the tiles cannot disagree with the rest of the card.
 */
import { PART_SUN_FRACTION, SUN_CURVE_SLOTS } from './microclimate.js';
import { outdoorHourStates, outdoorVerdict } from './outdoorVerdict.js';
import { formatHour } from './sunForecastState.js';
import { windBand, windWord } from './venueConditionChips.js';
import { venueHour, venueTimeParts } from './venueTime.js';
import { rowWindKmh } from './windComfortView.js';
import { venueDayBounds } from './balconySunEngine.js';
import { generateHourlyForecast, getVenueWindExposure, measuredWindOptions, resolveVenueWindFactor } from '../data/windIntelligence.js';

const HOURS_IN_DAY = 24;
const WIND_LEVELS = Object.freeze(['green', 'light', 'yellow', 'orange', 'red']);
const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const clamp01 = value => Math.min(1, Math.max(0, value));

/** The verdict's wind level for a speed at the venue, on the list chip's bands. */
export function verdictWindLevel(kmh) {
    const band = windBand(kmh);
    return band == null ? null : WIND_LEVELS[band];
}

function localHour(value, timeZone) {
    const ms = value instanceof Date ? value.getTime() : finite(value);
    if (ms == null || Number.isNaN(ms)) return null;
    try { return venueHour(new Date(ms), timeZone); } catch { return null; }
}

/**
 * How much sun each venue-local hour gets on a clear day, 0 to 1.
 *
 * The scored hourly curve comes first because it is the number behind the sun
 * score: read from it, the headline's "sunny" or "part sun" matches the score
 * beside it at every hour. Without a curve, the venue's sun windows give the
 * share of each hour in direct sun. Without either, the shade is unknown.
 *
 * @param {{ windows?: Array<{start: Date|number, end: Date|number}>|null, curve?: Array<number|null>|null, timeZone?: string }} input
 * @returns {{ source: 'windows'|'curve'|null, hours: Array<number|null> }}
 */
export function shadeByHour({ windows = null, curve = null, timeZone = 'Australia/Melbourne' } = {}) {
    if (Array.isArray(curve) && curve.length === SUN_CURVE_SLOTS) {
        const hours = curve.map(value => (value == null || finite(Number(value)) == null ? null : clamp01(Number(value))));
        if (hours.some(value => value != null)) return { source: 'curve', hours };
    }
    if (Array.isArray(windows)) {
        const spans = windows
            .map(window => [localHour(window?.start, timeZone), localHour(window?.end, timeZone)])
            .filter(([start, end]) => start != null && end != null && end > start);
        // No windows at all is an answer too: the buildings block the sun all day.
        return {
            source: 'windows',
            hours: Array.from({ length: HOURS_IN_DAY }, (_, hour) => clamp01(spans.reduce(
                (sum, [start, end]) => sum + Math.max(0, Math.min(end, hour + 1) - Math.max(start, hour)), 0))),
        };
    }
    return { source: null, hours: Array(HOURS_IN_DAY).fill(null) };
}

/**
 * The wind rows that belong to one venue-local day. A forecast that starts
 * part-way through today runs on into tomorrow, and tomorrow's 9am must not
 * be drawn as this morning's.
 *
 * @param {Array<{ time?: Date }>} rows generateHourlyForecast() rows
 * @param {string} dayKey venue-local YYYY-MM-DD
 * @param {string} [timeZone]
 */
export function rowsForLocalDay(rows, dayKey, timeZone = 'Australia/Melbourne') {
    if (!Array.isArray(rows) || typeof dayKey !== 'string') return [];
    return rows.filter((row) => {
        if (!(row?.time instanceof Date) || Number.isNaN(row.time.getTime())) return false;
        try { return venueTimeParts(row.time, timeZone).date === dayKey; } catch { return false; }
    });
}

// The moment-by-moment reading for "now" beats the hour's average: a venue in
// its sun window at 3:10pm is in the sun, even if the hour as a whole is 60%.
// How strong that sun is comes from the score's own reading for now, when the
// venue has one, so "sunny" or "part sun" matches the number beside it.
function applyLiveSun(entry, sunKind, sunFraction, rainLikely = false) {
    if (sunKind === 'night') return { ...entry, isDaylight: false, skyKnown: true };
    if (sunKind === 'sun') return { ...entry, isDaylight: true, skyKnown: true, rain: false, sunFraction: Math.max(sunFraction ?? 1, PART_SUN_FRACTION), skyClearness: null };
    if (sunKind === 'shaded') return { ...entry, isDaylight: true, skyKnown: true, rain: false, sunFraction: 0, skyClearness: null };
    if (sunKind === 'cloud') return { ...entry, isDaylight: true, skyKnown: true, rain: false, sunFraction: Math.max(entry.sunFraction, PART_SUN_FRACTION), skyClearness: 0 };
    if (sunKind === 'rain') return { ...entry, isDaylight: true, skyKnown: true, rain: true, rainLikely };
    return entry;
}

/**
 * @param {object} input
 * @param {object|null} input.forecast venueSunForecast() result: the sky for each local hour, sunrise, sunset and now
 * @param {{ hours: Array<number|null> }|null} [input.shade] shadeByHour() result
 * @param {Array<object>} [input.windRows] generateHourlyForecast() rows covering the venue's local day
 * @param {{ sunKind?: string|null, rain?: 'raining'|'likely'|null, sunFraction?: number|null, windKmh?: number|null, feelsLike?: number|null, windFrom?: number|null, windSource?: string|null }|null} [input.live]
 *   what the card already shows for this moment, so "now" matches its tiles. `sunFraction` is the sun score's reading for now (0 to 1), if the venue has one.
 *   `rain` is the sky-now verdict's rain: 'likely' words a rainy now as forecast, not as falling
 * @param {number|null} [input.selectedMinutes] the app's time-of-day slider (minutes past local midnight), or null for now
 * @param {number|null} [input.nowSliderMinutes] where that slider sits for "now" (todMinutes.localTimeToSliderMinutes).
 *   The app's slider only covers 6am to 8pm, so at night "now" is pinned to one end of it.
 * @returns {null | {
 *   isNow: boolean, nowHour: number, selectedHour: number, timeLabel: string, whenLabel: string, spoken: string,
 *   shadeSource: 'windows'|'curve'|null,
 *   verdict: null | { state: string, headline: string, sunSentence: string, feelsSentence: string },
 *   range: { start: number, end: number }, marker: number,
 *   lanes: Array<{ hour: number, label: string, sun: string, windKmh: number|null, windBand: number|null, estimated: boolean }>,
 *   readout: { windWord: string|null, windKmh: number|null, feelsLike: number|null, rainChance: number|null, estimated: boolean },
 *   slots: Array<{ hour: number, label: string, words: string, good: boolean }>,
 * }} null when there is no hourly sky to draw
 */
export function outsideToday(input = {}) {
    const { forecast, shade = null, windRows = [], live = null, selectedMinutes = null, nowSliderMinutes = null } = input ?? {};
    const sky = Array.isArray(forecast?.hours) && forecast.hours.length === HOURS_IN_DAY ? forecast.hours : null;
    const nowDecimal = finite(forecast?.nowHour);
    if (!sky || nowDecimal == null || !forecast.hasHourly) return null;

    const nowHour = Math.min(HOURS_IN_DAY - 1, Math.max(0, Math.floor(nowDecimal)));
    const hourOf = minutes => Math.floor((((Math.round(minutes) % 1440) + 1440) % 1440) / 60);
    const picked = finite(selectedMinutes);
    const pinned = finite(nowSliderMinutes);
    // "Now" is no selection, the current hour, or the slider resting where it shows now.
    const isNow = picked == null || hourOf(picked) === nowHour || (pinned != null && hourOf(picked) === hourOf(pinned));
    const selectedHour = isNow ? nowHour : hourOf(picked);

    const rowByHour = new Map();
    for (const row of Array.isArray(windRows) ? windRows : []) {
        if (Number.isInteger(row?.hour) && !rowByHour.has(row.hour)) rowByHour.set(row.hour, row);
    }
    const liveSource = live?.windSource ?? null;

    const sunrise = finite(forecast.sunriseHour);
    const sunset = finite(forecast.sunsetHour);
    const hasSunTimes = sunrise != null && sunset != null && sunrise < sunset;
    // An hour is daylight when most of it is, so "full sun until 8pm" never
    // runs an hour past an 8:05pm sunset.
    const daylightAt = (hour, slot) => (hasSunTimes ? hour + 0.5 >= sunrise && hour + 0.5 < sunset : slot?.kind !== 'night');

    const base = sky.map((slot, hour) => {
        const row = rowByHour.get(hour) ?? null;
        const windKmh = row ? finite(rowWindKmh(row)) : null;
        return {
            hour,
            isDaylight: daylightAt(hour, slot),
            // 'day' is daylight with no forecast for the hour: the sky is not known.
            skyKnown: slot?.kind !== 'day',
            rain: slot?.kind === 'rain',
            sunFraction: finite(shade?.hours?.[hour]) ?? 1,
            skyClearness: slot?.kind === 'cloud' ? 0 : null,
            windKmh,
            windLevel: verdictWindLevel(windKmh),
            feelsLike: finite(row?.feelsLike),
            windFrom: finite(row?.windDirection),
            rainChance: finite(slot?.rainChance),
            // Not this venue's own shelter figure, or no forecast for the hour.
            estimated: Boolean(row) && (row.source === 'estimate'
                || (liveSource != null && liveSource !== 'type' && row.windExposure?.source === 'type')),
        };
    });

    // "Now" uses what the card already shows for this moment.
    const withLive = base.map((entry) => {
        if (entry.hour !== nowHour || !live) return entry;
        const windKmh = finite(live.windKmh) ?? entry.windKmh;
        return applyLiveSun({
            ...entry,
            windKmh,
            windLevel: verdictWindLevel(windKmh),
            feelsLike: finite(live.feelsLike) ?? entry.feelsLike,
            windFrom: live.windFrom === undefined ? entry.windFrom : finite(live.windFrom),
            estimated: false,
        }, live.sunKind ?? null, finite(live.sunFraction) == null ? null : clamp01(live.sunFraction), live.rain === 'likely');
    });

    // The strip draws each hour's sun even where the wind is missing.
    const sunStates = outdoorHourStates(base.map(entry => ({ ...entry, windKmh: 0, feelsLike: 0, windLevel: 'green', windFrom: null })));
    const liveStates = outdoorHourStates(withLive);

    // One night hour either side of the daylight, widened to hold now and the chosen hour.
    const lit = base.filter(entry => entry.isDaylight).map(entry => entry.hour);
    const firstLight = lit.length ? lit[0] : 6;
    const lastLight = lit.length ? lit[lit.length - 1] : 20;
    const start = Math.min(nowHour, selectedHour, Math.max(0, firstLight - 1));
    const end = Math.max(nowHour, selectedHour, Math.min(HOURS_IN_DAY - 1, lastLight + 1));

    const lanes = [];
    for (let hour = start; hour <= end; hour += 1) {
        const entry = base[hour];
        lanes.push({
            hour,
            label: formatHour(hour),
            sun: entry.isDaylight && !entry.skyKnown ? 'unknown' : sunStates[hour] ?? 'unknown',
            windKmh: entry.windKmh == null ? null : Math.round(entry.windKmh),
            windBand: windBand(entry.windKmh),
            estimated: entry.estimated,
        });
    }

    const at = withLive[selectedHour];
    const result = at.isDaylight && !at.skyKnown ? null : outdoorVerdict({ hours: withLive, index: selectedHour });
    const fromNow = outdoorVerdict({ hours: withLive, index: nowHour });
    const slots = (fromNow?.slots ?? [])
        .filter(slot => liveStates[slot.hour] !== 'dark' && liveStates[slot.hour] !== 'dawn' && withLive[slot.hour].skyKnown)
        .map(slot => ({ ...slot, label: slot.hour === nowHour ? 'Now' : slot.label }));
    const timeLabel = formatHour(selectedHour);

    return {
        isNow,
        nowHour,
        selectedHour,
        timeLabel,
        whenLabel: isNow ? 'Right now' : `At ${timeLabel}`,
        // null: the venue's surroundings are not mapped, so the sun lane is the sky alone.
        shadeSource: shade?.source ?? null,
        spoken: result ? `${isNow ? 'Now' : timeLabel}: ${result.verdict}` : (isNow ? 'Now' : timeLabel),
        verdict: result
            ? { state: result.state, headline: result.verdict, sunSentence: result.sunSentence, feelsSentence: result.feelsSentence }
            : null,
        range: { start, end },
        marker: (selectedHour - start + 0.5) / (end - start + 1),
        lanes,
        readout: {
            windWord: windWord(at.windKmh),
            windKmh: at.windKmh == null ? null : Math.round(at.windKmh),
            feelsLike: at.feelsLike == null ? null : Math.round(at.feelsLike),
            rainChance: at.rainChance == null ? null : Math.round(at.rainChance),
            estimated: at.estimated,
        },
        slots,
    };
}

/**
 * The wind at one venue for every hour of its local day, with the factor and
 * exposure for this moment: the same rows the Wind & comfort panel builds,
 * started at local midnight. The card and the list rows both read this.
 *
 * @param {{ weather: object|null, venue: object, microclimate?: object|null, dayKey: string|null, timeZone?: string }} input
 *   `weather` is WeatherContext's live weather; `dayKey` the venue-local YYYY-MM-DD
 * @returns {null | { rows: object[], direction: number|null, openAirKmh: number, factor: object, exposure: object }}
 */
export function venueDayWind({ weather, venue, microclimate = null, dayKey, timeZone = 'Australia/Melbourne' } = {}) {
    if (!weather?.hourly || !dayKey) return null;
    const temp = finite(weather.main?.temp);
    if (temp == null) return null;
    const windMs = finite(weather.wind?.speed) ?? 0;
    const direction = finite(weather.windDirection ?? weather.wind?.deg);
    const gustKmh = finite(weather.windGusts);
    const gustMs = gustKmh == null ? null : gustKmh / 3.6;
    const measured = measuredWindOptions(microclimate, direction);
    let dayStart;
    try { dayStart = venueDayBounds(dayKey, timeZone).start; } catch { return null; }
    const rows = generateHourlyForecast(temp, windMs, finite(weather.main?.humidity), venue, direction, gustMs,
        { hourly: weather.hourly, utcOffsetSeconds: weather.utcOffsetSeconds, now: dayStart, ...measured });
    return {
        // Only today's hours: a forecast that starts mid-day runs on into tomorrow.
        rows: rowsForLocalDay(rows, dayKey, timeZone),
        direction,
        openAirKmh: Math.round(windMs * 3.6),
        factor: resolveVenueWindFactor(venue, { direction, ...measured }),
        exposure: getVenueWindExposure(windMs, venue, direction, gustMs, measured),
    };
}

const MINI_SUN = Object.freeze({ sun: '#f59e0b', part: '#fde68a', shade: '#e2e8f0', cloud: '#cbd5e1', rain: '#64748b', dawn: '#334155', dark: '#334155', unknown: '#f1f5f9' });
const MINI_WIND = Object.freeze(['#e2e8f0', '#cbd5e1', '#94a3b8', '#475569', '#0f172a']);

function bands(colors) {
    const step = 100 / colors.length;
    const stops = colors.map((color, i) => `${color} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`);
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * A list row's miniature of the card's strip: the day's sun over its wind, as
 * two CSS backgrounds, with where the chosen hour sits (0 to 1).
 *
 * @param {ReturnType<typeof outsideToday>} model
 * @returns {null | { sun: string, wind: string|null, marker: number }}
 */
export function miniStrip(model) {
    const lanes = model?.lanes;
    if (!Array.isArray(lanes) || lanes.length === 0) return null;
    const hasWind = lanes.some(lane => lane.windBand != null);
    return {
        sun: bands(lanes.map(lane => MINI_SUN[lane.sun] ?? MINI_SUN.unknown)),
        wind: hasWind ? bands(lanes.map(lane => (lane.windBand == null ? '#f1f5f9' : MINI_WIND[lane.windBand]))) : null,
        marker: model.marker,
    };
}
