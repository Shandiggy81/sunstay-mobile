import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { interpretVenueResponse } from './interpretVenueResponse.js';

describe('interpretVenueResponse', () => {
    it('normalizes a live row payload', () => {
        const result = interpretVenueResponse({
            data: [{ id: 'v1', name: 'Cafe Sun', lat: ' -37.8 ', lng: '144.9', tags: '["Rooftop"]' }],
            error: null,
        });
        assert.equal(result.ok, true);
        assert.equal(result.rows[0].venueName, 'Cafe Sun');
        assert.equal(result.rows[0].lat, -37.8);
        assert.deepEqual(result.rows[0].tags, ['Rooftop']);
        assert.equal(result.error, null);
    });

    it('keeps the existing fallback when Supabase errors or returns no rows', () => {
        const failed = interpretVenueResponse({ data: null, error: { message: 'timeout' } });
        assert.equal(failed.ok, false);
        assert.equal(failed.empty, false);
        assert.equal(failed.rows, null);
        assert.equal(failed.error.message, 'timeout');

        const empty = interpretVenueResponse({ data: [], error: null });
        assert.equal(empty.ok, false);
        assert.equal(empty.empty, true);
        assert.equal(empty.error, null);
    });
});
