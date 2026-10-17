import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { amenityForFilter, amenityWants, isBarVenue, keyAmenities, sunnyFocusVenues, venueMatchesAmenityFilter } from './venueAmenities.js';

const v = (id, extra) => ({ id, lat: -37.8, lng: 144.96, ...extra });
const elwoodCafe = v('ec', { venueName: 'Pram Cafe', suburb: 'Elwood', vibe: 'Cafe', tags: ['Outdoor seating', 'Pram Friendly', 'Wheelchair Accessible'] });
const elwoodPub = v('ep', { venueName: 'Dog Pub', suburb: 'Elwood', typeLabel: 'Pub & bar', tags: ['pet-friendly'] });
const cbdBar = v('cb', { venueName: 'Laneway Bar', suburb: 'CBD', typeLabel: 'Cocktail & wine bar', tags: ['Hidden'] });
const cbdCafe = v('cc', { venueName: 'Plain Cafe', suburb: 'CBD', vibe: 'Cafe', tags: ['Outdoor seating', 'Large groups'] });
const all = [elwoodCafe, elwoodPub, cbdBar, cbdCafe];
const ids = (r) => r.venues.map((x) => x.id);

describe('keyAmenities', () => {
    it('reads wheelchair, pram, dog and hidden tags in a fixed order', () => {
        assert.deepEqual(keyAmenities(elwoodCafe).map((a) => a.key), ['wheelchair', 'pram']);
        assert.deepEqual(keyAmenities(elwoodPub).map((a) => a.label), ['Dog friendly']);
        assert.deepEqual(keyAmenities(cbdBar).map((a) => a.label), ['Hidden gem']);
        assert.deepEqual(keyAmenities(cbdCafe), []);
        assert.deepEqual(keyAmenities({ tags: 'nope' }), []);
        assert.deepEqual(keyAmenities(null), []);
    });
});

describe('isBarVenue', () => {
    it('knows pubs and bars by type or tag', () => {
        assert.equal(isBarVenue(elwoodPub), true);
        assert.equal(isBarVenue(cbdBar), true);
        assert.equal(isBarVenue({ vibe: 'Cafe', tags: ['Cocktails'] }), true);
        assert.equal(isBarVenue(cbdCafe), false);
        assert.equal(isBarVenue({ vibe: 'Barbecue joint' }), false);
    });
});

describe('amenityWants', () => {
    it('reads what a message asks for', () => {
        assert.deepEqual(amenityWants('somewhere for the pram and the dog?'), { amenities: ['pram', 'pet'], bar: false });
        assert.deepEqual(amenityWants('wheelchair friendly pub'), { amenities: ['wheelchair'], bar: true });
        assert.deepEqual(amenityWants('any hidden bars or speakeasies'), { amenities: ['hidden'], bar: true });
        assert.deepEqual(amenityWants('sunny lunch'), { amenities: [], bar: false });
    });
});

describe('sunnyFocusVenues', () => {
    it('narrows a place to the amenities asked for', () => {
        const r = sunnyFocusVenues('pram friendly spot in Elwood?', all);
        assert.deepEqual(ids(r), ['ec']);
        assert.equal(r.label, 'Elwood');
        assert.deepEqual(r.asked, ['Pram friendly']);
        assert.equal(r.amenityMatches, 1);
    });
    it('finds amenities anywhere when no place is named', () => {
        assert.deepEqual(ids(sunnyFocusVenues('where can I take my dog for a beer', all)), ['ep']);
        assert.deepEqual(ids(sunnyFocusVenues('any hidden bars?', all)), ['cb']);
    });
    it('keeps the place and reports 0 when nothing there has it', () => {
        const r = sunnyFocusVenues('dog friendly in the CBD', all);
        assert.deepEqual(ids(r), ['cb', 'cc']);
        assert.equal(r.amenityMatches, 0);
        assert.deepEqual(ids(sunnyFocusVenues('wheelchair accessible hidden bar', all)), []);
        assert.equal(sunnyFocusVenues('wheelchair accessible hidden bar', all).amenityMatches, 0);
    });
    it('narrows a place to bars for drinks, and leaves plain questions alone', () => {
        assert.deepEqual(ids(sunnyFocusVenues('drinks in Elwood', all)), ['ep']);
        assert.deepEqual(ids(sunnyFocusVenues('Elwood', all)), ['ec', 'ep']);
        assert.equal(sunnyFocusVenues('Elwood', all).amenityMatches, null);
        assert.deepEqual(sunnyFocusVenues('where is sunny?', all), { label: null, venues: [], asked: [], amenityMatches: null });
        assert.deepEqual(ids(sunnyFocusVenues('a cold beer?', all)), [], 'a bar alone does not narrow the map');
    });
    it('caps the list', () => {
        const many = Array.from({ length: 30 }, (_, i) => v(`p${i}`, { suburb: 'CBD', tags: ['Pram friendly'] }));
        assert.equal(sunnyFocusVenues('pram in the cbd', many, 15).venues.length, 15);
    });
});

describe('amenity filters', () => {
    it('reads a filter by any of the amenity names Sunny or the app uses', () => {
        for (const id of ['Dog friendly', 'Pet Friendly', 'dog-friendly']) assert.equal(amenityForFilter(id)?.key, 'pet', id);
        for (const id of ['Hidden gem', 'Hidden']) assert.equal(amenityForFilter(id)?.key, 'hidden', id);
        assert.equal(amenityForFilter('Pram friendly')?.key, 'pram');
        assert.equal(amenityForFilter('Wheelchair Accessible')?.key, 'wheelchair');
        assert.equal(amenityForFilter('Rooftop'), null);
        assert.equal(amenityForFilter(''), null);
    });
    it('matches venues whatever the tag spelling, and leaves other filters alone', () => {
        assert.equal(venueMatchesAmenityFilter(elwoodPub, 'Dog friendly'), true);
        assert.equal(venueMatchesAmenityFilter(elwoodPub, 'Pet Friendly'), true);
        assert.equal(venueMatchesAmenityFilter(cbdBar, 'Hidden gem'), true);
        assert.equal(venueMatchesAmenityFilter(cbdCafe, 'Hidden gem'), false);
        assert.equal(venueMatchesAmenityFilter(elwoodCafe, 'Pram friendly'), true);
        assert.equal(venueMatchesAmenityFilter(elwoodCafe, 'Rooftop'), null);
    });
});
