export const STAY_TYPES = Object.freeze(['Hotel', 'Serviced apartment', 'Short stay']);
export const PROPERTY_FILTERS = Object.freeze([
    { id: 'all-stays', label: 'Stays', icon: '🏨' },
    { id: 'all-homes', label: 'Homes', icon: '🏡' },
]);

export function propertyTypeCategory(value) {
    const type = String(value ?? '').trim();
    if (type.toLowerCase() === 'shortstay') return 'Short stay'; // Legacy saved venue rows.
    return [...STAY_TYPES, 'Residential', 'Bar'].find(t => t.toLowerCase() === type.toLowerCase()) ?? type;
}

export function isStayVenue(venue) {
    return STAY_TYPES.includes(propertyTypeCategory(venue?.typeCategory));
}

export function isPropertyVenue(venue) {
    return isStayVenue(venue) || propertyTypeCategory(venue?.typeCategory) === 'Residential';
}

/** Type selections are ORed, before the existing practical-needs/tag filters. */
export function matchesPropertyTypeFilters(venue, filters) {
    if (!filters?.length) return true;
    const type = propertyTypeCategory(venue?.typeCategory);
    return filters.some(filter => filter === 'all-stays' ? STAY_TYPES.includes(type)
        : filter === 'all-homes' ? type === 'Residential'
        : filter === 'all-hotels' && type === 'Hotel');
}
