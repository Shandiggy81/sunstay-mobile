/**
 * One canonical kind per venue, for display and filtering.
 *
 * typeCategory is not a kind: every food and drink venue has typeCategory
 * 'Bar', which only means "not a stay" (supabase/migrations/
 * 20261016000000_promote_venue_candidates.sql and 20261016030000_clue_venue_labels_osm.sql).
 * What people see is typeLabel, so the kind comes from typeLabel through the
 * same matchers as the food-type filters (utils/venueFoodType). Stays come
 * from typeCategory (utils/propertyTypes). A missing or unknown label is
 * 'other'; the venue's name is never used, so nothing is guessed to be a bar.
 *
 * @module utils/venueKind
 */
import { isStayVenue } from './propertyTypes.js';
import { matchesFoodTypeFilters } from './venueFoodType.js';
import { venueTypeLabel } from './venueTypeLabel.js';

export const VENUE_KINDS = Object.freeze(['cafe', 'bakery', 'bar', 'pub', 'restaurant', 'takeaway', 'stay', 'other']);

// Inside the "Pub & bar" filter: a pub, tavern, brewery or beer hall/garden is
// a pub; anything else it matches ("Bar", "Bistro & Bar") is a bar.
const PUB = /\b(?:pub|tavern|brewery|beer)\b/;

/**
 * @param {object|null|undefined} venue
 * @returns {'cafe'|'bakery'|'bar'|'pub'|'restaurant'|'takeaway'|'stay'|'other'}
 */
export function venueKind(venue) {
    if (isStayVenue(venue)) return 'stay';
    // "Eatery" (no evidence either way) displays as "Food & drink" and matches no kind.
    const label = venueTypeLabel(venue?.typeLabel);
    if (!label) return 'other';
    const is = (filterId) => matchesFoodTypeFilters({ typeLabel: label }, [filterId]);
    // First match wins, so "Bakery cafe" is a bakery and "Pub & Restaurant" a pub.
    if (is('all-bakeries')) return 'bakery';
    if (is('all-cafes')) return 'cafe';
    if (is('all-cocktail-bars')) return 'bar';
    if (is('all-pubs')) return PUB.test(label.toLowerCase()) ? 'pub' : 'bar';
    if (is('all-restaurants')) return 'restaurant';
    if (is('all-takeaways')) return 'takeaway';
    return 'other';
}
