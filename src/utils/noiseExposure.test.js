import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNoise, noiseLabel } from './noiseExposure.js';
const venue = { noiseProfile: { source: 'main road', baselineDb: 62, peakHours: [[7, 9], [16, 19]], peakDb: 72, weekendOffsetDb: -3, note: 'Faces Punt Road' } };
const at = hour => new Date(Date.UTC(2026, 9, 14, hour - 11)); // Wed, Melbourne daylight time.

test('noise estimates peak and off-peak hours in the venue timezone', () => {
    const peak = estimateNoise(venue, at(8)), quiet = estimateNoise(venue, at(12));
    assert.equal(peak.db, 72);assert.equal(peak.label, 'Loud');assert.equal(peak.peak, true);
    assert.equal(quiet.db, 62);assert.equal(quiet.label, 'Busy');assert.equal(quiet.peak, false);
    assert.equal(estimateNoise(venue, at(9)).peak, false);assert.equal(estimateNoise(venue, at(16)).peak, true);
    assert.equal(peak.note, 'Faces Punt Road');
});
test('Saturday peak adds -3 dB to 72 dB and follows the venue-local weekday', () => {
    const saturdayMelbourne = new Date('2026-10-16T20:00Z'); // Sat 7am local.
    const result = estimateNoise(venue, saturdayMelbourne);
    assert.equal(result.db, 69);assert.equal(result.label, 'Busy');
    assert.equal(estimateNoise({ ...venue, timeZone: 'UTC' }, saturdayMelbourne).db, 62);
});

test('a +4 dB nightlife offset increases weekend noise and leaves weekdays unchanged', () => {
    const nightlife = { noiseProfile: { source: 'nightlife', baselineDb: 58, peakHours: [[22, 24]], peakDb: 66, weekendOffsetDb: 4 } };
    assert.equal(estimateNoise(nightlife, at(23)).db, 66);
    const saturday = estimateNoise(nightlife, new Date('2026-10-17T12:00Z'));
    assert.equal(saturday.db, 70);assert.equal(saturday.label, 'Loud');
    assert.equal(estimateNoise(nightlife, new Date('2026-10-18T12:00Z')).db, 70, 'Sunday also receives the offset');
});

test('legacy weekend factors become logarithmic offsets and explicit offsets take precedence', () => {
    const { weekendOffsetDb, ...legacy } = venue.noiseProfile;
    const saturday = new Date('2026-10-16T20:00Z');
    const result = estimateNoise({ noiseProfile: { ...legacy, weekendFactor: 0.8 } }, saturday);
    assert.equal(result.db, 71);assert.equal(result.label, 'Loud');
    assert.equal(estimateNoise({ noiseProfile: { ...legacy, weekendFactor: 2 } }, saturday).db, 75);
    assert.equal(estimateNoise({ noiseProfile: { ...legacy, weekendFactor: 0.8, weekendOffsetDb: -3 } }, saturday).db, 69);
    assert.equal(estimateNoise({ noiseProfile: { ...legacy, weekendFactor: 0.1, weekendOffsetDb: 0 } }, saturday).db, 72);
});

test('weekend offsets are clamped to -15…+15 dB, including legacy conversions', () => {
    const saturday = new Date('2026-10-16T20:00Z');
    for (const [offset, expected] of [[-50, 57], [50, 87], [-15, 57], [15, 87]]) {
        const profile = { ...venue.noiseProfile, weekendOffsetDb: offset };
        assert.equal(estimateNoise({ noiseProfile: profile }, saturday).db, expected);
        assert.equal(estimateNoise({ noiseProfile: profile }, at(8)).db, 72);
    }
    for (const [factor, expected] of [[1e-10, 57], [1e10, 87]]) {
        assert.equal(estimateNoise({ noiseProfile: { ...venue.noiseProfile, weekendOffsetDb: undefined, weekendFactor: factor } }, saturday).db, expected);
    }
});

test('invalid legacy factors and missing/invalid offsets leave noise finite and unadjusted', () => {
    const saturday = new Date('2026-10-16T20:00Z');
    for (const value of [0, -1, null, undefined, NaN, Infinity, 'bad']) {
        assert.equal(estimateNoise({ noiseProfile: { ...venue.noiseProfile, weekendOffsetDb: undefined, weekendFactor: value } }, saturday).db, 72);
    }
    for (const value of [null, undefined, NaN, Infinity, 'bad']) {
        assert.equal(estimateNoise({ noiseProfile: { ...venue.noiseProfile, weekendOffsetDb: value } }, saturday).db, 72);
    }
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
