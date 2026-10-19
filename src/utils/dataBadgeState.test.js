import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBadgeRefreshDelay, getBadgeState } from './dataBadgeState.js';

const NOW = Date.parse('2026-10-19T12:00:00.000Z');
const MINUTE_MS = 60_000;
const state = (overrides = {}) => getBadgeState({ kind: 'live', now: NOW, updatedAt: NOW, ...overrides });
const delay = (overrides = {}) => getBadgeRefreshDelay({ kind: 'live', now: NOW, updatedAt: NOW, ...overrides });

describe('getBadgeState live readings', () => {
    it('uses the explicit timestamp and clock to describe fresh readings', () => {
        assert.deepEqual(state(), { label: 'Live', sublabel: 'Updated just now', tone: 'live', isLive: true });
        assert.deepEqual(state({ updatedAt: NOW - 7 * MINUTE_MS - 59_999 }), {
            label: 'Live', sublabel: 'Updated 7 min ago', tone: 'live', isLive: true,
        });
    });

    it('is live through the exact default age limit and cached one millisecond later', () => {
        assert.equal(state({ updatedAt: NOW - 15 * MINUTE_MS }).isLive, true);
        assert.deepEqual(state({ updatedAt: NOW - 15 * MINUTE_MS - 1 }), {
            label: 'Cached', sublabel: 'Updated 15 min ago', tone: 'cached', isLive: false,
        });
        assert.equal(state({ updatedAt: NOW - 90 * MINUTE_MS }).sublabel, 'Updated 90 min ago');
    });

    it('honors custom, fractional and zero-minute freshness limits', () => {
        assert.equal(state({ updatedAt: NOW - 5 * MINUTE_MS, maxAgeMinutes: 5 }).isLive, true);
        assert.equal(state({ updatedAt: NOW - 5 * MINUTE_MS - 1, maxAgeMinutes: 5 }).label, 'Cached');
        assert.equal(state({ updatedAt: NOW - 30_000, maxAgeMinutes: 0.5 }).isLive, true);
        assert.equal(state({ updatedAt: NOW - 30_001, maxAgeMinutes: 0.5 }).label, 'Cached');
        assert.equal(state({ maxAgeMinutes: 0 }).isLive, true);
        assert.equal(state({ updatedAt: NOW - 1, maxAgeMinutes: 0 }).label, 'Cached');
    });

    it('never marks a reading live with an invalid freshness limit', () => {
        for (const maxAgeMinutes of [-1, NaN, Infinity, -Infinity, null, '15', {}, Number.MAX_VALUE]) {
            assert.deepEqual(state({ maxAgeMinutes }), {
                label: 'Cached', sublabel: 'Updated just now', tone: 'cached', isLive: false,
            });
        }
    });

    it('requires a real update timestamp rather than inventing a current time', () => {
        for (const updatedAt of [undefined, null, '', false, {}, [], NaN, Infinity, new Date(NaN)]) {
            assert.deepEqual(state({ updatedAt }), {
                label: 'Unavailable', sublabel: 'Update time unavailable', tone: 'unavailable', isLive: false,
            });
        }
        assert.equal(getBadgeState({ kind: 'live', now: NOW }).label, 'Unavailable');
    });

    it('requires an explicit valid clock', () => {
        for (const now of [undefined, null, '', '2026-10-19', '2026-10-19T12:00:00', NaN, {}, new Date(NaN)]) {
            assert.equal(state({ now }).label, 'Unavailable');
            assert.equal(state({ now }).isLive, false);
        }
        assert.equal(getBadgeState({ kind: 'live', updatedAt: NOW }).isLive, false);
    });

    it('rejects future timestamps even by a single millisecond', () => {
        for (const updatedAt of [NOW + 1, NOW + MINUTE_MS, '2026-10-19T12:00:00.001Z']) {
            assert.deepEqual(state({ updatedAt }), {
                label: 'Unavailable', sublabel: 'Update time is in the future', tone: 'unavailable', isLive: false,
            });
        }
    });

    it('accepts Date objects, epoch zero, milliseconds and zoned ISO instants', () => {
        const timestamp = NOW - 3 * MINUTE_MS;
        for (const updatedAt of [timestamp, new Date(timestamp), '2026-10-19T11:57:00Z', '2026-10-19T11:57Z']) {
            assert.deepEqual(state({ updatedAt }), {
                label: 'Live', sublabel: 'Updated 3 min ago', tone: 'live', isLive: true,
            });
        }
        assert.equal(getBadgeState({ kind: 'live', updatedAt: 0, now: 0 }).isLive, true);
        assert.equal(state({ now: new Date(NOW) }).isLive, true);
        assert.equal(state({ now: '2026-10-19T12:00:00Z' }).isLive, true);
    });

    it('treats timezone-equivalent timestamps identically', () => {
        const expected = state({ updatedAt: '2026-10-19T11:55:00Z' });
        for (const updatedAt of ['2026-10-19T22:55:00+11:00', '2026-10-19T04:55:00-07:00', '2026-10-20T01:55:00+14:00']) {
            assert.deepEqual(state({ updatedAt }), expected);
        }
    });

    it('rejects ambiguous local dates, invalid dates and normalized calendar overflows', () => {
        for (const updatedAt of [
            '2026-10-19', '2026-10-19T11:55:00', '2026-10-19 11:55:00',
            'October 19, 2026 11:55 UTC', 'not a date', '2026-02-30T11:55:00Z',
            '2025-02-29T11:55:00Z', '2026-13-19T11:55:00Z', '2026-00-19T11:55:00Z',
            '2026-10-00T11:55:00Z', '2026-10-19T24:00:00Z', '2026-10-19T11:60:00Z',
            '2026-10-19T11:55:60Z', '2026-10-19T11:55:00+24:00', '2026-10-19T11:55:00+11:60',
        ]) {
            assert.equal(state({ updatedAt }).label, 'Unavailable', updatedAt);
            assert.equal(state({ updatedAt }).isLive, false, updatedAt);
        }
        assert.equal(state({ updatedAt: '2024-02-29T11:55:00Z' }).label, 'Cached');
    });

    it('fails safely for missing and unknown kinds', () => {
        assert.equal(getBadgeState().label, 'Unavailable');
        for (const kind of [undefined, null, '', 'unknown', 'Live', 'cached', '__proto__', 'constructor']) {
            assert.deepEqual(state({ kind }), {
                label: 'Unavailable', sublabel: 'Data source unavailable', tone: 'unavailable', isLive: false,
            });
        }
    });

    it('does not mutate options or date inputs', () => {
        const updatedAt = new Date(NOW - MINUTE_MS);
        const now = new Date(NOW);
        const options = Object.freeze({ kind: 'live', updatedAt, now });
        assert.deepEqual(getBadgeState(options), getBadgeState(options));
        getBadgeRefreshDelay(options);
        assert.equal(updatedAt.getTime(), NOW - MINUTE_MS);
        assert.equal(now.getTime(), NOW);
    });
});

describe('getBadgeState non-live provenance', () => {
    const kinds = [
        ['forecast', 'Forecast', 'Forecast data'],
        ['calculated', 'Calculated', 'Calculated from available inputs'],
        ['estimated', 'Estimated', 'Estimated from available inputs'],
        ['demo', 'Demo', 'Sample data for demonstration'],
    ];

    for (const [kind, label, explanation] of kinds) {
        it(`preserves ${label} without a timestamp or valid clock`, () => {
            for (const updatedAt of [undefined, null, 'invalid', '2026-10-19', NOW + 1]) {
                assert.deepEqual(state({ kind, updatedAt }), { label, sublabel: explanation, tone: kind, isLive: false });
            }
            assert.deepEqual(getBadgeState({ kind }), { label, sublabel: explanation, tone: kind, isLive: false });
            assert.equal(state({ kind, now: undefined }).sublabel, explanation);
        });

        it(`can show the age of ${label} without upgrading it to Live`, () => {
            for (const ageMinutes of [0, 5, 100]) {
                const badge = state({ kind, updatedAt: NOW - ageMinutes * MINUTE_MS });
                assert.deepEqual(badge, {
                    label,
                    sublabel: ageMinutes === 0 ? 'Updated just now' : `Updated ${ageMinutes} min ago`,
                    tone: kind,
                    isLive: false,
                });
            }
        });
    }
});

describe('getBadgeRefreshDelay', () => {
    it('schedules displayed age changes at minute boundaries', () => {
        assert.equal(delay(), MINUTE_MS);
        assert.equal(delay({ updatedAt: NOW - 59_999 }), 1);
        assert.equal(delay({ updatedAt: NOW - MINUTE_MS }), MINUTE_MS);
        assert.equal(delay({ updatedAt: NOW - 16 * MINUTE_MS - 12_345 }), 47_655);
    });

    it('schedules live expiry one millisecond after its inclusive limit', () => {
        assert.equal(delay({ updatedAt: NOW - 15 * MINUTE_MS }), 1);
        assert.equal(delay({ updatedAt: NOW - 15 * MINUTE_MS + 1 }), 1);
        assert.equal(delay({ updatedAt: NOW - 15 * MINUTE_MS - 1 }), 59_999);
        assert.equal(delay({ maxAgeMinutes: 0 }), 1);
        assert.equal(delay({ maxAgeMinutes: 0.5 }), 30_001);
        assert.equal(delay({ updatedAt: NOW - 29_999, maxAgeMinutes: 0.5 }), 2);
    });

    it('reflects the correct states before and after a freshness deadline', () => {
        const options = { kind: 'live', updatedAt: NOW - 29_000, now: NOW, maxAgeMinutes: 0.5 };
        const refreshDelay = getBadgeRefreshDelay(options);
        assert.equal(refreshDelay, 1_001);
        assert.equal(getBadgeState({ ...options, now: NOW + refreshDelay - 1 }).isLive, true);
        assert.equal(getBadgeState({ ...options, now: NOW + refreshDelay }).label, 'Cached');
    });

    it('rechecks future timestamps exactly when they become current', () => {
        for (const kind of ['live', 'forecast', 'calculated', 'estimated', 'demo']) {
            const options = { kind, updatedAt: NOW + 42_123, now: NOW };
            assert.equal(getBadgeRefreshDelay(options), 42_123);
            assert.equal(getBadgeState({ ...options, now: NOW + 42_123 }).sublabel, 'Updated just now');
        }
    });

    it('uses age changes for non-live kinds, ignoring the freshness limit', () => {
        for (const kind of ['forecast', 'calculated', 'estimated', 'demo']) {
            assert.equal(delay({ kind, maxAgeMinutes: 0 }), MINUTE_MS);
            assert.equal(delay({ kind, updatedAt: NOW - 2 * MINUTE_MS - 5_000 }), 55_000);
        }
        assert.equal(delay({ maxAgeMinutes: -1 }), MINUTE_MS);
        assert.equal(delay({ maxAgeMinutes: null }), MINUTE_MS);
    });

    it('does not request updates when time cannot change the state', () => {
        assert.equal(getBadgeRefreshDelay(), null);
        for (const overrides of [
            { kind: undefined }, { kind: 'unknown' }, { kind: 'constructor' },
            { updatedAt: undefined }, { updatedAt: null }, { updatedAt: '2026-10-19' },
            { updatedAt: '2026-10-19T12:00:00' }, { updatedAt: new Date(NaN) },
            { now: undefined }, { now: NaN }, { now: '2026-10-19' },
            { kind: 'demo', updatedAt: null },
        ]) assert.equal(delay(overrides), null);
    });
});
