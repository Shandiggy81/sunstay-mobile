import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearExperience, discoveryContext, discoveryDataLabel, matchedMomentLabel, selectedExperience, selectedStayDateLabel, selectExperience } from './discoveryExperience.js';

const NOW = new Date('2026-10-18T22:00:00Z'); // Monday 19 October in Melbourne

describe('discovery experiences reuse existing filters', () => {
    it('replaces only the intent, keeping food choices and practical needs for outdoor discovery', () => {
        assert.deepEqual(selectExperience(['all-stays', 'moment-coffee', 'all-cafes', 'Wheelchair Accessible', 'Pet Friendly'], 'cozy'), {
            filters: ['all-cafes', 'Wheelchair Accessible', 'Pet Friendly', 'cozy-mode'], moment: null,
        });
    });
    it('switches to stay ranking without an impossible Cafe + Hotel combination, retaining hard needs', () => {
        const result = selectExperience(['all-cafes', 'cozy-mode', 'Wheelchair Accessible'], 'morning-stay');
        assert.deepEqual(result, { filters: ['Wheelchair Accessible', 'all-stays'], moment: 'coffee' });
        assert.equal(selectedExperience(result.filters, result.moment), 'morning-stay');
        assert.equal(selectedExperience(result.filters, 'most'), 'sunny-stay');
    });
    it('does not claim an exact preset for a custom combination or clear practical requirements', () => {
        assert.equal(selectedExperience(['cozy-mode', 'moment-sunset'], 'coffee'), null);
        assert.deepEqual(clearExperience(['cozy-mode', 'moment-sunset', 'Wheelchair Accessible']), ['Wheelchair Accessible']);
        assert.throws(() => selectExperience(['Pet Friendly'], 'unknown'), RangeError);
    });
    it('shows a moment match only when all selected moments are confirmed by the existing result', () => {
        assert.equal(matchedMomentLabel(null, ['moment-sunset']), null);
        assert.equal(matchedMomentLabel(['coffee'], ['moment-coffee', 'moment-sunset']), null);
        assert.equal(matchedMomentLabel(['sunset'], ['moment-sunset']).text, 'Potential sunset drinks · today');
    });
});

describe('discovery date and source context', () => {
    it('uses the Melbourne calendar day and human date labels', () => {
        assert.equal(selectedStayDateLabel(null, NOW), 'Today · Mon 19 Oct');
        assert.equal(selectedStayDateLabel('tomorrow', NOW), 'Tomorrow · Tue 20 Oct');
        assert.equal(selectedStayDateLabel('saturday', NOW), 'This Saturday · Sat 24 Oct');
        assert.equal(selectedStayDateLabel('2026-10-22', NOW), 'Thu 22 Oct');
        assert.equal(selectedStayDateLabel('2026-02-31', NOW), 'Choose a date');
    });
    it('distinguishes stay-date ranking, whole moments and the existing map time preview', () => {
        assert.equal(discoveryContext({ filters: ['all-stays'], moment: 'most', date: 'tomorrow', now: NOW }), 'Tomorrow · Tue 20 Oct · Most sun · Melbourne time');
        assert.equal(discoveryContext({ filters: ['moment-sunset'] }), 'Today · Sunset drinks · Melbourne time');
        assert.equal(discoveryContext({ todMinutes: 16 * 60 }), 'Today · Map preview 4pm · Melbourne time');
    });
    it('labels samples, loading, refresh failure and unavailable weather without invented freshness or verification', () => {
        assert.match(discoveryDataLabel({ source: 'fallback', weather: { source: 'demo' } }), /^Sample listings · forecast unavailable/);
        assert.match(discoveryDataLabel({ loading: true, weatherLoading: true }), /^Loading listings · loading weather/);
        assert.match(discoveryDataLabel({ source: 'supabase', error: 'offline', weather: { source: 'open-meteo' } }), /^Previously loaded listings · refresh failed · Open-Meteo forecast/);
        assert.match(discoveryDataLabel({ source: 'supabase', weather: { source: 'open-meteo' } }), /Sun exposure is modelled, not guaranteed\.$/);
    });
});
