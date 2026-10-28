import test from 'node:test';
import assert from 'node:assert/strict';
import { venueAccessFacts, accessSourceLine } from './venueAccess.js';

const texts = venue => venueAccessFacts(venue).facts.map(f => f.text);

test('unknown is never shown as "no"', () => {
    assert.deepEqual(venueAccessFacts({}), { facts: [], source: null, verifiedAt: null });
    assert.deepEqual(venueAccessFacts(null), { facts: [], source: null, verifiedAt: null });
    assert.deepEqual(texts({ access_step_free_entry: null, access_lift: null, access_accessible_toilet: null }), []);
});

test('a fully described venue reads in plain English', () => {
    const osborne = {
        access_step_free_entry: true, access_lift: true, access_lift_floors: 'every floor including the rooftop',
        access_accessible_toilet: true, access_accessible_toilet_floor: 'ground floor',
        access_toilet_level: 'same floor', access_toilet_distance_m: 12,
        access_source: 'sunstay_visit', access_verified_at: '2026-10-22T05:00:00Z',
    };
    const result = venueAccessFacts(osborne);
    assert.deepEqual(result.facts.map(f => [f.icon, f.text, f.tone]), [
        ['ramp', 'Step-free entry', 'good'],
        ['lift', 'Lift to every floor including the rooftop', 'good'],
        ['wheelchair', 'Accessible toilet (ground floor)', 'good'],
        ['toilet', 'Nearest toilet on the same floor, about 10 m from the bar', 'good'],
    ]);
    assert.equal(accessSourceLine(result), 'Checked by SunStay, Oct 2026');
});

test('stairs and missing facilities are heads-ups, with exact counts', () => {
    assert.deepEqual(venueAccessFacts({ access_step_free_entry: false, access_entry_steps: 3 }).facts[0],
        { key: 'entry', icon: 'stairs', text: '3 steps at the entry', tone: 'heads-up' });
    assert.deepEqual(texts({ access_entry_steps: 1 }), ['1 step at the entry']);
    assert.deepEqual(texts({ access_entry_steps: 0 }), ['Step-free entry']);
    assert.deepEqual(texts({ access_step_free_entry: false }), ['Steps at the entry']);
    assert.deepEqual(texts({ access_lift: false }), ['No lift']);
    assert.deepEqual(texts({ access_lift: false, access_lift_floors: 'ground and level 1' }), ['Lift to ground and level 1 only']);
    assert.deepEqual(texts({ access_stairs_only_areas: 'Rooftop bar' }), ['Stairs only to: Rooftop bar']);
    assert.deepEqual(texts({ access_accessible_toilet: false }), ['No accessible toilet']);
    const upstairs = venueAccessFacts({ access_toilet_level: 'upstairs' }).facts[0];
    assert.equal(upstairs.text, 'Nearest toilet upstairs');
    assert.equal(upstairs.tone, 'heads-up');
    assert.deepEqual(texts({ access_toilet_distance_m: 2 }), ['Nearest toilet about 5 m from the bar']);
    assert.deepEqual(texts({ access_toilet_level: 'basement' }), [], 'unknown level values are ignored');
});

test('a listing tag is labelled as unconfirmed and declared facts win over it', () => {
    const tagged = venueAccessFacts({ tags: ['Wheelchair Accessible', 'Rooftop'] });
    assert.deepEqual(tagged.facts.map(f => f.text), ['Listed as wheelchair accessible']);
    assert.equal(accessSourceLine(tagged), 'From the venue listing, not yet confirmed');
    assert.deepEqual(texts({ tags: ['Wheelchair Accessible'], access_lift: false }), ['No lift']);
});

test('source line', () => {
    assert.equal(accessSourceLine({ source: 'venue', verifiedAt: '2026-11-03T00:00:00Z' }), 'Confirmed by the venue, Nov 2026');
    assert.equal(accessSourceLine({ source: 'venue', verifiedAt: null }), 'Confirmed by the venue');
    assert.equal(accessSourceLine({ source: null, verifiedAt: null }), 'Venue access details');
    assert.equal(venueAccessFacts({ access_lift: true, access_verified_at: 'not a date' }).verifiedAt, null);
});

test('every fact icon is a clay icon in the set', async () => {
    const { readdirSync } = await import('node:fs');
    const clay = new Set(readdirSync(new URL('../assets/clay/', import.meta.url)).map(f => f.replace(/\.webp$/, '')));
    const all = venueAccessFacts({ access_step_free_entry: false, access_entry_steps: 2, access_lift: true, access_stairs_only_areas: 'Rooftop',
        access_accessible_toilet: true, access_toilet_level: 'upstairs' }).facts
        .concat(venueAccessFacts({ access_step_free_entry: true }).facts, venueAccessFacts({ tags: ['Wheelchair Accessible'] }).facts);
    for (const fact of all) assert.ok(clay.has(fact.icon), `${fact.icon} missing from src/assets/clay`);
});
