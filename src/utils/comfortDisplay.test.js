import test from 'node:test';
import assert from 'node:assert/strict';
import { compassPoint, noiseStepIndex, formatNoiseSource, formatCompactGuestWindows, timelineSegments, timelineTicks, timelineMarker } from './comfortDisplay.js';

test('16-point compass labels wrap north and do not invent a missing direction', () => {
    for (const [degrees, point] of [[0, 'N'], [360, 'N'], [337.5, 'NNW'], [90, 'E'], [180, 'S'], [-22.5, 'NNW'], [720, 'N'], [11.24, 'N'], [11.25, 'NNE']]) {
        assert.equal(compassPoint(degrees), point);
    }
    for (const missing of [null, undefined, '', NaN, Infinity, 'unknown']) assert.equal(compassPoint(missing), null);
});

test('noise meter highlights the known step and leaves unknown data hidden', () => {
    ['Quiet', 'Conversational', 'Busy', 'Loud'].forEach((label, index) => assert.equal(noiseStepIndex(label), index));
    assert.equal(noiseStepIndex('Unknown'), null);
    assert.equal(noiseStepIndex(null), null);
    assert.equal(formatNoiseSource('main road'), 'Main road');
    assert.equal(formatNoiseSource(null), '');
});

const start = new Date('2026-10-13T13:00Z'), end = new Date('2026-10-14T13:00Z');
test('compact guest windows share suffixes without dropping venue timezone or next-day annotations', () => {
    const windows = [{ start: new Date('2026-10-13T19:42Z'), end: new Date('2026-10-13T23:00Z') }];
    assert.equal(formatCompactGuestWindows(windows, 'Australia/Melbourne', 'Australia/Melbourne'), '6:42–10:00am');
    assert.equal(formatCompactGuestWindows(windows, 'Australia/Melbourne', 'America/Los_Angeles'), '6:42–10:00am AEDT');
    assert.equal(formatCompactGuestWindows([{ start: windows[0].start, end: new Date('2026-10-14T02:07Z') }], 'Australia/Melbourne', 'Australia/Melbourne'), '6:42am–1:07pm');
    assert.match(formatCompactGuestWindows([{ start: new Date('2026-10-14T12:30Z'), end: new Date('2026-10-14T13:30Z') }], 'Australia/Melbourne', 'Australia/Melbourne'), /11:30pm–12:30am \(next day\)/);
    assert.equal(formatCompactGuestWindows([{ start: new Date('2026-04-04T15:45Z'), end: new Date('2026-04-04T16:15Z') }], 'Australia/Melbourne', 'America/Los_Angeles'), '2:45am AEDT–2:15am AEST');
});
test('timeline preserves multiple windows, clips day boundaries and ignores empty/invalid windows', () => {
    assert.deepEqual(timelineSegments([
        { start: '2026-10-13T12:00Z', end: '2026-10-13T19:00Z' },
        { start: '2026-10-14T01:00Z', end: '2026-10-14T07:00Z' },
        { start: end, end: '2026-10-14T14:00Z' },
        { start: 'invalid', end },
    ], start, end), [{ left: 0, width: 25 }, { left: 50, width: 25 }]);
    assert.deepEqual(timelineSegments([], start, end), []);
    assert.deepEqual(timelineSegments([], end, start), []);
    assert.deepEqual(timelineSegments([], null, end), []);
});

test('now marker is only visible within the selected day, including midnight', () => {
    assert.equal(timelineMarker(start, start, end), 0);
    assert.equal(timelineMarker('2026-10-14T01:00Z', start, end), 50);
    assert.equal(timelineMarker(end, start, end), null);
    assert.equal(timelineMarker('2026-10-13T12:00Z', start, end), null);
    assert.equal(timelineMarker(null, start, end), null);
});

test('venue clock ticks and sun segments stay aligned on normal, 23-hour and 25-hour days', () => {
    const original = process.env.TZ;
    try {
        for (const zone of ['UTC', 'America/Los_Angeles']) {
            process.env.TZ = zone;
            for (const [from, to, hours, sixElapsed] of [
                [start, end, 24, 6],
                ['2026-10-03T14:00Z', '2026-10-04T13:00Z', 23, 5],
                ['2026-04-04T13:00Z', '2026-04-05T14:00Z', 25, 7],
            ]) {
                const ticks = timelineTicks(from, to, 'Australia/Melbourne');
                assert.deepEqual(timelineTicks(from, to), ticks, 'Default ticks also use the venue default, never the browser timezone');
                assert.deepEqual(ticks.map(t => t.label), ['12am', '6am', '12pm', '6pm', '12am']);
                assert.ok(Math.abs(ticks[1].left - sixElapsed / hours * 100) < 0.002);
                assert.ok(Math.abs(ticks[2].left - (sixElapsed + 6) / hours * 100) < 0.002);
                const six = new Date(new Date(from).getTime() + sixElapsed * 3600000);
                const seven = new Date(six.getTime() + 3600000);
                const segment = timelineSegments([{ start: six, end: seven }], from, to)[0];
                assert.ok(Math.abs(segment.left - sixElapsed / hours * 100) < 1e-10);
                assert.ok(Math.abs(segment.width - 100 / hours) < 1e-10);
            }
        }
    } finally {
        if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
});
