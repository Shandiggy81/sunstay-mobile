import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseName, venuesNamedInText, withNamedVenues } from './venueNameMatch.js';
import { buildSunnyContext } from './sunnyTools.js';

const venues = [
    { id: 'dv-01', venueName: 'Wonderland Bar' },
    { id: 'dv-12', venueName: 'Railway Hotel (Windsor)' },
    { id: 'dv-18', venueName: 'The Corner Hotel' },
    { id: 'osb', venueName: 'The Osborne Rooftop & Bar' },
    { id: 'dick', venueName: 'Dick Whittington Tavern' },
    { id: 'lion', venueName: 'Lion & Wombat' },
    { id: 'cafe', venueName: 'Café Lafayette' },
];
const ids = (text) => venuesNamedInText(text, venues).map(v => v.id);

test('normalises names the way people type them', () => {
    assert.equal(normaliseName('The Osborne Rooftop & Bar'), 'osborne rooftop and bar');
    assert.equal(normaliseName('Railway Hotel (Windsor)'), 'railway hotel');
    assert.equal(normaliseName('Café Lafayette'), 'cafe lafayette');
});

test('finds the venue the guest named, anywhere in the app', () => {
    assert.deepEqual(ids('Wonderland bar'), ['dv-01']);
    assert.deepEqual(ids('is wonderland sunny?'), ['dv-01']);
    assert.deepEqual(ids("how's the railway hotel looking"), ['dv-12']);
    assert.deepEqual(ids('lion and wombat roast'), ['lion']);
    assert.deepEqual(ids('dick whittington tonight'), ['dick']);
    assert.deepEqual(ids('cafe lafayette'), ['cafe']);
});

test('common words never match a venue', () => {
    assert.deepEqual(ids('a pub on the corner near me'), []);
    assert.deepEqual(ids('sunny bar'), []);
    assert.deepEqual(ids('hi'), []);
    assert.deepEqual(venuesNamedInText('Wonderland', null), []);
    assert.deepEqual(ids('corner hotel'), ['dv-18'], 'the full name still matches');
});

test('full-name matches come first, at most three', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, venueName: 'Wonderland Bar' }));
    assert.equal(venuesNamedInText('wonderland bar', many).length, 3);
});

test('named venues reach Sunny first, even when nowhere near the map', () => {
    const focus = { label: 'Windsor', venues: [{ id: 'x' }, { id: 'dv-01' }], asked: [], amenityMatches: null };
    assert.deepEqual(withNamedVenues(focus, [venues[0]]).venues.map(v => v.id), ['dv-01', 'x']);
    assert.equal(withNamedVenues(focus, []), focus);
    assert.deepEqual(withNamedVenues(null, [venues[0]]).venues.map(v => v.id), ['dv-01']);
    // 40 other venues are in view; Wonderland isn't, and still leads the context.
    const inView = Array.from({ length: 45 }, (_, i) => ({ id: `v${i}`, name: `Venue ${i}`, lat: -37.8, lng: 144.96 }));
    const ctx = buildSunnyContext({
        visibleById: inView,
        venues: [...inView, { ...venues[0], lat: -37.8546, lng: 144.9925 }],
        place: withNamedVenues(null, venuesNamedInText('Wonderland bar', [{ ...venues[0], lat: -37.8546, lng: 144.9925 }])),
    });
    assert.equal(ctx.visibleVenues[0].id, 'dv-01');
});
