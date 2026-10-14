/**
 * Clay icon for a venue's map pin. Values are file names in
 * src/assets/clay/pins/ without `.webp`: 96×96 copies of the src/assets/clay/
 * icons, made with
 *   ffmpeg -i clay/<name>.webp -vf "scale=96:96:flags=lanczos,format=yuva420p" \
 *     -c:v libwebp -quality 88 -compression_level 6 clay/pins/<name>.webp
 * so a map of ~30px pins doesn't load 256px images on phones. Venues with no
 * match keep their emoji.
 *
 * Matching runs typeLabel first (the most specific description), then the
 * venue's emoji, then its tags, all case-insensitive.
 */

import { clayIconUrls } from './clayFilterIcons.js';

// Order matters: the first match wins, so specific places beat generic ones
// ("Waterfront Pub" is waterfront, "Pub & Beer Garden" is a beer garden).
const TYPE_LABEL_RULES = Object.freeze([
    [/rooftop.*terrace|terrace.*rooftop/, 'rooftop-terrace'],
    [/rooftop/, 'rooftop-bar'],
    [/beer garden/, 'garden-table'],
    [/\bbeach/, 'beach'],
    [/waterfront|riverside|\briver\b|\bbay\b|harbou?r|\bpier\b/, 'waterfront'],
    [/cocktail/, 'cocktail'],
    [/\bwine\b/, 'wine'],
    [/caf[eé]|coffee|espresso|roaster/, 'coffee'],
    [/hotel|\bstay\b|apartment|resort|motel|\binn\b|lodge/, 'hotel-views'],
    [/live music/, 'live-music'],
    [/fireplace|fire ?pit/, 'fireplace'],
    [/food truck/, 'food-truck'],
    [/billiard|pool hall|pool table/, 'pool-table'],
    [/botanic/, 'botanical'],
    [/heritage|historic/, 'heritage'],
    [/\bcos[yz]\b|lounge/, 'indoor-warmth'],
    [/\bpub\b|tavern|brewery|brewhouse|ale ?house/, 'pint'],
    // Last, so "Pub & Restaurant" stays a pub and "Waterfront Restaurant" waterfront.
    [/restaurant|dining|bistro|eatery|trattoria|gastronomia/, 'dining'],
]);

const EMOJI_ICONS = Object.freeze({
    '🍺': 'pint',
    '🍻': 'pint',
    '🌇': 'rooftop-bar',
    '🍷': 'wine',
    '🥂': 'wine',
    '☕': 'coffee',
    '🌊': 'waterfront',
    '🐟': 'waterfront',
    '🦀': 'waterfront',
    '🏖': 'beach',
    '🏨': 'hotel-views',
    '🏢': 'hotel-views',
    '🎸': 'live-music',
    '🔥': 'fireplace',
    '🛋': 'indoor-warmth',
    '🍸': 'cocktail',
    '🍹': 'cocktail',
    '🌿': 'botanical',
    '🌳': 'botanical',
    '🏛': 'heritage',
    '🚚': 'food-truck',
    '🎱': 'pool-table',
    '🍽': 'dining',
});

// Only tags that say what kind of place a venue is. Feature tags ("Cozy",
// "Indoor Warmth", "Live Music", "Specialty Coffee") describe what a venue
// offers, so a venue matched only by those keeps its own emoji.
const TAG_ICONS = Object.freeze({
    'rooftop': 'rooftop-bar',
    'beer garden': 'garden-table',
    'river': 'waterfront',
    'waterfront': 'waterfront',
    'beach': 'beach',
    'hotel': 'hotel-views',
});

export const CLAY_PIN_ICON_NAMES = Object.freeze([...new Set([
    ...TYPE_LABEL_RULES.map(([, name]) => name),
    ...Object.values(EMOJI_ICONS),
    ...Object.values(TAG_ICONS),
])]);

const own = (table, key) => (Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null);

/** Clay pin icon name for a venue, or null when it should keep its emoji. */
export function pinIconName(venue) {
    if (!venue || typeof venue !== 'object') return null;

    const label = typeof venue.typeLabel === 'string' ? venue.typeLabel.toLowerCase() : '';
    if (label) {
        for (const [pattern, name] of TYPE_LABEL_RULES) {
            if (pattern.test(label)) return name;
        }
    }

    // Drop variation selectors so "🏖️" and "🏖" match the same key.
    const emoji = typeof venue.emoji === 'string' ? venue.emoji.replace(/️/g, '').trim() : '';
    const fromEmoji = emoji ? own(EMOJI_ICONS, emoji) : null;
    if (fromEmoji) return fromEmoji;

    if (Array.isArray(venue.tags)) {
        for (const tag of venue.tags) {
            if (typeof tag !== 'string') continue;
            const fromTag = own(TAG_ICONS, tag.trim().toLowerCase());
            if (fromTag) return fromTag;
        }
    }
    return null;
}

/**
 * Turns `import.meta.glob('../assets/clay/pins/*.webp', { eager: true, import: 'default' })`
 * output into `{ name: url }`.
 */
export const clayPinUrls = clayIconUrls;

/** The URL for a venue's clay pin icon, or null. */
export function clayPinUrlFor(venue, urls) {
    const name = pinIconName(venue);
    return name && urls ? own(urls, name) : null;
}
