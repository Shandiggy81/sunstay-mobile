import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLruCache, rowSunAxis, rowSunDay, rowSunKey, rowSunLine } from './cafeRowSun.js';
import { outdoorSunDay } from './sunMoments.js';
import { cardSunWindows, roundedSunDay } from './sunWindowsCard.js';
import { layoutSunWindows } from './sunWindowsGraph.js';

const TIMEZONE = 'Australia/Melbourne';
// Lane's Edge Cafe's stored horizon (production, buildings_horizon_raycast_v3).
const LANES_EDGE = {
    lat: -37.8117941138371,
    lng: 144.971975063774,
    horizon: [34.7326, 32.1169, 22.3617, 18.5403, 8.49832, 9.30128, 9.49426, 24.4819, 34.7668, 54.3019, 62.017, 66.6393,
        69.5238, 71.3298, 72.3924, 72.881, 72.8667, 72.3474, 71.2473, 69.3898, 66.4264, 61.6707, 59.8197, 53.1724,
        19.5493, 0, 6.52933, 6.60939, 21.196, 28.8492, 33.6279, 16.017, 18.6712, 22.3506, 17.5004, 22.439],
};
const input = { ...LANES_EDGE, date: '2026-10-20', timeZone: TIMEZONE };

describe('rowSunDay', () => {
    it('matches the café detail card headline exactly', () => {
        const row = rowSunDay(input);
        // The detail card: roundedSunDay(outdoorSunDay) → cardSunWindows → layoutSunWindows.
        const detail = layoutSunWindows(cardSunWindows(roundedSunDay(outdoorSunDay(input))));
        assert.equal(row.totalMinutes, detail.totalMinutes);
        assert.equal(row.totalLabel, detail.totalLabel);
        assert.equal(row.windowCount, detail.windowCount);
        assert.deepEqual(row.sun, cardSunWindows(roundedSunDay(outdoorSunDay(input))));
    });

    it('gives Lane\'s Edge Cafe 10h 24m on 20 Oct 2026 (9:00am–7:04pm + 7:18pm–7:38pm)', () => {
        const row = rowSunDay(input);
        assert.equal(row.totalLabel, '10h 24m');
        assert.equal(row.windowCount, 2);
        assert.equal(rowSunLine(row), '10h 24m sun today');
    });

    it('says no direct sun for a fully shaded spot and null without a horizon', () => {
        const shaded = rowSunDay({ ...input, horizon: Array.from({ length: 36 }, () => 85) });
        assert.equal(shaded.windowCount, 0);
        assert.equal(rowSunLine(shaded), 'No direct sun today');
        assert.equal(rowSunDay({ ...input, horizon: null }), null);
        assert.equal(rowSunDay({ ...input, horizon: [1, 2, 3] }), null);
        assert.equal(rowSunDay({ ...input, lat: 'x' }), null);
        assert.equal(rowSunLine(null), null);
    });
});

describe('rowSunKey / createLruCache', () => {
    it('keys by venue and date', () => {
        assert.equal(rowSunKey('clue-1', '2026-10-20'), 'clue-1|2026-10-20');
        assert.notEqual(rowSunKey('clue-1', '2026-10-20'), rowSunKey('clue-1', '2026-10-21'));
    });

    it('evicts the least recently used entry', () => {
        const cache = createLruCache(2);
        cache.set('a', 1);
        cache.set('b', 2);
        assert.equal(cache.get('a'), 1); // a is now most recent
        cache.set('c', 3);
        assert.equal(cache.get('b'), undefined);
        assert.equal(cache.get('a'), 1);
        assert.equal(cache.get('c'), 3);
        assert.equal(cache.size, 2);
        cache.set('a', 10);
        assert.equal(cache.get('a'), 10);
    });
});

describe('rowSunAxis', () => {
    it('spans sunrise to sunset, the same for every café on the day, with every window inside', () => {
        const lanes = rowSunDay(input);
        const open = rowSunDay({ ...input, horizon: Array.from({ length: 36 }, () => 0) });
        const axis = rowSunAxis(lanes.sun);
        assert.deepEqual(axis, { axisStart: lanes.sun.sunrise, axisEnd: lanes.sun.sunset });
        assert.deepEqual(rowSunAxis(open.sun), axis);
        for (const w of [...lanes.sun.windows, ...open.sun.windows]) {
            assert.ok(w.start >= axis.axisStart && w.end <= axis.axisEnd);
        }
        const shown = layoutSunWindows({ ...lanes.sun, ...axis });
        assert.equal(shown.clippedByAxis, false);
        assert.equal(shown.totalMinutes, lanes.totalMinutes);
    });

    it('is empty without usable sun times', () => {
        assert.deepEqual(rowSunAxis(null), {});
        assert.deepEqual(rowSunAxis({ sunrise: null, sunset: 5 }), {});
        assert.deepEqual(rowSunAxis({ sunrise: 10, sunset: 5 }), {});
    });
});
