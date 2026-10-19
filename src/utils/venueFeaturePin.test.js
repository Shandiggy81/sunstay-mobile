import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { venueFeaturePinState } from './venueFeaturePin.js';

describe('venueFeaturePinState', () => {
    it('returns heater for live heaters or a live fireplace', () => {
        assert.equal(venueFeaturePinState({}, { heatersOn: true }), 'heater');
        assert.equal(venueFeaturePinState({}, { fireplaceOn: true }), 'heater');
    });

    it('returns heater for venue-level heaters or fireplace', () => {
        assert.equal(venueFeaturePinState({ heatersOn: true }, undefined), 'heater');
        assert.equal(venueFeaturePinState({ fireplaceOn: true }, {}), 'heater');
    });

    it('returns null without a heating feature', () => {
        assert.equal(venueFeaturePinState({}, {}), null);
        assert.equal(venueFeaturePinState({ beerGarden: true, sunshineNow: true }, { roofClosed: true }), null);
        assert.equal(venueFeaturePinState(undefined, undefined), null);
    });
});
