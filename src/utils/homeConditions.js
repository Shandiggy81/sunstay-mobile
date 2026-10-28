import { finiteOrNull } from './finiteOrNull.js';
import { normaliseTag } from './venueOfferings.js';
import { warmthForVenue } from './tonightFeel.js';

/**
 * What the weather is doing right now, for the home sheet. A grey, wet, cold
 * or windy day should lead with somewhere comfortable, not "0 in full sun".
 *
 * Reads the normalised Open-Meteo object from weatherService (current
 * precipitation in mm, precipProbability for this hour, apparentTemp in °C,
 * windKmh and windGusts in km/h). Demo, unavailable or errored weather gives
 * null, so nothing is claimed without a real forecast.
 */
export const WET_PRECIP_MM = 0.1;
export const WET_PROBABILITY = 60;
export const COLD_FEELS_LIKE = 10;
export const WINDY_KMH = 30;
export const WINDY_GUSTS_KMH = 50;
export const GREY_CLOUD_PCT = 85;

const WET_MAINS = new Set(['Rain', 'Drizzle', 'Thunderstorm']);

/** @returns {'wet'|'cold'|'windy'|'grey'|'fair'|null} */
export function homeConditions(weather) {
    if (!weather || weather.source === 'demo' || weather.unavailable || weather.error) return null;
    const precipitation = finiteOrNull(weather.precipitation);
    const probability = finiteOrNull(weather.precipProbability);
    const feels = finiteOrNull(weather.apparentTemp ?? weather.main?.feels_like);
    const wind = finiteOrNull(weather.windKmh);
    const gusts = finiteOrNull(weather.windGusts);
    const main = weather.weather?.[0]?.main;
    if (precipitation == null && probability == null && feels == null && wind == null && !main) return null;

    if ((precipitation ?? 0) >= WET_PRECIP_MM || (probability ?? 0) >= WET_PROBABILITY || WET_MAINS.has(main)) return 'wet';
    if (feels != null && feels <= COLD_FEELS_LIKE) return 'cold';
    if ((wind ?? 0) >= WINDY_KMH || (gusts ?? 0) >= WINDY_GUSTS_KMH) return 'windy';
    // A dull daytime sky: "0 in full sun" is true but reads like bad news.
    // The overcast code is the one the weather pill shows (already adjusted for
    // how much sunlight gets through), so the headline agrees with the pill.
    const cloud = finiteOrNull(weather.cloudCoverPct ?? weather.clouds?.all);
    const overcast = weather.weather?.[0]?.description === 'overcast';
    if (weather.isDay !== false && (overcast || (cloud ?? 0) >= GREY_CLOUD_PCT || main === 'Fog')) return 'grey';
    return 'fair';
}

const SHELTER_TAGS = new Set(['covered', 'undercover', 'indoor', 'indoors', 'cozy', 'cosy', 'enclosed']);

/**
 * The venue's own declared comfort facts. Never a live status and never
 * guessed: most venues have an indoor area, but only declared facts count.
 */
export function venueComfort(venue) {
    const warmth = warmthForVenue(venue).map(item => item.icon);
    const heating = normaliseTag(venue?.heating);
    const tags = (Array.isArray(venue?.tags) ? venue.tags : []).map(normaliseTag);
    const indoorWarm = warmth.includes('fireplace') || warmth.includes('indoor-warmth')
        || venue?.hasFireplace === true || heating === 'indoor only';
    const outdoorHeat = warmth.includes('heater');
    const sheltered = indoorWarm || venue?.hasCozy === true
        || tags.some(tag => SHELTER_TAGS.has(tag))
        || (finiteOrNull(venue?.shielding?.rainCover) ?? 0) > 80;
    const windbreak = sheltered || (finiteOrNull(venue?.shielding?.windbreak) ?? 0) > 70;
    return { indoorWarm, outdoorHeat, sheltered, windbreak };
}

/**
 * Comfort tier for a condition; higher sorts first. 'fair' (and null) gives
 * every venue 0, so the sun order is untouched on a fine day.
 * - wet:   warm indoors 2, sheltered 1. Outdoor heaters alone don't keep you dry.
 * - cold:  warm indoors 2, outdoor heaters 1.
 * - windy: sheltered or behind a windbreak 1.
 */
export function comfortTier(venue, kind) {
    if (kind !== 'wet' && kind !== 'cold' && kind !== 'windy') return 0;
    const c = venueComfort(venue);
    if (kind === 'wet') return c.indoorWarm ? 2 : c.sheltered ? 1 : 0;
    if (kind === 'cold') return c.indoorWarm ? 2 : c.outdoorHeat ? 1 : 0;
    return c.windbreak ? 1 : 0;
}

/**
 * Stable re-rank: comfort tier first, the incoming (sun) order within a tier.
 * Returns the same array when nothing would change.
 */
export function rankForConditions(venues, kind) {
    if (!Array.isArray(venues) || venues.length < 2 || !['wet', 'cold', 'windy'].includes(kind)) return venues;
    const tiers = venues.map((venue, index) => ({ venue, index, tier: comfortTier(venue, kind) }));
    if (tiers.every(entry => entry.tier === 0)) return venues;
    return tiers.sort((a, b) => b.tier - a.tier || a.index - b.index).map(entry => entry.venue);
}

/**
 * The clause after the venue count on the home sheet, or null to keep the
 * existing sun clause. Counts only venues with declared comfort facts.
 */
export function conditionsClause(venues, kind) {
    if (!['wet', 'cold', 'windy', 'grey'].includes(kind)) return null;
    // A grey day keeps the sun order but counts the same cosy venues as a wet one.
    const countKind = kind === 'grey' ? 'wet' : kind;
    const n = (Array.isArray(venues) ? venues : []).filter(venue => comfortTier(venue, countKind) > 0).length;
    // "Rain about" is true whether it is falling now or likely this hour.
    const lead = { wet: 'rain about', cold: 'chilly out', windy: 'windy', grey: 'overcast' }[kind];
    if (n === 0) return lead;
    const what = { wet: 'cosy and dry', cold: 'with heating', windy: 'sheltered', grey: 'cosy' }[kind];
    return `${lead} · ${n.toLocaleString('en-AU')} ${what}`;
}

const SORT_LABELS = { wet: 'Cosy and dry first', cold: 'Warmest first', windy: 'Sheltered first' };

/** The list's sort chip when comfort leads the order, or null for "Sunniest first". */
export function comfortSortLabel(venues, kind) {
    if (!SORT_LABELS[kind]) return null;
    return (Array.isArray(venues) ? venues : []).some(venue => comfortTier(venue, kind) > 0) ? SORT_LABELS[kind] : null;
}
