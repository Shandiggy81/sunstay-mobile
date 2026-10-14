import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNoise, noiseLabel } from './noiseExposure.js';
const venue = { noiseProfile: { source: 'main road', baselineDb: 62, peakHours: [[7, 9], [16, 19]], peakDb: 70, weekendFactor: 0.8, note: 'Faces Punt Road' } };
const at = hour => new Date(Date.UTC(2026, 9, 14, hour - 11)); // Wed, Melbourne daylight time.

test('noise estimates peak and off-peak hours in the venue timezone', () => {
    const peak = estimateNoise(venue, at(8)), quiet = estimateNoise(venue, at(12));
    assert.equal(peak.db, 70);assert.equal(peak.label, 'Loud');assert.equal(peak.peak, true);
    assert.equal(quiet.db, 62);assert.equal(quiet.label, 'Busy');assert.equal(quiet.peak, false);
    assert.equal(estimateNoise(venue, at(9)).peak, false);assert.equal(estimateNoise(venue, at(16)).peak, true);
    assert.equal(peak.note, 'Faces Punt Road');
});
test('weekend factor follows the venue-local weekday, even on Friday in UTC', () => {
    const saturdayMelbourne = new Date('2026-10-16T20:00Z'); // Sat 7am local.
    const result = estimateNoise(venue, saturdayMelbourne);
    assert.equal(result.db, 56);assert.equal(result.label, 'Conversational');
    assert.equal(estimateNoise({ ...venue, timeZone: 'UTC' }, saturdayMelbourne).db, 62);
});
test('noise never uses the process/browser timezone', () => {
    const old = process.env.TZ;
    try {
        const expected = estimateNoise(venue, at(8));
        for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
            process.env.TZ = zone;assert.deepEqual(estimateNoise(venue, at(8)), expected);
        }
    } finally { if (old === undefined) delete process.env.TZ;else process.env.TZ = old; }
});
test('missing profiles, missing dB readings and invalid inputs return Unknown without guessing', () => {
    for (const input of [null, {}, { noiseProfile: {} }, { noiseProfile: { source: 'none' } },
        { noiseProfile: { source: 'bad', baselineDb: 62 } }, { ...venue, timeZone: 'Bad/Zone' }]) {
        assert.equal(estimateNoise(input, at(8)).label, 'Unknown');assert.equal(estimateNoise(input, at(8)).db, null);
    }
    assert.equal(estimateNoise(venue, new Date(NaN)).label, 'Unknown');
});
test('noise labels use clear dB boundaries and midnight-crossing nightlife peaks work', () => {
    assert.deepEqual([49, 50, 59, 60, 69, 70].map(noiseLabel), ['Quiet', 'Conversational', 'Conversational', 'Busy', 'Busy', 'Loud']);
    const nightlife = { noiseProfile: { source: 'nightlife', baselineDb: 45, peakHours: [[22, 2]], peakDb: 72 } };
    assert.equal(estimateNoise(nightlife, at(23)).label, 'Loud');assert.equal(estimateNoise(nightlife, at(1)).label, 'Loud');
    assert.equal(estimateNoise(nightlife, at(2)).label, 'Quiet');
});
