import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FOOD_TYPE_FILTERS, isFoodTypeFilter, matchesFoodTypeFilters } from './venueFoodType.js';
import { matchesPropertyTypeFilters } from './propertyTypes.js';

const matches = (typeLabel, id) => matchesFoodTypeFilters({ typeLabel }, [id]);

describe('food-type filter metadata', () => {
    it('provides the seven selectable types with stable IDs and icons', () => {
        assert.deepEqual(FOOD_TYPE_FILTERS.map(({ id, label }) => [id, label]), [
            ['all-cafes', 'Cafe'], ['all-restaurants', 'Restaurant'], ['all-pubs', 'Pub & bar'],
            ['all-cocktail-bars', 'Cocktail & wine bar'], ['all-bakeries', 'Bakery'],
            ['all-desserts', 'Dessert'], ['all-takeaways', 'Takeaway'],
        ]);
        assert.ok(FOOD_TYPE_FILTERS.every(filter => filter.icon && isFoodTypeFilter(filter.id)));
        for (const id of ['all-stays', 'all-bars', 'moment-coffee', 'unknown', null]) {
            assert.equal(isFoodTypeFilter(id), false);
        }
    });
});

describe('matchesFoodTypeFilters', () => {
    it('matches every imported food label and keeps the categories distinct', () => {
        const examples = [
            ['Cafe', 'all-cafes'], ['Restaurant', 'all-restaurants'], ['Pub & bar', 'all-pubs'],
            ['Bar', 'all-pubs'], ['Cocktail & wine bar', 'all-cocktail-bars'],
            ['Bakery cafe', 'all-bakeries'], ['Gelato & dessert', 'all-desserts'],
            ['Takeaway', 'all-takeaways'],
        ];
        for (const [label, expected] of examples) {
            for (const { id } of FOOD_TYPE_FILTERS) {
                assert.equal(matches(label, id), id === expected, `${label}: ${id}`);
            }
        }
    });

    it('includes curated cafe, restaurant, pub and bar labels', () => {
        const examples = {
            'all-cafes': ['Library Cafe', 'Cafe & Roastery', 'Café'],
            'all-restaurants': ['Waterfront Restaurant', 'Southeast Asian Restaurant', 'Bar & Restaurant'],
            'all-pubs': ['Pub', 'Beer Garden', 'Historic Corner Pub', 'Riverside Beer Garden', 'Bridge Bar', 'Bistro & Bar', 'Tavern', 'Brewery & Beer Hall', 'Beer Hall & Thai'],
            'all-cocktail-bars': ['Wine Bar', 'Rooftop Bar', 'Cocktail Bar'],
            'all-bakeries': ['Bakery', 'Patisserie Cafe', 'Pastry shop', 'Bakehouse'],
            'all-desserts': ['Gelato', 'Dessert bar', 'Ice cream', 'Ice-cream shop'],
            'all-takeaways': ['Take-away', 'Take away'],
        };
        for (const [id, labels] of Object.entries(examples)) {
            for (const label of labels) assert.equal(matches(label, id), true, `${label}: ${id}`);
        }
    });

    it('matches case-insensitively and normalizes surrounding and repeated whitespace', () => {
        assert.equal(matches(' \tCAFÉ\n&  Roastery  ', 'all-cafes'), true);
        assert.equal(matches('  rOoFtOp \t BAR  ', 'all-cocktail-bars'), true);
        assert.equal(matches('  Beer \n Garden ', 'all-pubs'), true);
        assert.equal(matches(' TAKE \t AWAY ', 'all-takeaways'), true);
    });

    it('keeps bakery cafes and dedicated cocktail bars out of the broader options', () => {
        for (const label of ['Bakery cafe', 'Patisserie cafe', 'Cafe & Bakehouse', 'Pastry Cafe']) {
            assert.equal(matches(label, 'all-cafes'), false, label);
            assert.equal(matches(label, 'all-bakeries'), true, label);
        }
        for (const label of ['Cocktail & wine bar', 'Wine Bar', 'Rooftop Bar']) {
            assert.equal(matches(label, 'all-pubs'), false, label);
            assert.equal(matches(label, 'all-cocktail-bars'), true, label);
        }
    });

    it('does not infer a type from partial words, fallback labels or unrelated fields', () => {
        for (const label of ['Cafeine', 'Barbecue', 'Pubhouse', 'Restaurantish', 'Takeawayside', 'Eatery', 'Food & drink', 'Hotel dining', 'Hotel', 'Rooftop Club']) {
            assert.equal(matchesFoodTypeFilters({ typeLabel: label }, FOOD_TYPE_FILTERS.map(filter => filter.id)), false, label);
        }
        const unrelated = { typeCategory: 'Cafe', venueName: 'Bakery', vibe: 'Restaurant', tags: ['Takeaway'] };
        assert.equal(matchesFoodTypeFilters(unrelated, FOOD_TYPE_FILTERS.map(filter => filter.id)), false);
        for (const venue of [null, {}, { typeLabel: null }, { typeLabel: '' }]) {
            assert.equal(matchesFoodTypeFilters(venue, ['all-cafes']), false);
        }
    });

    it('ORs food selections, accepts no selection, and ignores IDs from other groups', () => {
        for (const label of ['Cafe', 'Gelato & dessert']) {
            assert.equal(matchesFoodTypeFilters({ typeLabel: label }, ['all-cafes', 'all-desserts']), true);
        }
        assert.equal(matchesFoodTypeFilters({ typeLabel: 'Takeaway' }, ['all-cafes', 'all-desserts']), false);
        assert.equal(matchesFoodTypeFilters(null), true);
        assert.equal(matchesFoodTypeFilters({}, []), true);
        assert.equal(matchesFoodTypeFilters({}, ['all-stays', 'unknown']), true);
        assert.equal(matchesFoodTypeFilters({ typeLabel: 'Cafe' }, ['all-stays', 'all-cafes']), true);
        assert.equal(matchesFoodTypeFilters({ typeLabel: 'Hotel' }, ['all-stays', 'all-cafes']), false);
    });

    it('composes as AND with property selections without changing either group’s OR semantics', () => {
        const venue = { typeCategory: 'Hotel', typeLabel: 'Restaurant' };
        const combined = (food, property) => matchesFoodTypeFilters(venue, food) && matchesPropertyTypeFilters(venue, property);
        assert.equal(combined(['all-cafes', 'all-restaurants'], ['all-homes', 'all-stays']), true);
        assert.equal(combined(['all-cafes'], ['all-stays']), false);
        assert.equal(combined(['all-restaurants'], ['all-homes']), false);
        assert.equal(combined(['all-restaurants'], []), true);
    });

    it('can match a composite pub and restaurant once in an OR-filtered venue list', () => {
        const venue = { typeLabel: 'Pub & Restaurant' };
        assert.equal(matchesFoodTypeFilters(venue, ['all-pubs']), true);
        assert.equal(matchesFoodTypeFilters(venue, ['all-restaurants']), true);
        assert.deepEqual([venue].filter(value => matchesFoodTypeFilters(value, ['all-pubs', 'all-restaurants'])), [venue]);
    });
});
