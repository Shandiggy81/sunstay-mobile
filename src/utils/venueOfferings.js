/**
 * "What this venue offers": the venue's tags as labelled rows with a clay
 * icon (a file name in src/assets/clay/ without `.webp`), or `icon: null`
 * for tags with no icon yet, which the card draws as a neutral dot.
 */

// Order is display order. Keys are normalised tags (see normaliseTag).
const OFFERINGS = Object.freeze([
    { keys: ['beer garden'], label: 'Beer garden', icon: 'garden-table' },
    { keys: ['deck'], label: 'Deck', icon: 'deck' },
    { keys: ['rooftop'], label: 'Rooftop', icon: 'rooftop-bar' },
    { keys: ['outdoor seating', 'outdoor tables'], label: 'Outdoor seating', icon: 'garden-table' },
    { keys: ['fireplace'], label: 'Fireplace', icon: 'fireplace' },
    { keys: ['live music'], label: 'Live music', icon: 'live-music' },
    { keys: ['pet friendly', 'dog friendly'], label: 'Dog friendly', icon: 'brucey' },
    { keys: ['wheelchair accessible'], label: 'Wheelchair accessible', icon: 'wheelchair' },
    { keys: ['smoking area'], label: 'Smoking area', icon: 'smoking-area' },
    { keys: ['24h license', '24h licence'], label: '24-hour bottleshop', icon: 'bottle-shop' },
    { keys: ['heaters', 'heated outdoor'], label: 'Outdoor heaters', icon: 'heater' },
    { keys: ['indoor warmth'], label: 'Warm indoor space', icon: 'indoor-warmth' },
    { keys: ['covered', 'umbrellas', 'all weather'], label: 'Covered seating', icon: 'umbrella' },
    { keys: ['shaded'], label: 'Shaded seating', icon: 'shaded' },
    { keys: ['morning sun'], label: 'Morning sun spot', icon: 'morning-sun' },
    { keys: ['afternoon sun'], label: 'Afternoon sun spot', icon: 'afternoon-sun' },
    { keys: ['river'], label: 'Waterfront', icon: 'waterfront' },
    { keys: ['beach'], label: 'Beach', icon: 'beach' },
    { keys: ['views'], label: 'Views', icon: 'hotel-views' },
    { keys: ['cocktails'], label: 'Cocktails', icon: 'cocktail' },
    { keys: ['craft beer'], label: 'Craft beer', icon: 'pint' },
    { keys: ['specialty coffee'], label: 'Specialty coffee', icon: 'coffee' },
    { keys: ['food available', 'pub grub'], label: 'Food available', icon: 'dining' },
    { keys: ['vegan'], label: 'Vegan options', icon: 'vegan' },
    { keys: ['pram friendly'], label: 'Pram friendly', icon: 'pram' },
    { keys: ['large groups'], label: 'Good for groups', icon: 'large-groups' },
    { keys: ['garden'], label: 'Garden', icon: 'botanical' },
    { keys: ['historic'], label: 'Historic venue', icon: 'heritage' },
]);

const BY_KEY = new Map(OFFERINGS.flatMap((o, order) => o.keys.map((k) => [k, { ...o, order }])));

// Live conditions, not amenities: the card's forecast already covers them,
// and a static "Sunny" tag would contradict a cloudy forecast.
const SKIP = new Set(['sunny', 'sunny now', 'windy', 'calm', 'exposed', 'midday sun']);

export const OFFERINGS_PREVIEW = 6;

export function normaliseTag(tag) {
    if (typeof tag !== 'string') return '';
    return tag
        .toLowerCase()
        .replace(/[-_]+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function displayLabel(tag) {
    const words = normaliseTag(tag);
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/**
 * @param {object} venue  reads `tags` and `heating`
 * @returns {Array<{ key: string, label: string, icon: string|null }>}
 */
export function venueOfferings(venue) {
    const tags = Array.isArray(venue?.tags) ? [...venue.tags] : [];
    const heating = typeof venue?.heating === 'string' ? venue.heating.toLowerCase() : '';
    if (heating.includes('fireplace')) tags.push('Fireplace');
    else if (heating === 'heated outdoor') tags.push('Heaters');

    const known = [];
    const unknown = [];
    const seen = new Set();
    for (const tag of tags) {
        const key = normaliseTag(tag);
        if (!key || SKIP.has(key)) continue;
        const match = BY_KEY.get(key);
        const label = match ? match.label : displayLabel(tag);
        if (seen.has(label)) continue;
        seen.add(label);
        if (match) known.push({ key: match.keys[0], label, icon: match.icon, order: match.order });
        else unknown.push({ key, label, icon: null });
    }
    known.sort((a, b) => a.order - b.order);
    return [...known.map(({ order, ...rest }) => rest), ...unknown];
}
