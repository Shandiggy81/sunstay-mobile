import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapHomeSummary } from './mapHomeSummary.js';

test('home count uses the same rounded full-sun threshold as pins', () => {
    assert.deepEqual(mapHomeSummary([100, 75, 74.6, 74, 50, 0, null]), { total: 7, known: 6, fullSun: 3 });
});
test('unknown scores and empty listings make no full-sun claim', () => {
    assert.deepEqual(mapHomeSummary([null, undefined, NaN, Infinity]), { total: 4, known: 0, fullSun: 0 });
    assert.deepEqual(mapHomeSummary([]), { total: 0, known: 0, fullSun: 0 });
});
test('night says after dark instead of a zero full-sun count', async () => {
    const { homeSunClause } = await import('./mapHomeSummary.js');
    const summary = mapHomeSummary([0, 0, 0]);
    assert.equal(homeSunClause(summary, 'night'), 'after dark');
    assert.equal(homeSunClause(summary, 'clear'), '0 in full sun');
    assert.equal(homeSunClause(mapHomeSummary([100, 80]), null), '2 in full sun');
    assert.equal(homeSunClause(mapHomeSummary([null]), 'night'), null);
});
