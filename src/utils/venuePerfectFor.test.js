import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { venuePerfectFor } from './venuePerfectFor.js';

describe('venuePerfectFor', () => {
    it('joins only available moments in the same order as Sun moments today', () => {
        const summary = { moments: [
            { key: 'sunset', available: true },
            { key: 'lunch', available: false },
            { key: 'coffee', available: true },
            { key: 'afternoon', available: null },
        ] };
        assert.equal(venuePerfectFor(summary), 'Morning coffee · Sunset drinks');
    });

    it('includes lunch and afternoon when they get sun', () => {
        assert.equal(venuePerfectFor({ moments: [
            { key: 'lunch', available: true },
            { key: 'afternoon', available: true },
        ] }), 'Long lunch · Afternoon');
    });

    it('has no line for unavailable, shaded or missing sun data', () => {
        for (const summary of [null, undefined, {}, { moments: null }, { moments: [] }, { moments: [
            { key: 'coffee', available: false },
            { key: 'sunset', available: null },
        ] }]) {
            assert.equal(venuePerfectFor(summary), '');
        }
    });

    it('ignores unknown moments and does not treat an unknown availability as sun', () => {
        assert.equal(venuePerfectFor({ moments: [null,
            { key: 'unknown', available: true },
            { key: 'coffee', available: 'true' },
            { key: 'sunset' },
        ] }), '');
    });

    it('does not mutate the summary or duplicate repeated moments', () => {
        const summary = Object.freeze({ moments: Object.freeze([
            Object.freeze({ key: 'coffee', available: true }),
            Object.freeze({ key: 'coffee', available: true }),
        ]) });
        assert.equal(venuePerfectFor(summary), 'Morning coffee');
        assert.equal(summary.moments.length, 2);
    });
});
