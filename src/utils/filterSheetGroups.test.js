import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_CATEGORIES } from '../data/demoVenues.js';
import { FILTER_COZY, FILTER_SUNNY } from './filterIds.js';
import { PROPERTY_FILTERS } from './propertyTypes.js';
import { SUN_MOMENT_FILTERS } from './sunMomentFilters.js';
import {
    FILTER_SHEET_GROUPS, QUICK_PICK_IDS, filterSheetGroups, groupSelectedCount, quickPicks,
} from './filterSheetGroups.js';

const groupedIds = FILTER_SHEET_GROUPS.flatMap((group) => group.sections.flatMap((section) => section.ids));

test('every filter appears exactly once across the four groups', () => {
    const ids = FILTER_CATEGORIES.map((filter) => filter.id);
    assert.equal(FILTER_SHEET_GROUPS.length, 4);
    assert.equal(new Set(groupedIds).size, groupedIds.length, 'no filter is in two groups');
    assert.deepEqual([...groupedIds].sort(), [...ids].sort());
    assert.equal(filterSheetGroups().reduce((n, group) => n + group.size, 0), ids.length);
});

test('quick picks are six real filters that are not already chips on the list sheet', () => {
    const sheetChips = new Set([
        ...PROPERTY_FILTERS.map((filter) => filter.id), FILTER_SUNNY, FILTER_COZY,
        ...SUN_MOMENT_FILTERS.map((filter) => filter.id),
        // Lookalikes of the sheet's "Sunny now" and "Cozy" chips, which mean something else.
        'Sunny', 'Cozy',
    ]);
    assert.equal(QUICK_PICK_IDS.length, 6);
    assert.deepEqual(quickPicks().map((filter) => filter.id), [...QUICK_PICK_IDS]);
    for (const id of QUICK_PICK_IDS) {
        assert.ok(groupedIds.includes(id), `${id} also has a row in a group`);
        assert.ok(!sheetChips.has(id), `${id} is already on the list sheet`);
    }
});

test('menu tags sit with the venue types, so both cocktail choices are together', () => {
    const food = filterSheetGroups().find((group) => group.id === 'food-drink');
    const foodIds = food.sections.flatMap((section) => section.filters.map((filter) => filter.id));
    assert.ok(foodIds.includes('all-cocktail-bars') && foodIds.includes('Cocktails'));
    assert.deepEqual(food.sections.map((section) => section.title), ['Type of place', 'On offer']);
    const needs = filterSheetGroups().find((group) => group.id === 'needs');
    assert.ok(needs.sections[0].filters.every((filter) => !['Vegan', 'Craft Beer', 'Cocktails', 'Specialty Coffee'].includes(filter.id)));
});

test('filter labels read in sentence case', () => {
    for (const { label } of FILTER_CATEGORIES) {
        assert.match(label, /^[A-Z]/, `"${label}" starts with a capital`);
        assert.doesNotMatch(label, /\s[A-Z]/, `"${label}" has no capitals after the first word`);
    }
});

test('resolves labels, drops unknown ids and counts selections per group', () => {
    const groups = filterSheetGroups();
    const cafe = groups[0].sections[0].filters[0];
    assert.deepEqual([cafe.id, cafe.label], ['all-cafes', 'Cafe']);
    const active = ['all-cafes', 'Cocktails', 'Rooftop', 'not-a-filter'];
    assert.deepEqual(groups.map((group) => groupSelectedCount(group, active)), [2, 0, 1, 0]);
    assert.equal(groupSelectedCount(groups[0], null), 0);
    assert.equal(groupSelectedCount(undefined, active), 0);
    // A smaller catalogue just drops what it doesn't have.
    const small = filterSheetGroups(FILTER_CATEGORIES.filter((filter) => filter.id !== 'Premium'));
    assert.equal(small.find((group) => group.id === 'needs').size, 6);
    assert.equal(quickPicks([]).length, 0);
});
