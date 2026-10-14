import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HOURS_UNCONFIRMED_NOTE, isVerifiedAt, venueHoursView, verifiedHappyHour } from './venueHours.js';
import { demoVenues } from '../data/demoVenues.js';

const HAPPY = { days: ['Fri'], start: '16:00', end: '18:00', deal: '$8 pints' };

describe('venueHoursView', () => {
    it('hides hours until the venue has confirmed them', () => {
        const view = venueHoursView({ opening_hours: 'Wed–Sun 12pm–late' });
        assert.deepEqual(view, { verified: false, note: HOURS_UNCONFIRMED_NOTE });
        assert.equal(HOURS_UNCONFIRMED_NOTE, 'Hours not yet confirmed by the venue. Check their website before you go.');
    });

    it('shows confirmed hours', () => {
        assert.deepEqual(
            venueHoursView({ opening_hours: ' Wed–Sun 12pm–late ', hoursVerifiedAt: '2026-10-01' }),
            { verified: true, text: 'Wed–Sun 12pm–late' },
        );
    });

    it('needs both a date and some hours', () => {
        assert.equal(venueHoursView({ hoursVerifiedAt: '2026-10-01' }).verified, false);
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: 'not a date' }).verified, false);
        assert.equal(venueHoursView({ opening_hours: 'x', hoursVerifiedAt: true }).verified, false);
        assert.equal(venueHoursView(null).verified, false);
    });

    it('no demo venue is verified yet', () => {
        for (const venue of demoVenues) {
            assert.equal(venueHoursView(venue).verified, false, venue.venueName);
            assert.equal(verifiedHappyHour(venue), null, venue.venueName);
        }
    });
});

describe('verifiedHappyHour', () => {
    it('hides happy hours unless happyHourVerifiedAt is set', () => {
        assert.equal(verifiedHappyHour({ happyHour: HAPPY }), null);
        assert.equal(verifiedHappyHour({ happyHour: HAPPY, hoursVerifiedAt: '2026-10-01' }), null, 'opening hours do not count');
        assert.equal(verifiedHappyHour({ happyHour: HAPPY, happyHourVerifiedAt: '2026-10-01T09:00:00Z' }), HAPPY);
        assert.equal(verifiedHappyHour({ happyHourVerifiedAt: '2026-10-01' }, HAPPY), HAPPY, 'override from another data file');
        assert.equal(verifiedHappyHour({ happyHourVerifiedAt: '2026-10-01' }), null);
    });

    it('accepts dates, numbers and ISO strings', () => {
        assert.equal(isVerifiedAt(new Date('2026-10-01')), true);
        assert.equal(isVerifiedAt(1790000000000), true);
        assert.equal(isVerifiedAt(''), false);
        assert.equal(isVerifiedAt(null), false);
        assert.equal(isVerifiedAt(new Date('nope')), false);
    });
});
