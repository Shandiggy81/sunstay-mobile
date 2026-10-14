import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOURS_UNCONFIRMED_NOTE, isSourceUrl, isVerifiedAt, venueHoursView, verifiedHappyHour } from './venueHours.js';
import { demoVenues } from '../data/demoVenues.js';

const HAPPY = { days: ['Fri'], start: '16:00', end: '18:00', deal: '$8 pints' };
const SRC = 'https://example.com/whats-on';

describe('venueHoursView', () => {
    it('hides hours until they have been checked', () => {
        const view = venueHoursView({ opening_hours: 'Wed–Sun 12pm–late' });
        assert.deepEqual(view, { verified: false, note: HOURS_UNCONFIRMED_NOTE });
        assert.equal(HOURS_UNCONFIRMED_NOTE, 'Hours not yet confirmed by the venue. Check their website before you go.');
    });

    it('shows checked hours with their source', () => {
        assert.deepEqual(
            venueHoursView({ opening_hours: ' Wed–Sun 12pm–late ', hoursVerifiedAt: '2026-10-14', hoursSourceUrl: SRC }),
            { verified: true, text: 'Wed–Sun 12pm–late', sourceUrl: SRC },
        );
    });

    it('needs a date, a source URL and some hours', () => {
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: '2026-10-14' }).verified, false, 'no source');
        assert.equal(venueHoursView({ opening_hours: 'x', hoursSourceUrl: SRC }).verified, false, 'no date');
        assert.equal(venueHoursView({ hoursVerifiedAt: '2026-10-14', hoursSourceUrl: SRC }).verified, false, 'no hours');
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: 'not a date', hoursSourceUrl: SRC }).verified, false);
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: true, hoursSourceUrl: SRC }).verified, false);
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: '2026-10-14', hoursSourceUrl: 'see website' }).verified, false);
        assert.equal(venueHoursView(null).verified, false);
    });
});

describe('verifiedHappyHour', () => {
    it('uses only the venue\'s own happy hour, once checked against a source', () => {
        assert.equal(verifiedHappyHour({ happyHour: HAPPY }), null);
        assert.equal(verifiedHappyHour({ happyHour: HAPPY, happyHourVerifiedAt: '2026-10-14' }), null, 'no source');
        assert.equal(verifiedHappyHour({ happyHour: HAPPY, hoursVerifiedAt: '2026-10-14', hoursSourceUrl: SRC }), null, 'opening hours do not count');
        assert.equal(verifiedHappyHour({ happyHour: HAPPY, happyHourVerifiedAt: '2026-10-14', happyHourSourceUrl: SRC }), HAPPY);
        assert.equal(verifiedHappyHour({ happyHourVerifiedAt: '2026-10-14', happyHourSourceUrl: SRC }), null);
        assert.equal(verifiedHappyHour({ happyHourVerifiedAt: '2026-10-14', happyHourSourceUrl: SRC }, HAPPY), null, 'no borrowed happy hours');
    });

    it('accepts dates, numbers and ISO strings, and http(s) sources', () => {
        assert.equal(isVerifiedAt(new Date('2026-10-14')), true);
        assert.equal(isVerifiedAt(1790000000000), true);
        assert.equal(isVerifiedAt(''), false);
        assert.equal(isVerifiedAt(null), false);
        assert.equal(isVerifiedAt(new Date('nope')), false);
        assert.equal(isSourceUrl(SRC), true);
        assert.equal(isSourceUrl('javascript:alert(1)'), false);
        assert.equal(isSourceUrl('/relative'), false);
        assert.equal(isSourceUrl(null), false);
    });
});

describe('demo venue data', () => {
    it('every venue with verified hours or happy hours names its source URL', () => {
        for (const venue of demoVenues) {
            if (venue.hoursVerifiedAt != null) {
                assert.ok(isVerifiedAt(venue.hoursVerifiedAt), `${venue.venueName}: hoursVerifiedAt is a date`);
                assert.ok(isSourceUrl(venue.hoursSourceUrl), `${venue.venueName}: hoursSourceUrl`);
                assert.ok(typeof venue.opening_hours === 'string' && venue.opening_hours.trim(), `${venue.venueName}: opening_hours`);
            }
            if (venue.happyHourVerifiedAt != null) {
                assert.ok(isVerifiedAt(venue.happyHourVerifiedAt), `${venue.venueName}: happyHourVerifiedAt is a date`);
                assert.ok(isSourceUrl(venue.happyHourSourceUrl), `${venue.venueName}: happyHourSourceUrl`);
                const hh = venue.happyHour;
                assert.ok(hh && hh.days?.length && hh.start && hh.end && hh.deal, `${venue.venueName}: happyHour has days, times and an offer`);
            }
        }
    });

    it('has no interstate street addresses', () => {
        for (const venue of demoVenues) {
            for (const field of ['address', 'full_street_address']) {
                const value = venue[field];
                if (typeof value !== 'string') continue;
                assert.doesNotMatch(value, /\b(NSW|QLD|WA|SA|TAS|NT|ACT)\s+\d{4}\b/, `${venue.venueName}.${field}: ${value}`);
            }
        }
    });
});
