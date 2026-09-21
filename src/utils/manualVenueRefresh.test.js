import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENABLE_MANUAL_VENUE_REFRESH } from './manualVenueRefresh.js';

describe('manual venue refresh fallback', () => {
    it('keeps the accessible refresh button available until a feature flag turns it off', () => {
        assert.equal(ENABLE_MANUAL_VENUE_REFRESH, true);
    });
});
