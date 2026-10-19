import { isStayVenue, matchesPropertyTypeFilters } from './propertyTypes.js';
import { isFoodTypeFilter } from './venueFoodType.js';

/** Keep already-filtered homes (and other types) alongside sun-ranked stays. */
export function includeNonStayResults(venues, rankedStays) {
    return [...rankedStays, ...venues.filter(venue => !isStayVenue(venue))];
}

/** Empty Homes results can mean missing inventory, not an over-specific search. */
export function homesEmptyState({ venues, filters = [], loading = false }) {
    const types = filters.filter(id => id.startsWith('all-') && !isFoodTypeFilter(id));
    if (types.length !== 1 || types[0] !== 'all-homes') return null;
    if (loading) return {
        badgeLabel: 'Loading listings',
        title: 'Checking for homes',
        message: 'We’re loading the venue listings. Homes will appear here if any are listed.',
        actionLabel: 'Browse all venues',
    };
    if (!venues.some(venue => matchesPropertyTypeFilters(venue, ['all-homes']))) return {
        badgeLabel: 'No homes listed',
        title: 'No homes in these listings',
        message: 'These listings don’t include residential homes. Try Stays for hotels and serviced apartments.',
        actionLabel: 'Browse all venues',
    };
    return {
        title: 'No homes match this search',
        message: 'Try changing your search or clearing filters to see more listings.',
        actionLabel: 'Clear filters',
    };
}
