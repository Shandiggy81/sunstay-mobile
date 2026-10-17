/**
 * Search by place: a postcode ("3141"), a suburb ("South Yarra"), everyday
 * names for the city ("CBD", "city"), or a place we have no venues in yet
 * ("Brighton"), which is looked up with Mapbox and answered with the nearest
 * venues.
 */
import { MAX_BOUNDS } from '../config/mapBounds.js';

// Victorian street postcodes (3000–3999). PO-box ranges (8000s) aren't used in venue addresses.
const POSTCODE = /\b(3\d{3})\b/g;
const POSTCODE_ONLY = /^3\d{3}$/;

// Everyday names for the city centre. Imported CBD venues have suburb "CBD".
const CITY_ALIASES = new Set(['cbd', 'city', 'the city', 'melbourne cbd', 'melbourne city', 'city centre', 'city center']);

/** Radii tried in order when a place has no venues of its own. */
export const NEARBY_RADII_M = Object.freeze([1500, 3000, 6000]);

/** The venue's postcode: its own field, else the last 3xxx in its address. */
export function venuePostcode(venue) {
    const own = String(venue?.postcode ?? '').trim();
    if (POSTCODE_ONLY.test(own)) return own;
    const found = String(venue?.address ?? '').match(POSTCODE);
    return found ? found[found.length - 1] : null;
}

/**
 * Splits a search into a postcode (if any) and the remaining text.
 * "South Yarra 3141" → { text: 'south yarra', postcode: '3141', city: false }.
 */
export function parseSearchQuery(raw) {
    const lower = String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    const codes = lower.match(POSTCODE);
    const postcode = codes ? codes[codes.length - 1] : null;
    const text = lower.replace(POSTCODE, ' ').replace(/\b(vic|victoria)\b/g, ' ').replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim();
    return { raw: lower, text, postcode, city: CITY_ALIASES.has(text) };
}

/**
 * Does the venue match the search? A postcode matches the venue's postcode
 * (or, with suburb text too, either one). City aliases match CBD venues.
 * Other text matches the name, suburb or venue type, as before.
 *
 * @param {object} venue
 * @param {ReturnType<typeof parseSearchQuery>} q
 * @param {(vibe: string) => string} [typeLabel] maps a vibe to its display label
 */
export function venueMatchesSearch(venue, q, typeLabel = (v) => v) {
    if (!q || (!q.text && !q.postcode)) return true;
    const suburb = String(venue?.suburb ?? '').toLowerCase();
    if (q.postcode && venuePostcode(venue) === q.postcode) return true;
    const name = String(venue?.name ?? venue?.venueName ?? '').toLowerCase();
    if (q.city) return suburb === 'cbd' || (suburb === 'melbourne' && venuePostcode(venue) === '3000') || name.includes(q.text);
    if (!q.text) return false;
    const vibeRaw = venue?.vibe ?? '';
    const vibe = `${vibeRaw} ${typeLabel(vibeRaw) ?? ''}`.toLowerCase();
    return name.includes(q.text) || suburb.includes(q.text) || vibe.includes(q.text);
}

/**
 * Worth looking the search up as a place? Only when nothing matched and it
 * looks like a place: a postcode, or 3+ letters of words (no digits other
 * than a postcode).
 */
export function needsPlaceLookup(q, matchCount) {
    if (matchCount > 0 || !q) return false;
    if (q.postcode) return true;
    return /^[a-z][a-z .'-]{2,}$/.test(q.text) && !q.city;
}

/** Mapbox Geocoding v6 forward-search URL, limited to greater Melbourne. */
export function placeLookupUrl(query, token, bounds = MAX_BOUNDS) {
    const [[w, s], [e, n]] = bounds;
    const params = new URLSearchParams({
        q: String(query).trim(),
        country: 'au',
        types: 'postcode,locality,neighborhood,place',
        bbox: [w, s, e, n].join(','),
        proximity: '144.9631,-37.8136',
        limit: '1',
        access_token: token,
    });
    return `https://api.mapbox.com/search/geocode/v6/forward?${params}`;
}

/** First place in a Mapbox v6 response, as { name, lng, lat }, or null. */
export function parsePlaceResponse(json) {
    const f = json?.features?.[0];
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
    const props = f.properties ?? {};
    let name = String(props.name_preferred || props.name || props.place_formatted || '');
    // A postcode alone ("3186") reads better with its suburb: "3186 Brighton".
    const area = String(props.place_formatted ?? '').split(',')[0].trim();
    if (/^\d{4}$/.test(name) && area && !/^\d/.test(area)) name = `${name} ${area}`;
    return { name, lng: coords[0], lat: coords[1] };
}

function metres(aLat, aLng, bLat, bLng) {
    const R = 6371000;
    const p1 = (aLat * Math.PI) / 180;
    const p2 = (bLat * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((bLng - aLng) * Math.PI) / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Venues near a place: the smallest radius in `radii` that has any, as
 * { radiusM, ids } (ids are strings). Empty ids when none are within the
 * largest radius.
 */
export function venuesNearPlace(venues, place, radii = NEARBY_RADII_M) {
    const list = Array.isArray(venues) ? venues : [];
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return { radiusM: null, ids: new Set() };
    const withDist = [];
    for (const v of list) {
        const lat = Number(v?.lat);
        const lng = Number(v?.lng);
        if (v?.id == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        withDist.push([String(v.id), metres(place.lat, place.lng, lat, lng)]);
    }
    for (const r of radii) {
        const ids = new Set(withDist.filter(([, d]) => d <= r).map(([id]) => id));
        if (ids.size) return { radiusM: r, ids };
    }
    return { radiusM: null, ids: new Set() };
}

/** "8 venues near Brighton (within 3 km)". */
export function placeCountLabel(count, place, radiusM) {
    const where = place?.name ? ` near ${place.name}` : ' nearby';
    const within = radiusM ? ` (within ${radiusM >= 1000 ? `${+(radiusM / 1000).toFixed(1)} km` : `${radiusM} m`})` : '';
    return `${count} venue${count === 1 ? '' : 's'}${where}${within}`;
}

/**
 * Venues for a place named in free text, for Sunny's chat: postcodes
 * ("3141"), city words ("CBD", "the city") and suburbs we have venues in
 * ("South Yarra"). "Melbourne" alone is too broad to count. Longest suburb
 * names win, so "North Melbourne" isn't read as "Melbourne".
 *
 * @returns {{ label: string|null, venues: object[] }} at most `max` venues
 */
export function placeVenuesInText(text, venues, max = 15) {
    const lower = ` ${String(text ?? '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ')} `;
    const list = Array.isArray(venues) ? venues : [];
    const none = { label: null, venues: [] };
    if (!lower.trim() || !list.length) return none;

    const codes = lower.match(POSTCODE);
    if (codes) {
        const code = codes[codes.length - 1];
        const hits = list.filter((v) => venuePostcode(v) === code);
        if (hits.length) return { label: code, venues: hits.slice(0, max) };
    }

    const suburbs = [...new Set(list.map((v) => String(v?.suburb ?? '').trim()).filter(Boolean))]
        .filter((s) => s.toLowerCase() !== 'melbourne' && s.length >= 4)
        .sort((a, b) => b.length - a.length);
    for (const suburb of suburbs) {
        const key = suburb.toLowerCase();
        if (key === 'cbd') continue;
        if (lower.includes(` ${key} `)) {
            return { label: suburb, venues: list.filter((v) => String(v?.suburb ?? '').toLowerCase() === key).slice(0, max) };
        }
    }

    if (/ (cbd|the city|city centre|city center|melbourne cbd) /.test(lower)) {
        return { label: 'CBD', venues: list.filter((v) => String(v?.suburb ?? '').toLowerCase() === 'cbd').slice(0, max) };
    }
    return none;
}
