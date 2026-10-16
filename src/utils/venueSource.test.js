import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUE_DATASET_URL, OSM_COPYRIGHT_URL, venueSourceNote } from './venueSource.js';

test('curated venues show no source note', () => {
    for (const venue of [null, undefined, {}, { data_source: null }, { data_source: 'other' }]) {
        assert.equal(venueSourceNote(venue), null);
    }
});

test('City of Melbourne venues credit the council and show their seat count', () => {
    const note = venueSourceNote({ data_source: 'clue', outdoor_seats: 54 });
    assert.equal(note.seats, '54 outdoor seats (council count)');
    assert.match(note.credit, /City of Melbourne/);
    assert.match(note.credit, /CC BY 4\.0/);
    assert.match(note.credit, /OpenStreetMap/);
    assert.match(note.credit, /Not yet verified/);
    assert.deepEqual(note.links.map((l) => l.url), [CLUE_DATASET_URL, OSM_COPYRIGHT_URL]);
    assert.match(note.links[1].label, /OpenStreetMap/);
});

test('seat count is singular for one and hidden when missing', () => {
    assert.equal(venueSourceNote({ data_source: 'clue', outdoor_seats: 1 }).seats, '1 outdoor seat (council count)');
    for (const outdoor_seats of [null, undefined, 0, -2, 'x', 2.5]) {
        assert.equal(venueSourceNote({ data_source: 'clue', outdoor_seats }).seats, null);
    }
});
