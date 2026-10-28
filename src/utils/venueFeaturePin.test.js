import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { liveWarmth, liveWarmthNote, ownerSwitchDefaults, restoreLivePreview, serialiseLivePreview, venueFeaturePinState } from './venueFeaturePin.js';

describe('venueFeaturePinState', () => {
    it('returns heater for live heaters or a live fireplace', () => {
        assert.equal(venueFeaturePinState({}, { heatersOn: true }), 'heater');
        assert.equal(venueFeaturePinState({}, { fireplaceOn: true }), 'heater');
    });

    it('ignores a venue row\'s stored "on now" (the Railway Hotel bug)', () => {
        assert.equal(venueFeaturePinState({ heatersOn: true }, undefined), null);
        assert.equal(venueFeaturePinState({ fireplaceOn: true }, {}), null);
        // Owner turned it off on this device: off wins over the stored row.
        assert.equal(venueFeaturePinState({ fireplaceOn: true, heatersOn: true }, { fireplaceOn: false, heatersOn: false }), null);
    });

    it('returns null without a heating feature', () => {
        assert.equal(venueFeaturePinState({}, {}), null);
        assert.equal(venueFeaturePinState({ beerGarden: true, sunshineNow: true }, { roofClosed: true }), null);
        assert.equal(venueFeaturePinState(undefined, undefined), null);
    });
});

describe('live warmth', () => {
    it('only strict true counts', () => {
        assert.deepEqual(liveWarmth({ fireplaceOn: 'yes', heatersOn: 1 }), { fireplaceOn: false, heatersOn: false });
        assert.deepEqual(liveWarmth({ fireplaceOn: true }), { fireplaceOn: true, heatersOn: false });
    });
    it('notes', () => {
        assert.equal(liveWarmthNote({ fireplaceOn: true }), 'Fireplace lit now');
        assert.equal(liveWarmthNote({ heatersOn: true }), 'Heaters on now');
        assert.equal(liveWarmthNote({ fireplaceOn: true, heatersOn: true }), 'Fireplace lit now · heaters on');
        assert.equal(liveWarmthNote({ fireplaceOn: true }, { fireplaceLabel: 'Fire pit lit now' }), 'Fire pit lit now');
        assert.equal(liveWarmthNote(null), null);
    });
    it('owner switches start off unless set on this device', () => {
        assert.deepEqual(ownerSwitchDefaults(undefined), { sunshineNow: false, heatersOn: false, fireplaceOn: false, hasUmbrellas: false, hasWindProtection: false });
        assert.equal(ownerSwitchDefaults({ fireplaceOn: true }).fireplaceOn, true);
    });
});

describe('device-local preview persistence', () => {
    const now = Date.UTC(2026, 9, 28, 5);
    it('round-trips within 12 hours and expires after', () => {
        const raw = serialiseLivePreview({ 'dv-12': { fireplaceOn: true } }, now);
        assert.deepEqual(restoreLivePreview(raw, now + 60 * 60 * 1000), { 'dv-12': { fireplaceOn: true } });
        assert.deepEqual(restoreLivePreview(raw, now + 13 * 60 * 60 * 1000), {});
    });
    it('ignores junk, future stamps and missing storage', () => {
        for (const raw of [null, '', 'not json', '[]', '{"features":{}}', JSON.stringify({ savedAt: now, features: [] })]) {
            assert.deepEqual(restoreLivePreview(raw, now), {});
        }
        assert.deepEqual(restoreLivePreview(serialiseLivePreview({ a: {} }, now + 3600000), now), {});
    });
});
