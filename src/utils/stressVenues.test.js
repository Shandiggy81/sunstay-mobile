import test from 'node:test';
import assert from 'node:assert/strict';
import { STRESS_MAX, stressCount, stressVenues } from './stressVenues.js';

test('stressCount reads ?stress=N and ignores anything else', () => {
    assert.equal(stressCount('?stress=1000'), 1000);
    assert.equal(stressCount('?a=1&stress=250'), 250);
    assert.equal(stressCount('?stress=99999'), STRESS_MAX);
    for (const search of ['', '?stress=', '?stress=0', '?stress=-5', '?stress=abc', null, undefined]) {
        assert.equal(stressCount(search), 0, String(search));
    }
});

test('stressVenues builds the requested number of distinct CBD venues', () => {
    const venues = stressVenues(1000);
    assert.equal(venues.length, 1000);
    assert.equal(new Set(venues.map((v) => v.id)).size, 1000);
    for (const v of venues) {
        assert.ok(v.lat > -37.826 && v.lat < -37.804, `${v.id} lat`);
        assert.ok(v.lng > 144.949 && v.lng < 144.976, `${v.id} lng`);
        assert.ok(v.venueName && v.emoji && v.typeCategory);
    }
});

test('about 60% carry a 36-sector horizon so sun moments have work to do', () => {
    const venues = stressVenues(1000);
    const withHorizon = venues.filter((v) => Array.isArray(v.sun_horizon_deg));
    assert.ok(withHorizon.length > 500 && withHorizon.length < 700, String(withHorizon.length));
    assert.ok(withHorizon.every((v) => v.sun_horizon_deg.length === 36));
});

test('is deterministic and bounded', () => {
    assert.deepEqual(stressVenues(25), stressVenues(25));
    assert.equal(stressVenues(0).length, 0);
    assert.equal(stressVenues(-3).length, 0);
    assert.equal(stressVenues(STRESS_MAX + 10).length, STRESS_MAX);
});
