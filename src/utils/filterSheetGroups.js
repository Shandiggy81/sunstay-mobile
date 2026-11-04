/**
 * The Filters sheet's layout, as approved on 4 Nov 2026 (option A): six quick
 * picks, then every filter exactly once in four groups. Presentation only:
 * ids, labels and icons come from FILTER_CATEGORIES (src/data/demoVenues.js),
 * and the matching rules in App.jsx don't change. A quick pick is the same
 * filter id as its row in a group, so both always show the same state.
 */
import { FILTER_CATEGORIES } from '../data/demoVenues.js';

/**
 * Common choices that aren't already one tap away on the list sheet, which
 * has Stays, Homes, Sunny now, Cozy and the sun moments. A starting choice,
 * not usage data: change it freely.
 */
export const QUICK_PICK_IDS = Object.freeze(['all-cafes', 'all-pubs', 'all-restaurants', 'Beer Garden', 'Rooftop', 'Pet Friendly']);

/** Each group's filters in display order; Food & drink keeps its menu tags beside the venue types. */
export const FILTER_SHEET_GROUPS = Object.freeze([
    {
        id: 'food-drink', title: 'Food & drink', icon: 'coffee', sections: [
            { title: 'Type of place', ids: ['all-cafes', 'all-restaurants', 'all-pubs', 'all-cocktail-bars', 'all-bakeries', 'all-desserts', 'all-takeaways'] },
            { title: 'On offer', ids: ['Vegan', 'Craft Beer', 'Cocktails', 'Specialty Coffee'] },
        ],
    },
    {
        id: 'stays', title: 'Stays & homes', icon: 'house', sections: [
            { title: null, ids: ['all-stays', 'all-homes', 'Hotel', 'Serviced apartment', 'Short Stay', 'Balcony'] },
        ],
    },
    {
        id: 'comfort', title: 'Sun & comfort', icon: 'sun', sections: [
            { title: null, ids: ['Sunny', 'Cozy', 'Rooftop', 'Beer Garden', 'Fireplace', 'Views', 'Shaded', 'Indoor Warmth', 'Heaters', 'River', 'Afternoon Sun', 'Morning Sun'] },
        ],
    },
    {
        id: 'needs', title: 'Good to know', icon: 'pram', sections: [
            { title: null, ids: ['Pet Friendly', 'Pram Friendly', 'Wheelchair Accessible', 'Large Groups', 'Smoking Area', 'Live Music', 'Premium'] },
        ],
    },
]);

const byId = (categories) => new Map(categories.map((filter) => [filter.id, filter]));

/**
 * The groups with each section's filters resolved to their { id, label, icon },
 * in order. An id missing from `categories` is left out.
 *
 * @returns {Array<{ id: string, title: string, icon: string, size: number,
 *   sections: Array<{ title: string|null, filters: Array<{ id: string, label: string, icon: string }> }> }>}
 */
export function filterSheetGroups(categories = FILTER_CATEGORIES) {
    const lookup = byId(categories);
    return FILTER_SHEET_GROUPS.map((group) => {
        const sections = group.sections.map((section) => ({
            title: section.title,
            filters: section.ids.map((id) => lookup.get(id)).filter(Boolean),
        }));
        return {
            id: group.id, title: group.title, icon: group.icon, sections,
            size: sections.reduce((n, section) => n + section.filters.length, 0),
        };
    });
}

/** The quick picks resolved like filterSheetGroups(). */
export function quickPicks(categories = FILTER_CATEGORIES) {
    const lookup = byId(categories);
    return QUICK_PICK_IDS.map((id) => lookup.get(id)).filter(Boolean);
}

/** How many of a resolved group's filters are on, for its collapsed row ("2 selected"). */
export function groupSelectedCount(group, activeFilters) {
    const active = new Set(Array.isArray(activeFilters) ? activeFilters : []);
    return (group?.sections ?? []).reduce(
        (n, section) => n + section.filters.filter((filter) => active.has(filter.id)).length,
        0,
    );
}
