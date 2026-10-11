/**
 * Clay icon for each FilterSheet option (FILTER_CATEGORIES[].id).
 * Values are file names in src/assets/clay/ without `.webp`. Filters with
 * no clay icon yet keep their emoji.
 */
export const CLAY_ICON_FOR_FILTER = Object.freeze({
    'Sunny': 'sun',
    'Rooftop': 'rooftop-terrace',
    'Beer Garden': 'garden-table',
    'Cozy': 'umbrella',
    'Fireplace': 'fireplace',
    'Pet Friendly': 'brucey',
    'Pram Friendly': 'pram',
    'Live Music': 'live-music',
    'Views': 'rooftop-bar',
    'Wheelchair Accessible': 'wheelchair',
    'Craft Beer': 'pint',
    'Vegan': 'vegan',
    'Specialty Coffee': 'coffee',
    'Large Groups': 'large-groups',
    'Smoking Area': 'smoking-area',
    'Shaded': 'shaded',
    'Indoor Warmth': 'indoor-warmth',
    'Heaters': 'heater',
    'River': 'waterfront',
    'Afternoon Sun': 'afternoon-sun',
    'Morning Sun': 'morning-sun',
    'Hotel': 'hotel-views',
});

/** Clay icon name for a filter id, or null when it should keep its emoji. */
export function clayIconName(filterId) {
    return Object.prototype.hasOwnProperty.call(CLAY_ICON_FOR_FILTER, filterId)
        ? CLAY_ICON_FOR_FILTER[filterId]
        : null;
}

/**
 * Turns `import.meta.glob('../assets/clay/*.webp', { eager: true, import: 'default' })`
 * output into `{ name: url }`.
 */
export function clayIconUrls(globResult) {
    const urls = {};
    for (const [path, url] of Object.entries(globResult || {})) {
        const match = /([^/]+)\.webp$/.exec(path);
        if (match && typeof url === 'string') urls[match[1]] = url;
    }
    return urls;
}

/** The URL for a filter's clay icon, or null. */
export function clayIconFor(filterId, urls) {
    const name = clayIconName(filterId);
    return name && urls ? urls[name] ?? null : null;
}
