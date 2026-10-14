import test from 'node:test';
import assert from 'node:assert/strict';
import { sunLightFor } from './mapSunLight.js';

// Flat ground brightness: ambient plus the directional light hitting the ground.
const ground = (l) => l.ambientIntensity + l.intensity * Math.cos((l.direction[1] * Math.PI) / 180);

test('a sunny 7:30am (sun about 10° up) is close to midday brightness', () => {
    const morning = ground(sunLightFor(10, -100));
    const noon = ground(sunLightFor(60, 0));
    assert.ok(morning > 0.7 * noon, `${morning} vs ${noon}`);
});

test('night is clearly darker than day', () => {
    assert.ok(ground(sunLightFor(-10, 90)) < 0.6 * ground(sunLightFor(30, 0)));
});

test('low sun is warm, high sun is white', () => {
    assert.notEqual(sunLightFor(3, 0).color, 'rgb(255, 255, 255)');
    assert.equal(sunLightFor(40, 0).color, 'rgb(255, 255, 255)');
});

test('directions follow Mapbox conventions', () => {
    assert.deepEqual(sunLightFor(30, 0).direction, [180, 60]);      // suncalc south → Mapbox 180
    assert.equal(sunLightFor(30, -90).direction[0], 90);              // east
    assert.equal(sunLightFor(-20, 0).direction[1], 89);               // clamped above the horizon
    assert.equal(sunLightFor(88, 0).direction[1], 5);
});
