import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTimePresets, selectedMapTimePreset } from './mapTimePresets.js';

const now = new Date('2026-10-19T00:00:00Z');
const sunset = new Date('2026-10-19T08:44:00Z').getTime() / 1000;

test('shortcuts use Melbourne today and the existing five-minute scale', () => {
    const presets = mapTimePresets({ now, weather: { sys: { sunset } } });
    assert.deepEqual(presets.map(item => item.minutes), [660, 720, 900, 1125, null]);
    assert.equal(selectedMapTimePreset(720, presets), 'lunch');
    assert.equal(selectedMapTimePreset(900, presets), 'arvo');
    assert.equal(selectedMapTimePreset(1125, presets), 'golden');
    assert.equal(selectedMapTimePreset(735, presets), null);
    assert.equal(selectedMapTimePreset(720, presets, true), 'now');
});

test('missing, unavailable, demo or another-day weather cannot enable golden hour', () => {
    for (const weather of [null, {}, { sys: { sunset: null } }, { sys: { sunset: '' } },
        { sys: { sunset: NaN } }, { sys: { sunset: -1 } },
        { sys: { sunset }, source: 'demo' }, { sys: { sunset }, unavailable: true },
        { sys: { sunset: sunset + 86400 } }]) {
        const presets = mapTimePresets({ now, weather });
        assert.equal(presets.find(item => item.id === 'golden').minutes, null);
        assert.equal(presets.find(item => item.id === 'tomorrow').minutes, null);
    }
});

test('Now follows Melbourne across DST and clamps outside the existing day bounds', () => {
    const current = date => mapTimePresets({ now: new Date(date) })[0].minutes;
    assert.equal(current('2026-10-03T01:00:00Z'), 660); // 11am AEST
    assert.equal(current('2026-10-04T00:00:00Z'), 660); // 11am AEDT
    assert.equal(current('2026-10-03T16:00:00Z'), 360); // 3am AEDT
    assert.equal(current('2026-10-04T12:00:00Z'), 1200); // 11pm AEDT
});
