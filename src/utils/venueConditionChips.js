/**
 * The picture-and-words chips under each venue in the list:
 *
 *   [sun]      Sunny · until 3pm
 *   [windsock] Light wind
 *   [deck]     Beer garden
 *
 * Sun comes from the same forecast as the card (listSunStatus). Wind is the
 * Melbourne wind with this venue's exposure applied (rooftops feel more of
 * it, courtyards less). The outdoor area is shown only when the venue data
 * says what it is; nothing is guessed.
 */
import { listSunStatus } from './venueSun.js';
import { getVenueWindExposure, measuredWindOptions } from '../data/windIntelligence.js';

function finite(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Upper limits, in km/h felt at the venue, of Calm, Light wind, Breezy and Windy. Above the last is Very windy. */
export const WIND_WORD_LIMITS = Object.freeze([6, 20, 30, 40]);
const WIND_WORDS = Object.freeze(['Calm', 'Light wind', 'Breezy', 'Windy', 'Very windy']);

/** Which of the five wind words a speed falls in: 0 (Calm) to 4 (Very windy), or null. */
export function windBand(kmh) {
    const k = finite(kmh);
    if (k == null) return null;
    const band = WIND_WORD_LIMITS.findIndex((limit) => k < limit);
    return band < 0 ? WIND_WORD_LIMITS.length : band;
}

/** Plain words for a wind speed felt at the venue (km/h). */
export function windWord(kmh) {
    const band = windBand(kmh);
    return band == null ? null : WIND_WORDS[band];
}

/**
 * The wind chip, or null without wind data.
 * @returns {{ key: 'wind', icon: string, text: string, tone: 'calm'|'breezy'|'windy' }|null}
 */
export function windChip(venue, weather, microclimate = null) {
    const ms = finite(weather?.wind?.speed);
    if (ms == null) return null;
    const gustKmh = finite(weather?.windGusts);
    const direction = weather?.windDirection ?? weather?.wind?.deg ?? null;
    // A fresh microclimate row's measured shelter replaces the venue-type estimate.
    const exposure = getVenueWindExposure(ms, venue, direction, gustKmh == null ? null : gustKmh / 3.6,
        microclimate ? measuredWindOptions(microclimate, direction) : {});
    const kmh = exposure?.effectiveWindMs == null ? null : Math.round(exposure.effectiveWindMs * 3.6);
    const word = windWord(kmh);
    if (!word) return null;
    const tone = kmh >= 30 ? 'windy' : kmh >= 20 ? 'breezy' : 'calm';
    // Words on the chip; the speed is kept for screen readers and the card.
    return { key: 'wind', icon: 'windsock', text: word, kmh, tone };
}

const has = (list, ...names) => names.some((n) => list.includes(n));

/**
 * What kind of outdoor space the venue has, from its tags, vibe and rooms.
 * @returns {{ key: 'outdoor', icon: string, text: string }|null}
 */
export function outdoorChip(venue) {
    const tags = (Array.isArray(venue?.tags) ? venue.tags : []).map((t) => String(t).toLowerCase());
    const vibe = String(venue?.vibe ?? '').toLowerCase();
    const rooms = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
    const chip = (icon, text) => ({ key: 'outdoor', icon, text });

    if (venue?.hasBalcony === true || has(tags, 'balcony')) return chip('hotel-views', 'Balcony');
    if (rooms.length) return chip('hotel-views', 'Room sun');
    if (has(tags, 'rooftop') || vibe.includes('rooftop')) return chip('rooftop-terrace', 'Rooftop');
    if (has(tags, 'river', 'beach') || /waterfront|riverside|riverfront|beachfront|foreshore|floating|beach/.test(vibe)) {
        return chip('waterfront', 'Waterfront');
    }
    if (has(tags, 'beer garden', 'garden') || vibe.includes('garden')) return chip('garden-table', 'Beer garden');
    if (has(tags, 'deck')) return chip('deck', 'Deck');
    if (vibe.includes('courtyard')) return chip('deck', 'Courtyard');
    if (vibe.includes('streetside')) return chip('garden-table', 'Street tables');
    return null;
}

/**
 * Up to three chips for a list row: sun, wind, outdoor space.
 *
 * @param {object} input
 * @param {object} input.venue
 * @param {object|null} input.forecast venueSunForecast() result
 * @param {object|null} input.weather live WeatherContext weather, or null
 * @returns {Array<{ key: string, icon: string, text: string, tone?: string }>}
 */
export function venueConditionChips({ venue, forecast, weather, microclimate = null }) {
    const chips = [];
    if (forecast) {
        const sun = listSunStatus(forecast);
        chips.push({ key: 'sun', icon: sun.icon, text: sun.text.replace(/^Sunny · until/, 'Sunny until'), tone: forecast.now?.kind === 'sun' ? 'sun' : 'muted' });
    }
    const wind = weather ? windChip(venue, weather, microclimate) : null;
    if (wind) chips.push(wind);
    const outdoor = outdoorChip(venue);
    if (outdoor) chips.push(outdoor);
    return chips;
}
