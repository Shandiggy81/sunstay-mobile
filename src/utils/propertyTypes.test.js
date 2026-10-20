import test from 'node:test';
import assert from 'node:assert/strict';
import { STAY_TYPES, matchesPropertyTypeFilters, isStayVenue, isPropertyVenue, propertyTypeCategory } from './propertyTypes.js';
import { checkIsAccommodation } from './accommodation.js';
import { demoVenues } from '../data/demoVenues.js';

test('Stays groups hotels, serviced apartments and short stays, including legacy ShortStay rows', () => {
    for (const typeCategory of [...STAY_TYPES, 'ShortStay']) {
        const venue = { typeCategory };
        assert.equal(matchesPropertyTypeFilters(venue, ['all-stays']), true);
        assert.equal(matchesPropertyTypeFilters(venue, ['all-homes']), false);
        assert.equal(isStayVenue(venue), true);
        assert.equal(checkIsAccommodation(venue), true);
    }
    assert.equal(propertyTypeCategory(' serviced APARTMENT '), 'Serviced apartment');
});

test('Homes only includes Residential, ORs with Stays and preserves older exact type filters', () => {
    const home = { typeCategory: 'Residential' };
    assert.equal(matchesPropertyTypeFilters(home, ['all-homes']), true);
    assert.equal(matchesPropertyTypeFilters(home, ['all-stays']), false);
    assert.equal(isPropertyVenue(home), true);
    for (const typeCategory of [...STAY_TYPES, 'Residential']) assert.equal(matchesPropertyTypeFilters({ typeCategory }, ['all-stays', 'all-homes']), true);
    assert.equal(matchesPropertyTypeFilters({ typeCategory: 'Hotel' }, ['all-hotels']), true);
    assert.equal(matchesPropertyTypeFilters({ typeCategory: 'Serviced apartment' }, ['all-hotels']), false);
    // typeCategory 'Bar' only means "not a stay": food and drink venues pass no property filter.
    for (const filter of ['all-stays', 'all-homes', 'all-hotels', 'all-bars']) {
        assert.equal(matchesPropertyTypeFilters({ typeCategory: 'Bar', typeLabel: 'Cafe' }, [filter]), false);
    }
    assert.equal(matchesPropertyTypeFilters({}, ['all-stays']), false);
    assert.equal(matchesPropertyTypeFilters({ typeCategory: 'Cafe' }, []), true);
});

test('a pub called Hotel remains a Bar, while unclassified legacy accommodation still works', () => {
    const pub = { typeCategory: 'Bar', vibe: 'Hotel & beer garden' };
    assert.equal(matchesPropertyTypeFilters(pub, ['all-stays', 'all-homes']), false);
    assert.equal(checkIsAccommodation(pub), false);
    assert.equal(checkIsAccommodation({ vibe: 'Serviced apartment' }), true);
    assert.equal(isPropertyVenue(null), false);
});

test('every demo venue has a category and all ten previously untyped hospitality venues remain Bars', () => {
    assert.ok(demoVenues.every(venue => Boolean(venue.typeCategory)));
    for (const id of ['dv-04', 'dv-06', 'dv-07', 'dv-08', 'dv-09', 'dv-11', 'dv-12', 'dv-23', 'dv-25', 'dv-26']) {
        assert.equal(demoVenues.find(venue => venue.id === id).typeCategory, 'Bar');
    }
});

test('eight Melbourne stays have sourced public details and 1–4 unpriced, estimated facade rooms', () => {
    const stays = demoVenues.filter(venue => venue.id.startsWith('dv-melb-stay-'));
    assert.equal(stays.length, 8);
    assert.deepEqual([...new Set(stays.map(v => v.suburb))].sort(), ['CBD', 'Docklands', 'Southbank', 'St Kilda']);
    assert.equal(stays.filter(v => v.typeCategory === 'Hotel').length, 4);
    assert.equal(stays.filter(v => v.typeCategory === 'Serviced apartment').length, 4);
    assert.equal(new Set(demoVenues.map(v => v.id)).size, demoVenues.length);
    for (const venue of stays) {
        assert.ok(venue.venueName && venue.address && venue.official_website_url.startsWith('https://'));
        assert.ok(venue.lat > -38 && venue.lat < -37.5 && venue.lng > 144.8 && venue.lng < 145.1);
        assert.equal(matchesPropertyTypeFilters(venue, ['all-stays']), true);
        assert.ok(venue.roomTypes.length >= 1 && venue.roomTypes.length <= 4);
        for (const room of venue.roomTypes) {
            assert.ok(['estimated', 'estimated-buildings'].includes(room.source));assert.ok(Number.isFinite(room.orientation));
            assert.equal('baseNightlyRateDemo' in room, false);assert.equal('hasBalcony' in room, false);
        }
    }
});
