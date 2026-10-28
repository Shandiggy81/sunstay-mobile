import test from 'node:test';
import assert from 'node:assert/strict';
import { searchSuggestions, MAX_VENUE_SUGGESTIONS } from './searchSuggestions.js';

const venues = [
    { id: 'dv-01', venueName: 'Wonderland Bar', suburb: 'Windsor', typeLabel: 'Bar' },
    { id: 'dv-12', venueName: 'Railway Hotel (Windsor)', suburb: 'Windsor', typeLabel: 'Pub' },
    { id: 'u', venueName: 'Union Hotel', suburb: 'Windsor', typeLabel: 'Pub' },
    { id: 'w', venueName: 'The Windsor Castle', suburb: 'Windsor', typeLabel: 'Pub' },
    { id: 'wo', venueName: 'Wonder Sushi Melbourne', suburb: 'Southbank', typeLabel: 'Restaurant' },
    { id: 'r', venueName: 'The Railway Club Hotel', suburb: 'Port Melbourne', typeLabel: 'Pub' },
    { id: 'n', venueName: 'NGV International', suburb: 'Southbank', typeLabel: 'Gallery' },
];
const names = (q) => searchSuggestions(q, venues, { typeLabel: v => v.typeLabel }).venues.map(s => s.name);

test('names that start with the query lead, shorter first', () => {
    assert.deepEqual(names('wond'), ['Wonderland Bar', 'Wonder Sushi Melbourne']);
    assert.deepEqual(names('wonderland bar'), ['Wonderland Bar']);
    assert.deepEqual(names('the railway'), ['Railway Hotel (Windsor)', 'The Railway Club Hotel']);
    assert.deepEqual(names('ngv'), ['NGV International']);
});

test('word starts match anywhere in the name; mid-word matches come last', () => {
    assert.deepEqual(names('castle'), ['The Windsor Castle']);
    assert.deepEqual(names('club hot'), ['The Railway Club Hotel']);
    assert.deepEqual(names('land'), ['Wonderland Bar']);
});

test('each suggestion carries type and suburb', () => {
    const [first] = searchSuggestions('wonderland', venues, { typeLabel: v => v.typeLabel }).venues;
    assert.equal(first.venue.id, 'dv-01');
    assert.equal(first.detail, 'Bar · Windsor');
    assert.equal(searchSuggestions('wonderland', venues).venues[0].detail, 'Windsor', 'no type label');
});

test('suburbs show as places with a venue count', () => {
    assert.deepEqual(searchSuggestions('winds', venues).places, [{ label: 'Windsor', count: 4 }]);
    assert.deepEqual(searchSuggestions('south', venues).places, [{ label: 'Southbank', count: 2 }]);
    assert.deepEqual(searchSuggestions('melb', venues).places, [{ label: 'Port Melbourne', count: 1 }], 'a later word of the suburb, 3+ letters');
});

test('short, empty and odd input', () => {
    assert.deepEqual(searchSuggestions('w', venues), { venues: [], places: [] });
    assert.deepEqual(searchSuggestions('', venues), { venues: [], places: [] });
    assert.deepEqual(searchSuggestions('zzzz', venues), { venues: [], places: [] });
    assert.deepEqual(searchSuggestions('wond', null), { venues: [], places: [] });
});

test('caps at six venues and drops exact duplicates', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, venueName: `Pub ${i}`, suburb: 'Fitzroy' }));
    assert.equal(searchSuggestions('pub', many).venues.length, MAX_VENUE_SUGGESTIONS);
    const dupes = [{ id: 'a', venueName: 'Same Bar', suburb: 'Carlton' }, { id: 'b', venueName: 'Same Bar', suburb: 'Carlton' }];
    assert.equal(searchSuggestions('same', dupes).venues.length, 1);
});

test('typos still find the venue or suburb, but only when nothing matches as typed', () => {
    const venues = [
        { id: 'wl', venueName: 'Wonderland Bar', suburb: 'Windsor' },
        { id: 'ws', venueName: 'Wonder sushi Melbourne', suburb: 'CBD' },
        { id: 'pb', venueName: 'Pond Bar', suburb: 'Fitzroy' },
        { id: 'os', venueName: 'The Osborne Rooftop & Bar', suburb: 'South Yarra' },
    ];
    const names = q => searchSuggestions(q, venues).venues.map(row => row.name);
    assert.deepEqual(names('wonderlnad'), ['Wonderland Bar']);
    assert.deepEqual(names('osbourne'), ['The Osborne Rooftop & Bar']);
    assert.deepEqual(names('wond'), ['Wonderland Bar', 'Wonder sushi Melbourne'], 'exact matches win; no "Pond Bar"');
    assert.deepEqual(searchSuggestions('fitzory', venues).places, [{ label: 'Fitzroy', count: 1 }]);
    assert.deepEqual(names('xyzq'), []);
});
