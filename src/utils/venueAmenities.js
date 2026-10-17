/**
 * Key amenities: the few things guests plan around before they leave home
 * (step-free access, a pram, the dog) plus "Hidden gem". They are shown up
 * top on the venue card and as small icons on list rows, and Sunny uses them
 * to answer "pram-friendly cafe in Elwood?" or "hidden bar in the CBD?".
 *
 * Only tags a venue actually carries count. Nothing here guesses.
 */
import { normaliseTag } from './venueOfferings.js';
import { placeVenuesInText } from './locationSearch.js';

export const KEY_AMENITIES = Object.freeze([
    { key: 'wheelchair', label: 'Wheelchair accessible', short: 'Accessible', icon: 'wheelchair', tags: ['wheelchair accessible', 'step free', 'accessible'] },
    { key: 'pram', label: 'Pram friendly', short: 'Pram friendly', icon: 'pram', tags: ['pram friendly'] },
    { key: 'pet', label: 'Dog friendly', short: 'Dog friendly', icon: 'brucey', tags: ['pet friendly', 'dog friendly'] },
    { key: 'hidden', label: 'Hidden gem', short: 'Hidden gem', icon: 'hidden', tags: ['hidden', 'hidden gem', 'hidden bar', 'speakeasy'] },
]);

const BY_KEY = new Map(KEY_AMENITIES.map((a) => [a.key, a]));

function tagSet(venue) {
    return new Set((Array.isArray(venue?.tags) ? venue.tags : []).map(normaliseTag).filter(Boolean));
}

/** The key amenities a venue has, in KEY_AMENITIES order. */
export function keyAmenities(venue) {
    const tags = tagSet(venue);
    if (!tags.size) return [];
    return KEY_AMENITIES.filter((a) => a.tags.some((t) => tags.has(t)));
}

/** A pub, wine bar, cocktail bar or anything else whose type or tags say bar. */
export function isBarVenue(venue) {
    const type = `${venue?.typeLabel ?? ''} ${venue?.vibe ?? ''}`.toLowerCase();
    if (/\b(bar|bars|pub|tavern|brewery|cocktail|wine)\b/.test(type)) return true;
    const tags = tagSet(venue);
    return ['bar', 'pub', 'cocktails', 'craft beer', 'speakeasy'].some((t) => tags.has(t));
}

// What a message asks for. Word lists stay plain so they're easy to extend.
const WANTS = [
    ['wheelchair', /\b(wheel ?chairs?|accessible|accessibility|disabled|disability|step[- ]free|mobility)\b/],
    ['pram', /\b(prams?|strollers?|bub|babies|baby|toddlers?|kids?|family|families|children)\b/],
    ['pet', /\b(dogs?|pets?|pup|puppy|puppies|pooch|doggo)\b/],
    ['hidden', /\b(hidden|secret|speakeasy|speakeasies|hole[- ]in[- ]the[- ]wall|underground|tucked away|laneway)\b/],
];
const BAR_WORDS = /\b(bars?|pubs?|drinks?|cocktails?|wine|beers?|pints?|speakeasy|speakeasies)\b/;

/**
 * What the message asks for: key amenity keys ("wheelchair", "pram", "pet",
 * "hidden") and whether it wants a bar.
 */
export function amenityWants(text) {
    const lower = String(text ?? '').toLowerCase();
    return {
        amenities: WANTS.filter(([, re]) => re.test(lower)).map(([key]) => key),
        bar: BAR_WORDS.test(lower),
    };
}

/**
 * Venues for Sunny to look at first, from the latest message: the place it
 * names (postcode, suburb, CBD), narrowed to the amenities and bar type it
 * asks for. When nothing matches the amenities, the place's venues are kept
 * and `amenityMatches` is 0, so Sunny can say so plainly instead of guessing.
 *
 * @returns {{ label: string|null, venues: object[], asked: string[], amenityMatches: number|null }}
 */
export function sunnyFocusVenues(text, venues, max = 15) {
    const list = Array.isArray(venues) ? venues : [];
    const place = placeVenuesInText(text, list, Infinity);
    const { amenities, bar } = amenityWants(text);
    const asked = amenities.map((k) => BY_KEY.get(k).label);
    if (bar) asked.push('Bar');
    const none = { label: null, venues: [], asked, amenityMatches: null };
    if (!list.length) return none;
    // A bar alone, with no place, is too broad to narrow the map's venues.
    if (!place.label && !amenities.length) return none;

    const pool = place.label ? place.venues : list;
    const wants = (v) => {
        const have = new Set(keyAmenities(v).map((a) => a.key));
        return amenities.every((k) => have.has(k)) && (!bar || isBarVenue(v));
    };
    const filtered = (amenities.length || bar) ? pool.filter(wants) : pool;
    const label = place.label;
    if (filtered.length) {
        return { label, venues: filtered.slice(0, max), asked, amenityMatches: asked.length ? filtered.length : null };
    }
    return { label, venues: place.label ? pool.slice(0, max) : [], asked, amenityMatches: 0 };
}

/** The key amenity a filter id names, by label or any of its tags ("Dog friendly", "Pet Friendly", "hidden"), or null. */
export function amenityForFilter(filterId) {
    const key = normaliseTag(filterId);
    if (!key) return null;
    return KEY_AMENITIES.find((a) => normaliseTag(a.label) === key || a.tags.includes(key)) ?? null;
}

/**
 * Does the venue pass a filter that names a key amenity? true/false, or null
 * when the filter isn't a key amenity (the caller then matches tags as usual).
 * Sunny sets filters with the labels it sees ("Dog friendly", "Hidden gem"),
 * while venues carry "Pet Friendly", "dog-friendly" or "Hidden".
 */
export function venueMatchesAmenityFilter(venue, filterId) {
    const amenity = amenityForFilter(filterId);
    if (!amenity) return null;
    return keyAmenities(venue).some((a) => a.key === amenity.key);
}
