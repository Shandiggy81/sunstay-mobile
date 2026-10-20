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
    it('shows the venue icon on its tier colour and keeps the score accessible', () => {
        const v = sunPinView({ score: 91.6, emoji: '🍺' });
        assert.equal(v.tier, 'full');
        assert.equal(v.icon, '🍺');
        assert.equal(v.scoreText, '');
        assert.equal(v.bg, SUN_PIN_TIERS.full.bg);
        assert.equal(v.label, 'Sun score 92');
    });

    it('omits numbers and tier glyphs for every normal score tier', () => {
        for (const score of [0, 12, 49, 50, 64, 74, 75, 88, 100]) {
            const view = sunPinView({ score, emoji: '🍷' });
            assert.equal(view.scoreText, '');
            assert.equal(view.label, `Sun score ${score}`);
        }
    });

    it('keeps each condition glyph alone for both idle and selected pins', () => {
        for (const [pinKey, glyph] of [['heater', '🔥'], ['cozy', '🛋️'], ['rain', '🌧'], ['cold', '🥶'], ['windy', '💨']]) {
            for (const selected of [false, true]) {
                const view = sunPinView({ pinKey, score: 88, selected });
                assert.equal(view.scoreText, glyph);
                assert.equal(view.label, 'Sun score 88');
                assert.equal(view.tier, selected ? 'selected' : 'full');
            }
        }
    });

    it('keeps the selected pin dark and icon-only across score tiers', () => {
        const v = sunPinView({ score: 88, emoji: '☕', selected: true });
        assert.equal(v.tier, 'selected');
        assert.equal(v.bg, '#0f172a');
        assert.equal(v.text, '#fbbf24');
        assert.equal(v.scoreText, '');
        assert.equal(v.label, 'Sun score 88');
        assert.equal(sunPinView({ score: 30, selected: true }).scoreText, '');
    });

    it('distinguishes low sun from white part sun with a darker slate surface and border', () => {
        const low = sunPinView({ score: 30 });
        const part = sunPinView({ score: 60 });
        assert.equal(low.bg, '#e2e8f0');
        assert.equal(low.border, '#94a3b8');
        assert.equal(low.text, '#475569');
        assert.equal(part.bg, '#ffffff');
        assert.notEqual(low.bg, part.bg);
        assert.notEqual(low.border, part.border);
    });

    it('falls back to a pin icon and no number when data is missing', () => {
        const v = sunPinView({ score: null, emoji: '  ' });
        assert.equal(v.icon, '📍');
        assert.equal(v.scoreText, '');
        assert.equal(v.tier, 'unknown');
        assert.equal(v.label, 'Sun score unknown');
        for (const score of [undefined, null, NaN, Infinity]) {
            for (const selected of [false, true]) {
                const unknown = sunPinView({ pinKey: 'windy', score, selected });
                assert.equal(unknown.scoreText, '');
                assert.equal(unknown.label, 'Sun score unknown');
            }
        }
    });

    it('carries a clay icon URL alongside the emoji fallback without changing the rest', () => {
        const plain = sunPinView({ pinKey: 'rain', score: 80, emoji: '🍺', selected: true });
        const clay = sunPinView({ pinKey: 'rain', score: 80, emoji: '🍺', selected: true, iconUrl: '/assets/pint-1.webp' });
        assert.equal(clay.iconUrl, '/assets/pint-1.webp');
        assert.equal(clay.icon, '🍺');
        assert.equal(plain.iconUrl, null);
        assert.deepEqual({ ...clay, iconUrl: null }, plain);
        assert.equal(sunPinView({ emoji: '🍺', iconUrl: '' }).iconUrl, null);
    });
});

describe('clusterSize', () => {
    it('grows with the count', () => {
        assert.deepEqual([1, 4, 5, 14, 15, 60, 0, null].map(clusterSize), [36, 36, 42, 42, 48, 48, 36, 36]);
    });

    it('rings selected and highlighted pins and stacks highlighted above selected', () => {
        const idle = sunPinView({ score: 88 });
        const selected = sunPinView({ score: 88, selected: true });
        const highlighted = sunPinView({ score: 30, highlighted: true });
        const both = sunPinView({ score: 88, selected: true, highlighted: true });
        assert.deepEqual([idle.ring, selected.ring, highlighted.ring, both.ring], [false, true, true, true]);
        assert.deepEqual([idle.raised, selected.raised, highlighted.raised], [false, false, true]);
        assert.deepEqual([sunPinView({ score: 30 }).zIndex, idle.zIndex, selected.zIndex, highlighted.zIndex, both.zIndex], [1, 2, 3, 4, 4]);
        assert.equal(highlighted.tier, 'low', 'highlight keeps the sun colour; only selection repaints it');
        assert.equal(both.tier, 'selected');
    });
});
