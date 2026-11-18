/**
 * Sunny's answer to "Where can we sit by a fire?", "heated outdoor seating in
 * St Kilda" and "somewhere with a fireplace that's dog friendly". The answer
 * is built here from the venue rows, not by the model, so Sunny only names a
 * venue whose recorded data shows every feature asked for, and otherwise says
 * which feature it couldn't confirm.
 *
 * Each feature is its own requirement: the place named (placeVenuesInText), a
 * fireplace, outdoor heaters, and the key amenities and bar type that
 * venueAmenities reads. A fireplace is inside, so it never stands in for
 * heated outdoor seating. Warmth is what a venue has (warmthForVenue, plus
 * `hasFireplace` like the list's comfort reasons), never whether the fire is
 * lit or the heaters are on now. The guest's "it's raining" is their words,
 * not a weather reading, so the answer leaves the weather out.
 */
import { amenityWants, isBarVenue, keyAmenities } from './venueAmenities.js';
import { placeVenuesInText } from './locationSearch.js';
import { normaliseTag } from './venueOfferings.js';
import { warmthForVenue } from './tonightFeel.js';
import { MAX_SUGGESTIONS } from './sunnySuggestions.js';

// A fire pit is outdoors and no venue records one, so it isn't a fireplace ask.
const FIRE_PIT = /\bfire ?pits?\b/g;
const WANTS_FIREPLACE = /\b(fires?|fireplaces?|fireside|hearth)\b/;
const WANTS_HEATERS = /\b(heaters?|heat lamps?|outdoor heat(ing|ed)?|heated (outdoor|outside|courtyard|terrace|deck|balcony|beer garden|garden|rooftop|patio))\b/;

// Requirement order in the answer, with how it reads for one venue and many.
const FEATURES = Object.freeze({
    fireplace: { one: 'lists a fireplace', many: 'list a fireplace' },
    heaters: { one: 'lists heated outdoor seating', many: 'list heated outdoor seating' },
    pet: { one: 'is dog friendly', many: 'are dog friendly' },
    pram: { one: 'is pram friendly', many: 'are pram friendly' },
    wheelchair: { one: 'is wheelchair accessible', many: 'are wheelchair accessible' },
    hidden: { one: 'is a hidden gem', many: 'are hidden gems' },
    bar: { one: 'is a bar', many: 'are bars' },
});
const ORDER = Object.keys(FEATURES);
const WARMTH_TAGS = new Set(['fireplace', 'heaters', 'heated outdoor', 'indoor warmth']);

/** The fireplace and outdoor heaters a message asks for, as requirement keys. */
export function warmthWants(text) {
    const lower = String(text ?? '').toLowerCase().replace(FIRE_PIT, ' ');
    const out = [];
    if (WANTS_FIREPLACE.test(lower)) out.push('fireplace');
    if (WANTS_HEATERS.test(lower)) out.push('heaters');
    return out;
}

/**
 * The venue's recorded warmth: `fireplace` is 'fireplace', 'electric
 * fireplace' or null; `heaters` is true only for outdoor heaters. A Heaters
 * tag on a venue whose heating says "indoor only" contradicts itself, so it
 * doesn't count as heated outdoor seating. `recorded` is false when the row
 * has no heating details at all, so "no" and "unknown" stay apart.
 */
export function venueWarmth(venue) {
    const icons = new Set(warmthForVenue(venue).map((item) => item.icon));
    const heating = normaliseTag(venue?.heating);
    const fireplace = icons.has('fireplace') || venue?.hasFireplace === true;
    const tags = Array.isArray(venue?.tags) ? venue.tags.map(normaliseTag) : [];
    return {
        fireplace: fireplace ? (heating.includes('electric') ? 'electric fireplace' : 'fireplace') : null,
        heaters: icons.has('heater') && heating !== 'indoor only',
        recorded: Boolean(heating) || venue?.hasFireplace === true || tags.some((t) => WARMTH_TAGS.has(t)),
    };
}

function meets(venue, key) {
    if (key === 'fireplace') return venueWarmth(venue).fireplace != null;
    if (key === 'heaters') return venueWarmth(venue).heaters;
    if (key === 'bar') return isBarVenue(venue);
    return keyAmenities(venue).some((a) => a.key === key);
}

function joinAnd(parts, word = 'and') {
    if (parts.length <= 1) return parts.join('');
    return `${parts.slice(0, -1).join(', ')} ${word} ${parts[parts.length - 1]}`;
}

const nameOf = (venue) => String(venue?.venueName ?? venue?.name ?? 'Venue').trim();
const phrase = (keys, n, word) => joinAnd(keys.map((k) => FEATURES[k][n === 1 ? 'one' : 'many']), word);

function stillToCheck(keys) {
    const fire = keys.includes('fireplace');
    const heat = keys.includes('heaters');
    const what = fire && heat ? 'the fire is lit or the heaters are on'
        : fire ? 'the fire is lit' : 'the heaters are on';
    return `I can't see whether ${what} right now, so check with the venue before you head over.`;
}

/**
 * Sunny's reply for a message that asks for a fireplace or outdoor heaters,
 * or null for any other message (those keep going to chat-sunny).
 *
 * @param {string} text the guest's latest message
 * @param {object[]} venues the app's venue rows
 * @returns {null | { reply: string, venues: object[], dog: boolean, required: string[], place: string|null, matches: number }}
 */
export function sunnyWarmthAnswer(text, venues) {
    const warmth = warmthWants(text);
    if (!warmth.length) return null;
    const list = Array.isArray(venues) ? venues.filter((v) => v?.id != null) : [];
    const { amenities, bar } = amenityWants(text);
    const required = ORDER.filter((k) => warmth.includes(k) || amenities.includes(k) || (k === 'bar' && bar));
    const dog = required.includes('pet');
    const place = placeVenuesInText(text, list, Infinity);
    const where = place.label;
    const pool = where ? place.venues : list;
    const base = { dog, required, place: where, venues: [], matches: 0 };

    const matches = pool.filter((v) => required.every((k) => meets(v, k)));
    if (matches.length) {
        // A real fire before an electric one: that's what "by a fire" means.
        const electric = (v) => (warmth.includes('fireplace') && venueWarmth(v).fireplace === 'electric fireplace' ? 1 : 0);
        const ordered = matches.map((v, i) => [v, i]).sort((a, b) => electric(a[0]) - electric(b[0]) || a[1] - b[1]).map(([v]) => v);
        const shown = ordered.slice(0, MAX_SUGGESTIONS);
        const names = shown.map((v) => {
            const notes = [];
            if (!where && v.suburb) notes.push(String(v.suburb).trim());
            if (electric(v)) notes.push('electric fireplace');
            return notes.length ? `${nameOf(v)} (${notes.join(', ')})` : nameOf(v);
        });
        const extra = ordered.length - shown.length;
        if (extra > 0) names.push(`${extra} more`);
        const lead = where ? `In ${where}, ` : '';
        const reply = `${lead}${joinAnd(names)} ${phrase(required, ordered.length)}. ${stillToCheck(warmth)}`;
        return { ...base, reply, venues: shown, matches: ordered.length };
    }

    const n = pool.length;
    const those = where
        ? (n === 1 ? `the one ${where} venue I have` : `any of the ${n} ${where} venues I have`)
        : `any of the ${n} venues I have`;
    const missing = required.filter((k) => !pool.some((v) => meets(v, k)));
    let reply;
    if (!n) {
        reply = `I don't have any venues to check for that right now.`;
    } else if (missing.length) {
        reply = `I couldn't confirm that ${those} ${phrase(missing, 1, 'or')}.`;
    } else {
        // Each feature is somewhere in the pool, just never all at one venue.
        const counts = required.map((k) => {
            const c = pool.filter((v) => meets(v, k)).length;
            return `${c} ${FEATURES[k][c === 1 ? 'one' : 'many']}`;
        });
        const venue = where ? `${/^[aeiou]/i.test(where) ? 'an' : 'a'} ${where} venue` : 'a venue';
        const all = required.length === 2 ? 'both' : 'all of them';
        reply = `I couldn't confirm ${venue} that ${phrase(required, 1)}. ${joinAnd(counts)}, but no single venue has ${all}.`;
    }
    const unknown = pool.filter((v) => !venueWarmth(v).recorded).length;
    if (unknown) {
        reply += ` ${unknown} of ${n === unknown ? 'them' : 'those venues'} ${unknown === 1 ? 'has' : 'have'} no heating details on record, so it's worth asking them directly.`;
    }
    return { ...base, reply };
}
