import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUN_PIN_TIERS, clusterSize, sunPinView, sunTier } from './sunPin.js';

describe('sunTier', () => {
    it('buckets the sun score', () => {
        assert.deepEqual([100, 75, 74, 50, 49, 0, null, NaN].map(sunTier),
            ['full', 'full', 'part', 'part', 'low', 'low', 'unknown', 'unknown']);
    });
});

describe('sunPinView', () => {
    it('shows the venue icon and a sun score coloured by tier', () => {
        const v = sunPinView({ score: 91.6, emoji: '🍺' });
        assert.equal(v.tier, 'full');
        assert.equal(v.icon, '🍺');
        assert.equal(v.scoreText, '☀ 92');
        assert.equal(v.bg, SUN_PIN_TIERS.full.bg);
        assert.equal(v.label, 'Sun score 92');
    });

    it('uses part-sun and shade glyphs for lower scores', () => {
        assert.equal(sunPinView({ score: 64, emoji: '🍷' }).scoreText, '⛅ 64');
        assert.equal(sunPinView({ score: 12, emoji: '🍷' }).scoreText, '☁ 12');
    });

    it('swaps the glyph for heater, rain and similar states but keeps the score', () => {
        assert.equal(sunPinView({ pinKey: 'heater', score: 40 }).scoreText, '🔥 40');
        assert.equal(sunPinView({ pinKey: 'rain', score: 80 }).scoreText, '🌧 80');
        assert.equal(sunPinView({ pinKey: 'rain', score: 80 }).tier, 'full');
    });

    it('turns the selected pin ink with an amber score', () => {
        const v = sunPinView({ score: 88, emoji: '☕', selected: true });
        assert.equal(v.tier, 'selected');
        assert.equal(v.bg, '#0f172a');
        assert.equal(v.text, '#fbbf24');
        assert.equal(v.scoreText, '☀ 88');
        assert.equal(sunPinView({ score: 30, selected: true }).scoreText, '☁ 30');
    });

    it('falls back to a pin icon and no number when data is missing', () => {
        const v = sunPinView({ score: null, emoji: '  ' });
        assert.equal(v.icon, '📍');
        assert.equal(v.scoreText, '');
        assert.equal(v.tier, 'unknown');
        assert.equal(v.label, 'Sun score unknown');
    });
});

describe('clusterSize', () => {
    it('grows with the count', () => {
        assert.deepEqual([1, 4, 5, 14, 15, 60, 0, null].map(clusterSize), [36, 36, 42, 42, 48, 48, 36, 36]);
    });
});
