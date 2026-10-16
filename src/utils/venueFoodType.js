export const FOOD_TYPE_FILTERS = Object.freeze([
    { id: 'all-cafes', label: 'Cafe', icon: '☕' },
    { id: 'all-restaurants', label: 'Restaurant', icon: '🍽️' },
    { id: 'all-pubs', label: 'Pub & bar', icon: '🍺' },
    { id: 'all-cocktail-bars', label: 'Cocktail & wine bar', icon: '🍸' },
    { id: 'all-bakeries', label: 'Bakery', icon: '🥐' },
    { id: 'all-desserts', label: 'Dessert', icon: '🍨' },
    { id: 'all-takeaways', label: 'Takeaway', icon: '🥡' },
]);

const FOOD_FILTER_IDS = new Set(FOOD_TYPE_FILTERS.map(filter => filter.id));
const BAKERY = /\b(?:bakery|bakehouse|patisserie|pastry)\b/;
const COCKTAIL_BAR = /\bcocktail\b|\b(?:wine|rooftop)\s+bar\b/;

export function isFoodTypeFilter(id) {
    return FOOD_FILTER_IDS.has(id);
}

function normalizedLabel(venue) {
    return String(venue?.typeLabel ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, ' ');
}

const FOOD_TYPE_MATCHERS = {
    'all-cafes': label => /\bcafe\b/.test(label) && !BAKERY.test(label),
    'all-restaurants': label => /\brestaurant\b/.test(label),
    'all-pubs': label => /\b(?:pub|bar|tavern|brewery)\b|\bbeer\s+(?:garden|hall)\b/.test(label) && !COCKTAIL_BAR.test(label),
    'all-cocktail-bars': label => COCKTAIL_BAR.test(label),
    'all-bakeries': label => BAKERY.test(label),
    'all-desserts': label => /\b(?:gelato|dessert)\b|\bice[ -]?cream\b/.test(label),
    'all-takeaways': label => /\btake[ -]?away\b/.test(label),
};

/** Food selections are ORed; callers AND the result with the other filter groups. */
export function matchesFoodTypeFilters(venue, selectedFoodIds = []) {
    const foodFilters = selectedFoodIds.filter(isFoodTypeFilter);
    if (!foodFilters.length) return true;
    const label = normalizedLabel(venue);
    return foodFilters.some(id => FOOD_TYPE_MATCHERS[id](label));
}
