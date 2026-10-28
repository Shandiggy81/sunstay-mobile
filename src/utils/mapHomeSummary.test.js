import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHomeSummary } from './mapHomeSummary.js';

test('home count uses the same rounded full-sun threshold as pins', () => {
    assert.deepEqual(mapHomeSummary([100, 75, 74.6, 74, 50, 0, null]), { total: 7, known: 6, fullSun: 3, partSun: 2 });
});
test('unknown scores and empty listings make no full-sun claim', () => {
    assert.deepEqual(mapHomeSummary([null, undefined, NaN, Infinity]), { total: 4, known: 0, fullSun: 0, partSun: 0 });
    assert.deepEqual(mapHomeSummary([]), { total: 0, known: 0, fullSun: 0, partSun: 0 });
});
test('night says after dark instead of a zero full-sun count', async () => {
    const { homeSunClause } = await import('./mapHomeSummary.js');
    const summary = mapHomeSummary([0, 0, 0]);
    assert.equal(homeSunClause(summary, 'night'), 'after dark');
    assert.equal(homeSunClause(summary, 'clear'), 'little direct sun now');
    assert.equal(homeSunClause(mapHomeSummary([100, 80]), null), '2 in full sun');
    assert.equal(homeSunClause(mapHomeSummary([null]), 'night'), null);
});

test('a patchy day leads with some sun, never "0 in full sun"', async () => {
    const { homeSunClause } = await import('./mapHomeSummary.js');
    assert.equal(homeSunClause(mapHomeSummary([60, 55, 74.4, 30]), null), '3 with some sun');
    assert.equal(homeSunClause(mapHomeSummary([90, 60]), null), '1 in full sun', 'full sun still wins');
    assert.equal(homeSunClause(mapHomeSummary(Array(1200).fill(60)), null), '1,200 with some sun');
    assert.equal(homeSunClause(mapHomeSummary([10, 49.4]), null), 'little direct sun now');
});
