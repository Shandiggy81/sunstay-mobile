import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLightMode, standardLightsForPreset } from './mapLightMode.js';

const ready = { mapLoaded: true, generation: 1, currentGeneration: 1 };

test('Sun uses the day preset and custom sun lights; After Dark gives Standard ownership', () => {
    assert.deepEqual(mapLightMode(ready), { preset: 'day', customLights: true });
    assert.deepEqual(mapLightMode({ ...ready, nightMode: true }), { preset: 'night', customLights: false });
    assert.deepEqual(mapLightMode({ ...ready, nightMode: false }), { preset: 'day', customLights: true });
});

test('unloaded, stale and retired generations cannot change either lighting owner', () => {
    for (const nightMode of [false, true]) {
        for (const state of [{}, { ...ready, mapLoaded: false }, { ...ready, stale: true },
            { ...ready, generation: 1, currentGeneration: 2 }]) {
            assert.deepEqual(mapLightMode({ ...state, nightMode }), { preset: null, customLights: false });
        }
    }
});

test('a resumed generation uses the current mode and ignores callbacks from the old map', () => {
    const resumed = { mapLoaded: true, generation: 2, currentGeneration: 2 };
    assert.deepEqual(mapLightMode({ ...resumed, nightMode: true }), { preset: 'night', customLights: false });
    assert.deepEqual(mapLightMode({ ...resumed, generation: 1 }), { preset: null, customLights: false });
    assert.deepEqual(mapLightMode(resumed), { preset: 'day', customLights: true });
});

test('restoring Standard keeps native config expressions and disables shadows on mobile without mutating the snapshot', () => {
    const lights = [{ id: 'ambient', type: 'ambient', properties: { intensity: ['config', 'ambientIntensity'] } },
        { id: 'sun', type: 'directional', properties: { color: ['config', 'sunColor'], 'cast-shadows': true, 'shadow-intensity': 1 } }];
    const mobile = standardLightsForPreset(lights, true);
    assert.deepEqual(mobile[0], lights[0]);
    assert.deepEqual(mobile[1].properties, { color: ['config', 'sunColor'], 'cast-shadows': false, 'shadow-intensity': 0 });
    assert.equal(lights[1].properties['cast-shadows'], true);
    const desktop = standardLightsForPreset(lights);
    assert.deepEqual(desktop, lights);
    desktop[1].properties.color[1] = 'changed';
    assert.equal(lights[1].properties.color[1], 'sunColor');
    assert.equal(standardLightsForPreset(undefined), null);
});
