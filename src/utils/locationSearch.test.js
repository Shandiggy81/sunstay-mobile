import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    needsPlaceLookup, NEARBY_RADII_M, parsePlaceResponse, parseSearchQuery, placeCountLabel, placeVenuesInText,
    placeLookupUrl, searchMatchMode, venueMatchesSearch, venuePostcode, venuesNearPlace,
} from './locationSearch.js';

const v = (id, extra) => ({ id, lat: -37.8, lng: 144.96, ...extra });
const southYarra = v('sy', { venueName: 'Matilda 159', suburb: 'South Yarra', address: 'Restaurant Ground 159 Domain Road South Yarra VIC 3141' });
const cbd = v('cbd', { venueName: 'Becco', suburb: 'CBD', address: 'Ground 11-25 Crossley Street Melbourne VIC 3000', vibe: 'Restaurant' });
const southbank = v('sb', { venueName: 'Coventry Pantry', suburb: 'Southbank', address: '35-37 Coventry Street Southbank VIC 3006' });
const curated = v('cur', { venueName: 'The Espy', suburb: 'St Kilda', postcode: '3182' });
const noAddress = v('na', { venueName: 'Somewhere', suburb: 'Williamstown' });

describe('venuePostcode', () => {
    it('reads the postcode field, else the last 3xxx in the address', () => {
        assert.equal(venuePostcode(southYarra), '3141');
        assert.equal(venuePostcode(curated), '3182');
        assert.equal(venuePostcode(noAddress), null);
        assert.equal(venuePostcode({ address: 'Shop 3000, 12 Smith St Fitzroy VIC 3065' }), '3065');
        assert.equal(venuePostcode(null), null);
    });
});

describe('parseSearchQuery', () => {
    it('splits a postcode from the text and drops VIC', () => {
        assert.deepEqual(parseSearchQuery('  South Yarra, VIC 3141 '), { raw: 'south yarra, vic 3141', text: 'south yarra', postcode: '3141', city: false });
        assert.equal(parseSearchQuery('3000').postcode, '3000');
        assert.equal(parseSearchQuery('3000').text, '');
        assert.equal(parseSearchQuery('Becco').postcode, null);
    });
    it('treats CBD and city as the city centre', () => {
        for (const q of ['CBD', 'city', 'Melbourne CBD', 'the city']) assert.equal(parseSearchQuery(q).city, true, q);
        assert.equal(parseSearchQuery('Carlton').city, false);
    });
});

describe('venueMatchesSearch', () => {
    const all = [southYarra, cbd, southbank, curated, noAddress];
    const hits = (q) => all.filter((x) => venueMatchesSearch(x, parseSearchQuery(q))).map((x) => x.id);
    it('matches by postcode', () => {
        assert.deepEqual(hits('3141'), ['sy']);
        assert.deepEqual(hits('3182'), ['cur']);
        assert.deepEqual(hits('3999'), []);
    });
    it('matches a suburb, alone or with its postcode', () => {
        assert.deepEqual(hits('South Yarra'), ['sy']);
        assert.deepEqual(hits('south yarra 3141'), ['sy']);
        assert.deepEqual(hits('Southbank'), ['sb']);
    });
    it('sends CBD, city and 3000 to the city centre', () => {
        assert.deepEqual(hits('CBD'), ['cbd']);
        assert.deepEqual(hits('city'), ['cbd']);
        assert.deepEqual(hits('3000'), ['cbd']);
        // A venue named "… City" still matches "city".
        assert.equal(venueMatchesSearch(v('gc', { venueName: 'Goz City', suburb: 'Carlton' }), parseSearchQuery('city')), true);
    });
    it('still matches venue names and types', () => {
        assert.deepEqual(hits('becco'), ['cbd']);
        assert.deepEqual(hits('restaurant'), ['cbd']);
        assert.deepEqual(hits(''), all.map((x) => x.id));
    });
    it('uses the display-label mapper for types', () => {
        assert.equal(venueMatchesSearch(v('x', { vibe: 'cafe_restaurant' }), parseSearchQuery('cafe'), () => 'Cafe'), true);
    });
});

describe('needsPlaceLookup', () => {
    it('only looks a search up when nothing matched and it looks like a place', () => {
        assert.equal(needsPlaceLookup(parseSearchQuery('Brighton'), 0), true);
        assert.equal(needsPlaceLookup(parseSearchQuery('3186'), 0), true);
        assert.equal(needsPlaceLookup(parseSearchQuery('Brighton'), 3), false);
        assert.equal(needsPlaceLookup(parseSearchQuery('ab'), 0), false);
        assert.equal(needsPlaceLookup(parseSearchQuery('cafe 42!'), 0), false);
        assert.equal(needsPlaceLookup(parseSearchQuery('CBD'), 0), false);
        assert.equal(needsPlaceLookup(null, 0), false);
    });
});

describe('placeLookupUrl / parsePlaceResponse', () => {
    it('asks Mapbox for places in greater Melbourne only', () => {
        const url = new URL(placeLookupUrl('Brighton', 'pk.test'));
        assert.equal(url.origin + url.pathname, 'https://api.mapbox.com/search/geocode/v6/forward');
        assert.equal(url.searchParams.get('q'), 'Brighton');
        assert.equal(url.searchParams.get('country'), 'au');
        assert.equal(url.searchParams.get('bbox'), '144.5,-38.2,145.5,-37.5');
        assert.equal(url.searchParams.get('limit'), '1');
        assert.equal(url.searchParams.get('access_token'), 'pk.test');
    });
    it('reads the first place and rejects anything without coordinates', () => {
        const json = { features: [{ geometry: { coordinates: [144.99, -37.91] }, properties: { name: 'Brighton' } }] };
        assert.deepEqual(parsePlaceResponse(json), { name: 'Brighton', lng: 144.99, lat: -37.91 });
        const pc = { features: [{ geometry: { coordinates: [145.0, -37.9] }, properties: { name: '3186', place_formatted: 'Brighton, Victoria, Australia' } }] };
        assert.equal(parsePlaceResponse(pc).name, '3186 Brighton');
        assert.equal(parsePlaceResponse({ features: [] }), null);
        assert.equal(parsePlaceResponse({ features: [{ geometry: { coordinates: ['x', 1] } }] }), null);
        assert.equal(parsePlaceResponse(null), null);
    });
});

describe('venuesNearPlace', () => {
    // ~1 km steps east of the place along the same latitude.
    const place = { name: 'Here', lat: -37.8, lng: 145.0 };
    const at = (id, km) => ({ id, lat: -37.8, lng: 145.0 + km / 88.0 });
    it('uses the smallest radius that has venues', () => {
        assert.deepEqual([...venuesNearPlace([at('a', 1), at('b', 2.5)], place).ids], ['a']);
        assert.equal(venuesNearPlace([at('a', 1)], place).radiusM, NEARBY_RADII_M[0]);
        const wider = venuesNearPlace([at('b', 2.5), at('c', 5)], place);
        assert.equal(wider.radiusM, 3000);
        assert.deepEqual([...wider.ids], ['b']);
    });
    it('returns nothing beyond the largest radius or without a place', () => {
        assert.equal(venuesNearPlace([at('far', 20)], place).ids.size, 0);
        assert.equal(venuesNearPlace([at('a', 1)], null).ids.size, 0);
        assert.equal(venuesNearPlace([{ id: 'nolat' }], place).ids.size, 0);
    });
});

describe('placeCountLabel', () => {
    it('says where and how far', () => {
        assert.equal(placeCountLabel(8, { name: 'Brighton' }, 3000), '8 venues near Brighton (within 3 km)');
        assert.equal(placeCountLabel(1, { name: 'Elsternwick' }, 1500), '1 venue near Elsternwick (within 1.5 km)');
        assert.equal(placeCountLabel(0, null, null), '0 venues nearby');
    });
});

describe('placeVenuesInText', () => {
    const north = v('nm', { venueName: 'Auction Rooms', suburb: 'North Melbourne', address: '103 Errol St North Melbourne VIC 3051' });
    const all = [southYarra, cbd, southbank, curated, north, v('m', { suburb: 'Melbourne', address: '1 St Kilda Rd Melbourne VIC 3004' })];
    const ids = (t) => placeVenuesInText(t, all).venues.map((x) => x.id);
    it('finds venues for a postcode, suburb or the city', () => {
        assert.deepEqual(ids('anything sunny near 3141?'), ['sy']);
        assert.deepEqual(ids('Sunset drinks in South Yarra please'), ['sy']);
        assert.deepEqual(ids('coffee in the CBD'), ['cbd']);
        assert.equal(placeVenuesInText('3141', all).label, '3141');
        assert.equal(placeVenuesInText('south yarra', all).label, 'South Yarra');
    });
    it('prefers the longer suburb and ignores plain "Melbourne"', () => {
        assert.deepEqual(ids('lunch in north melbourne'), ['nm']);
        assert.deepEqual(ids('somewhere sunny in melbourne'), []);
    });
    it('returns nothing for no place, an unknown postcode or no venues', () => {
        assert.deepEqual(placeVenuesInText('where is sunny now?', all), { label: null, venues: [] });
        assert.deepEqual(ids('near 3999'), []);
        assert.deepEqual(placeVenuesInText('South Yarra', []), { label: null, venues: [] });
    });
    it('caps the list', () => {
        const many = Array.from({ length: 30 }, (_, i) => v(`c${i}`, { suburb: 'CBD' }));
        assert.equal(placeVenuesInText('cbd', many, 15).venues.length, 15);
    });
});

describe('forgiving search', () => {
    const grilld = v('g', { venueName: "Grill'd (QV)", suburb: 'CBD', typeLabel: 'Restaurant' });
    const mork = v('m', { venueName: 'Mörk Chocolate Brew House', suburb: 'North Melbourne' });
    const williams = v('w', { venueName: 'Williams Bar & Café', suburb: 'Fitzroy', typeLabel: 'Cocktail & wine bar' });
    const wonderland = v('wl', { venueName: 'Wonderland Bar', suburb: 'Windsor' });
    const all = [grilld, mork, williams, wonderland];
    const hits = (q, opts) => all.filter(x => venueMatchesSearch(x, parseSearchQuery(q), undefined, opts)).map(x => x.id);

    it('ignores apostrophes (including the curly ones iOS types), accents and "&"', () => {
        assert.deepEqual(hits('grilld'), ['g']);
        assert.deepEqual(hits('Grill’d'), ['g']);
        assert.deepEqual(hits('mork'), ['m']);
        assert.deepEqual(hits('bar and cafe'), ['w']);
        assert.deepEqual(hits('wine bar'), ['w'], 'the type label shown on the list row counts too');
    });

    it('falls back to close spellings only when nothing matches as typed', () => {
        const mode = q => searchMatchMode(all, parseSearchQuery(q));
        assert.deepEqual(mode('wonderland'), { fuzzy: false, count: 1 });
        assert.deepEqual(mode('wonderlnad'), { fuzzy: true, count: 1 });
        assert.deepEqual(hits('wonderlnad', { fuzzy: true }), ['wl']);
        assert.deepEqual(mode('fitzory'), { fuzzy: true, count: 1 });
        assert.deepEqual(mode('brighton'), { fuzzy: false, count: 0 }, 'a real place with no venues still goes to the place lookup');
        assert.equal(needsPlaceLookup(parseSearchQuery('brighton'), mode('brighton').count), true);
        assert.deepEqual(mode('wnd'), { fuzzy: false, count: 0 }, 'too short to guess');
        assert.deepEqual(mode('3999'), { fuzzy: false, count: 0 });
        assert.deepEqual(mode(''), { fuzzy: false, count: 0 });
    });
});
