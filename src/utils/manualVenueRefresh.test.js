import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ENABLE_MANUAL_VENUE_REFRESH } from './manualVenueRefresh.js';

describe('manual venue refresh button', () => {
    it('is off; pull-to-refresh on the list is the way to reload venues', () => {
        assert.equal(ENABLE_MANUAL_VENUE_REFRESH, false);
    });
});
