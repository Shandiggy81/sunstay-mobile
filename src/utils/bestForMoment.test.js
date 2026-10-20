import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BEST_FOR_COPY, BEST_FOR_MAX_MOMENTS, BEST_FOR_MIN_SHARE, bestForMoment } from './bestForMoment.js';
import { cardSunWindows } from './sunWindowsCard.js';

const DATE = '2026-10-14';
const at = (time) => `${DATE}T${time}:00+11:00`;
const sun = (windows, extra = {}) => ({
    windows: windows.map(([start, end]) => ({ start: at(start), end: at(end) })),
    date: DATE,
    timezone: 'Australia/Melbourne',
    sunset: Date.parse(at('19:40')),
    ...extra,
});

describe('bestForMoment', () => {
    it('uses café copy by default and lists picks in day order', () => {
        assert.equal(BEST_FOR_MIN_SHARE, 0.5);
        assert.equal(BEST_FOR_MAX_MOMENTS, 2);
        assert.deepEqual(bestForMoment(sun([['06:00', '10:30'], ['12:00', '14:30']])), {
            keys: ['coffee', 'lunch'],
            text: 'Best for morning coffee + a sunny lunch',
        });
    });

    it('needs at least half of a moment in sun, and half is enough', () => {
        assert.equal(bestForMoment(sun([['08:30', '10:00']])), null);
        assert.deepEqual(bestForMoment(sun([['06:00', '08:00']])).keys, ['coffee']);
    });

    it('keeps the best-covered two moments, ties going to the earlier one', () => {
        // coffee 60%, lunch 100%, afternoon 80%
        assert.deepEqual(bestForMoment(sun([['07:36', '10:00'], ['12:00', '14:30'], ['14:30', '16:30']])), {
            keys: ['lunch', 'afternoon'],
            text: 'Best for a sunny lunch + afternoon tea',
        });
        // coffee, lunch and afternoon all fully in sun
        assert.deepEqual(bestForMoment(sun([['06:00', '17:00']])).keys, ['coffee', 'lunch']);
    });

    it('reads the sunset moment from sunset, and skips it without one', () => {
        assert.deepEqual(bestForMoment(sun([['18:10', '19:40']])), { keys: ['sunset'], text: 'Best for golden-hour sun' });
        assert.equal(bestForMoment(sun([['18:10', '19:40']], { sunset: null })), null);
    });

    it('falls back to the moment titles for other venue types', () => {
        assert.equal(bestForMoment(sun([['06:00', '14:30']]), { venueType: 'bar' }).text, 'Best for morning coffee + long lunch');
        assert.equal(BEST_FOR_COPY.default.sunset, 'sunset drinks');
    });

    it('takes cardSunWindows output directly', () => {
        const card = cardSunWindows({
            date: DATE,
            timeZone: 'Australia/Melbourne',
            windows: [{ start: new Date(at('06:00')), end: new Date(at('10:30')) }],
            sunset: new Date(at('19:40')),
        });
        assert.deepEqual(bestForMoment(card).keys, ['coffee']);
    });

    it('returns null without usable input', () => {
        for (const bad of [null, undefined, {}, { ...sun([]), date: 5 }, { ...sun([]), timezone: '' }, sun([])]) {
            assert.equal(bestForMoment(bad), null);
        }
        assert.equal(bestForMoment(sun([['10:00', '09:00']])), null);
    });
});
