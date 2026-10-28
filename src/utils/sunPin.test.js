import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PIN_TOUCH_PX, SUN_PIN_TIERS, clusterSize, pinHitHeight, sunPinView, sunTier } from './sunPin.js';

describe('sunTier', () => {
    it('buckets the sun score', () => {
        assert.deepEqual([100, 75, 74, 50, 49, 0, null, NaN].map(sunTier),
            ['full', 'full', 'part', 'part', 'low', 'low', 'unknown', 'unknown']);
    });
});

describe('sunPinView', () => {
    it('After Dark hides scores in visible and accessible text, across pin states', () => {
        for (const score of [0, 38, 50, 90, null, NaN]) {
            for (const pinKey of ['default', 'heater', 'cozy', 'rain', 'cold', 'windy']) {
                for (const selected of [false, true]) {
                    const view = sunPinView({ score, pinKey, selected, highlighted: true, nightMode: true });
                    assert.doesNotMatch(view.scoreText, /\d/);
                    assert.equal(view.label, 'After dark');
                }
            }
        }
        assert.equal(sunPinView({ score: 50, nightMode: true }).scoreText, '🌙');
        assert.equal(sunPinView({ score: 50, pinKey: 'heater', nightMode: true }).scoreText, '🔥');
    });

    it('explicit Sun mode is identical to existing behavior, including natural night and selection', () => {
        for (const score of [0, 38, 50, 90, null]) for (const night of [false, true]) {
            const input = { score, night, selected: true, iconUrl: '/coffee.webp' };
            assert.deepEqual(sunPinView({ ...input, nightMode: false }), sunPinView(input));
        }
    });

    it('shows the venue icon and the same rounded score as its accessible label', () => {
        const v = sunPinView({ score: 91.6, emoji: '🍺' });
        assert.equal(v.tier, 'full');
        assert.equal(v.icon, '🍺');
        assert.equal(v.scoreText, '92');
        assert.equal(v.bg, SUN_PIN_TIERS.full.bg);
        assert.equal(v.label, 'Sun score 92');
    });

    it('shows the existing numeric score for every normal score tier', () => {
        for (const score of [0, 12, 49, 50, 64, 74, 75, 88, 100]) {
            const view = sunPinView({ score, emoji: '🍷' });
            assert.equal(view.scoreText, String(score));
            assert.equal(view.label, `Sun score ${score}`);
        }
    });

    it('shows a condition marker instead of the number for both idle and selected pins', () => {
        for (const [pinKey, glyph] of [['heater', '🔥'], ['cozy', '🛋️'], ['rain', '🌧'], ['cold', '🥶'], ['windy', '💨']]) {
            for (const selected of [false, true]) {
                const view = sunPinView({ pinKey, score: 88, selected });
                assert.equal(view.scoreText, glyph);
                assert.equal(view.label, 'Sun score 88');
                assert.equal(view.tier, selected ? 'selected' : 'full');
            }
        }
    });

    it('keeps the selected pin white with the existing score across score tiers', () => {
        const v = sunPinView({ score: 88, emoji: '☕', selected: true });
        assert.equal(v.tier, 'selected');
        assert.equal(v.bg, '#ffffff');
        assert.equal(v.text, '#0f172a');
        assert.equal(v.scoreText, '88');
        assert.equal(v.label, 'Sun score 88');
        assert.equal(sunPinView({ score: 30, selected: true }).scoreText, '30');
    });

    it('fills full-sun pins so they stand out from part-sun pins', () => {
        const full = sunPinView({ score: 90 });
        const part = sunPinView({ score: 60 });
        assert.equal(full.bg, '#FFE7A3');
        assert.notEqual(full.bg, part.bg);
    });

    it('keeps low and part sun surfaces white with different border tones', () => {
        const low = sunPinView({ score: 30 });
        const part = sunPinView({ score: 60 });
        assert.equal(low.bg, '#ffffff');
        assert.equal(low.border, '#d6d3ce');
        assert.equal(low.text, '#475569');
        assert.equal(part.bg, '#ffffff');
        assert.equal(low.bg, part.bg);
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

    it('shows a moon after dark but keeps the number in the label and conditions on top', () => {
        const night = sunPinView({ score: 0, night: true });
        assert.equal(night.scoreText, '🌙');
        assert.equal(night.label, 'After dark. Sun score 0');
        assert.equal(sunPinView({ score: 0 }).scoreText, '0', 'daytime is unchanged');
        assert.equal(sunPinView({ pinKey: 'heater', score: 0, night: true }).scoreText, '🔥', 'heaters still show at night');
        assert.equal(sunPinView({ score: null, night: true }).scoreText, '', 'no score, no claim');
    });
});

describe('pinHitHeight', () => {
    it('keeps a tilted pin 44 px tall on screen', () => {
        for (const pitch of [0, 20, 45, 55, 60]) {
            const onScreen = pinHitHeight(pitch) * Math.cos(pitch * Math.PI / 180);
            assert.ok(onScreen >= PIN_TOUCH_PX - 1e-9 && onScreen < PIN_TOUCH_PX + 1, `${pitch}°: ${onScreen}`);
        }
        assert.equal(pinHitHeight(0), 44);
        assert.equal(pinHitHeight(45), 63);
    });
    it('caps steep pitches and ignores bad input', () => {
        assert.equal(pinHitHeight(80), 96);
        assert.equal(pinHitHeight(89), 96);
        assert.equal(pinHitHeight(120), 96);
        assert.equal(pinHitHeight(-10), 44);
        assert.equal(pinHitHeight(undefined), 44);
        assert.equal(pinHitHeight(Number.NaN), 44);
    });
});
