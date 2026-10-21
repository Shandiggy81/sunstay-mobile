import { venueKind } from './venueKind.js';
import { propertyTypeCategory } from './propertyTypes.js';
import { normaliseTag, venueOfferings } from './venueOfferings.js';

const FOOD_KINDS = new Set(['cafe', 'bakery', 'bar', 'pub', 'restaurant', 'takeaway']);
const tagsFor = venue => new Set((Array.isArray(venue?.tags) ? venue.tags : []).map(normaliseTag));
const hasTag = (tags, values) => values.some(value => tags.has(value));

/** Outdoor access must be explicit. Facade-only room estimates are not balconies. */
export function partnerOutdoorSpace(venue) {
    const kind = venueKind(venue), tags = tagsFor(venue);
    if (kind === 'stay') {
        const rooms = Array.isArray(venue.roomTypes) ? venue.roomTypes : [];
        const room = rooms.find(room => room?.hasBalcony === true || room?.hasOutdoorArea === true);
        if (venue.hasPool === true || hasTag(tags, ['pool', 'outdoor pool'])) return { label: 'pool area', icon: 'umbrella', communal: true };
        if (venue.hasTerrace === true || hasTag(tags, ['terrace', 'outdoor terrace'])) return { label: 'terrace', icon: 'deck', communal: true };
        if (room || venue.hasBalcony === true || hasTag(tags, ['balcony', 'private balcony'])) {
            const balcony = room?.hasBalcony === true || venue.hasBalcony === true || hasTag(tags, ['balcony', 'private balcony']);
            return { label: balcony ? 'balcony' : 'outdoor area', icon: balcony ? 'sunny-balcony' : 'deck', room };
        }
        return null;
    }
    if (!FOOD_KINDS.has(kind)) return null;
    if (venue.hasBeerGarden === true || hasTag(tags, ['beer garden']) || /beer garden/i.test(venue.typeLabel ?? '')) return { label: 'beer garden', icon: 'beer-garden' };
    if (venue.hasOutdoorArea === true || venue.hasOutdoorSeating === true || hasTag(tags, ['outdoor seating', 'outdoor tables', 'sunny terrace', 'terrace', 'deck', 'rooftop', 'garden', 'courtyard', 'beer garden'])) return { label: 'terrace', icon: 'courtyard-terrace' };
    return null;
}

/** Keys match the existing device-local venue feature/pin preview contract. */
export function partnerStatusGroups(venue) {
    const space = partnerOutdoorSpace(venue);
    if (!space) return [];
    const stay = venueKind(venue) === 'stay';
    const sun = [{ key: 'sunshineNow', label: `Sun on the ${space.label}`, icon: 'sun' }];
    if (!stay || space.communal) sun.push(
        { key: 'hasUmbrellas', label: 'Umbrellas up', icon: 'umbrella' },
        { key: 'hasWindProtection', label: 'Awnings / windbreaks down', icon: 'wind-sheltered' },
    );
    const warmth = [];
    const tags = tagsFor(venue);
    if (!stay || venue.hasHeaters === true || hasTag(tags, ['heaters', 'heated outdoor'])) warmth.push({ key: 'heatersOn', label: 'Heaters on', icon: 'heater' });
    if (!stay) warmth.push({ key: 'fireplaceOn', label: 'Fire pit lit', icon: 'fireplace' });
    return [{ label: 'Sun & shade', controls: sun }, ...(warmth.length ? [{ label: 'Warmth', controls: warmth }] : [])];
}

const TAGS = {
    stay: ['Balcony', 'Pool', 'Terrace', 'Family Friendly', 'Dog Friendly', 'Pram Friendly', 'Accessible', 'Views'],
    food: ['Sunny Terrace', 'Dog Friendly', 'Pram Friendly', 'Family Friendly', 'Covered', 'Heaters', 'Cosy Inside', 'Garden'],
    pub: ['Beer Garden', 'Live Music', 'Sports Screens', 'Firepit', 'Cocktails', 'Late Night'],
};
export function partnerTagSuggestions(venue) {
    const kind = venueKind(venue);
    if (kind === 'stay') return TAGS.stay;
    if (!FOOD_KINDS.has(kind)) return ['Accessible', 'Family Friendly', 'Dog Friendly'];
    return [...TAGS.food, ...(['pub', 'bar'].includes(kind) ? TAGS.pub : [])];
}
export function partnerTagIcon(tag) {
    const known = venueOfferings({ tags: [tag] })[0]?.icon;
    if (known) return known;
    return ({ balcony: 'deck', terrace: 'deck', 'sunny terrace': 'sun', pool: 'umbrella', 'family friendly': 'family', firepit: 'fireplace', 'cosy inside': 'indoor-warmth', 'late night': 'night', 'sports screens': 'house', accessible: 'wheelchair' })[normaliseTag(tag)] ?? 'sparkles';
}
export function partnerType(venue) {
    const kind = venueKind(venue);
    if (kind === 'stay') return { label: propertyTypeCategory(venue.typeCategory), icon: propertyTypeCategory(venue.typeCategory) === 'Hotel' ? 'hotel-views' : 'house' };
    return { label: venue.typeLabel || 'Venue', icon: ({ cafe: 'coffee', bakery: 'coffee', bar: 'cocktail', pub: 'pint', restaurant: 'dining', takeaway: 'food-truck', other: 'house' })[kind] };
}
