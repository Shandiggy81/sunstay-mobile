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
