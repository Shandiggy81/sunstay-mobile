import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSunPath } from './sunPath.js';
import { cardinal, normalizeBearing, sunCalcAzimuthToBearing } from './compass.js';

describe('compass helpers', () => {
    it('converts SunCalc south-based azimuth to a compass bearing', () => {
        assert.equal(sunCalcAzimuthToBearing(0), 180); // due south
        assert.equal(sunCalcAzimuthToBearing(90), 270); // due west
        assert.equal(sunCalcAzimuthToBearing(-90), 90); // due east
        assert.equal(sunCalcAzimuthToBearing(66.4).toFixed(1), '246.4');
    });

    it('names 16-point directions and wraps', () => {
        assert.deepEqual(cardinal(0), { short: 'N', long: 'north' });
        assert.equal(cardinal(246).short, 'WSW');
        assert.equal(cardinal(359).short, 'N');
        assert.equal(cardinal(-90).short, 'W');
        assert.equal(normalizeBearing(720), 0);
    });

    it('rejects non-finite input', () => {
        assert.equal(cardinal(NaN), null);
        assert.equal(cardinal(undefined), null);
        assert.equal(cardinal(null), null);
        assert.equal(normalizeBearing(''), null);
        assert.equal(sunCalcAzimuthToBearing('x'), null);
    });
});

describe('buildSunPath', () => {
    // Melbourne, early afternoon local time in November (AEDT, UTC+11).
    const melb = [-37.8136, 144.9631];
    const now = new Date('2026-11-06T03:00:00Z');

    it('samples a rise-peak-set arc starting and ending on the horizon', () => {
        const path = buildSunPath(...melb, now);
        assert.ok(path);
        assert.equal(path.points[0].altitude, 0);
        assert.equal(path.points.at(-1).altitude, 0);
        const peak = Math.max(...path.points.map((p) => p.altitude));
        assert.ok(peak > 60 && peak < 80, `peak ${peak}`);
        assert.ok(Math.abs(peak - path.maxAltitude) < 1);
    });

    it('places "now" on the path and points the sun north in the southern hemisphere at midday', () => {
        const path = buildSunPath(...melb, now);
        assert.ok(path.progress > 0.4 && path.progress < 0.7, `progress ${path.progress}`);
        assert.ok(path.current.altitude > 50);
        const b = path.current.bearing;
        assert.ok(b > 270 || b < 90, `bearing ${b} should be northerly`);
    });

    it('returns null for bad coordinates', () => {
        assert.equal(buildSunPath(NaN, 144, now), null);
        assert.equal(buildSunPath(-37, 144, new Date('nope')), null);
    });

    it('returns null during polar night', () => {
        assert.equal(buildSunPath(80, 0, new Date('2026-12-21T12:00:00Z')), null);
    });
});
