import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapVenuePreview, dismissPreviewSwipe, isPreviewMapDrag } from './mapVenuePreview.js';
import { venueConditionChips } from './venueConditionChips.js';

describe('mapVenuePreview', () => {
    it('prefers an imported photo and keeps a clean type/suburb subtitle', () => {
        const view = mapVenuePreview({ venueName: 'Test cafe', typeLabel: 'Cafe', suburb: ' CBD ', image_url: ' /photo.jpg ', image: '/other.jpg' });
        assert.equal(view.name, 'Test cafe');
        assert.equal(view.imageUrl, '/photo.jpg');
        assert.equal(view.subtitle, 'Cafe · CBD');
    });

    it('falls back to image, handles missing photos and avoids subtitle separators', () => {
        assert.equal(mapVenuePreview({ image_url: ' ', image: '/legacy.jpg' }).imageUrl, '/legacy.jpg');
        assert.equal(mapVenuePreview({ image: {} }).imageUrl, null);
        assert.equal(mapVenuePreview({ suburb: 'Fitzroy' }).subtitle, 'Fitzroy');
        assert.equal(mapVenuePreview({ typeLabel: 'Eatery' }).subtitle, 'Food & drink');
        assert.equal(mapVenuePreview(null).subtitle, '');
    });

    it('never shows typeCategory "Bar" as the type; stays still show theirs', () => {
        // Production venues df-01…df-11 have typeCategory 'Bar' and no typeLabel or vibe.
        assert.equal(mapVenuePreview({ venueName: 'Sister of Soul', typeCategory: 'Bar', suburb: 'St Kilda' }).subtitle, 'St Kilda');
        assert.equal(mapVenuePreview({ typeCategory: 'Bar', typeLabel: 'Cafe', suburb: 'Carlton' }).subtitle, 'Cafe · Carlton');
        assert.equal(mapVenuePreview({ typeCategory: 'Serviced apartment', suburb: 'Southbank' }).subtitle, 'Serviced apartment · Southbank');
    });

    it('uses the same sun chip as the venue list, and does not invent an absent forecast', () => {
        const forecast = { sunriseHour: 6, sunsetHour: 19, nowHour: 12, now: { kind: 'sun' }, sunUntil: 15, hasHourly: true };
        const expected = venueConditionChips({ venue: {}, forecast }).find(chip => chip.key === 'sun');
        assert.deepEqual(mapVenuePreview({}, forecast).sun, expected);
        assert.match(expected.text, /until 3pm/);
        assert.equal(mapVenuePreview({}).sun, null);
    });

    it('shows at most three real key amenities in their shared order', () => {
        const view = mapVenuePreview({ tags: ['Hidden', 'Dog Friendly', 'Pram Friendly', 'Wheelchair Accessible'] });
        assert.deepEqual(view.amenities.map(a => a.key), ['wheelchair', 'pram', 'pet']);
        assert.deepEqual(mapVenuePreview({ tags: ['Outdoor Seating'] }).amenities, []);
    });
});

describe('preview dismissal gestures', () => {
    it('accepts a long downward swipe or a short fast flick', () => {
        assert.equal(dismissPreviewSwipe({ offsetY: 60 }), true);
        assert.equal(dismissPreviewSwipe({ offsetY: 12, velocityY: 600 }), true);
    });

    it('keeps taps, upward swipes and short slow drags open', () => {
        for (const gesture of [{}, { offsetY: 59, velocityY: 0 }, { offsetY: -90, velocityY: -900 }, { offsetY: 2, velocityY: 900 }, { offsetY: NaN }]) {
            assert.equal(dismissPreviewSwipe(gesture), false);
        }
    });

    it('distinguishes canvas taps from a drag by the same pointer', () => {
        const start = { pointerId: 1, x: 100, y: 100 };
        assert.equal(isPreviewMapDrag(start, { pointerId: 1, x: 105, y: 104 }), false);
        assert.equal(isPreviewMapDrag(start, { pointerId: 1, x: 108, y: 100 }), true);
        assert.equal(isPreviewMapDrag(start, { pointerId: 2, x: 140, y: 100 }), false);
        assert.equal(isPreviewMapDrag(null, start), false);
        assert.equal(isPreviewMapDrag(start, { pointerId: 1, x: NaN, y: 100 }), false);
    });
});
