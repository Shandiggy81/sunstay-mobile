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

describe('verified hours from a Supabase row', () => {
    // Shape PostgREST returns after 20261014120000_venues_verified_hours.sql:
    // date columns as YYYY-MM-DD, "happyHour" as jsonb or a JSON string.
    const row = (extra) => ({
        id: 'dv-26',
        venueName: 'Pause Bar',
        lat: -37.8686,
        lng: 145.0007,
        opening_hours: 'Daily from 4pm.',
        hoursVerifiedAt: '2026-10-14',
        hoursSourceUrl: 'https://pausebar.com.au/',
        happyHourVerifiedAt: '2026-10-14',
        happyHourSourceUrl: 'https://pausebar.com.au/',
        ...extra,
    });
    const HH = { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '16:00', end: '19:00', deal: '$13 pints, $7.50 pots' };

    it('reaches the card as verified hours and happy hour', async () => {
        const { venueHoursView, verifiedHappyHour } = await import('../utils/venueHours.js');
        for (const happyHour of [HH, JSON.stringify(HH)]) {
            const venue = interpretVenueResponse({ data: [row({ happyHour })], error: null }).rows[0];
            assert.deepEqual(venueHoursView(venue), { verified: true, text: 'Daily from 4pm.', sourceUrl: 'https://pausebar.com.au/' });
            assert.deepEqual(verifiedHappyHour(venue), HH);
        }
    });

    it('stays unverified when the columns are null', async () => {
        const { venueHoursView, verifiedHappyHour } = await import('../utils/venueHours.js');
        const venue = interpretVenueResponse({
            data: [row({ hoursVerifiedAt: null, hoursSourceUrl: null, happyHour: HH, happyHourVerifiedAt: null, happyHourSourceUrl: null })],
            error: null,
        }).rows[0];
        assert.equal(venueHoursView(venue).verified, false);
        assert.equal(verifiedHappyHour(venue), null);
    });
});
