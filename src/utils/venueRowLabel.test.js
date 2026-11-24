import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { venueRowLabel } from './venueRowLabel.js';
import { nameContainsLabel } from './labelInName.js';

/** What the row's button shows, in screen order. */
const visible = ({ venueName, subtitle = null, sunLine = null, notes = [] }) =>
    [venueName, subtitle, sunLine, ...notes].filter(Boolean).join(' ');

describe('venueRowLabel', () => {
    it('says a café row as shown, then how its sun hours are measured, wind, score and feels-like', () => {
        const row = {
            venueName: 'The Terrace',
            subtitle: 'Cafe · Melbourne',
            sunLine: '14h 14m sun today · Light wind',
            clearDaySun: true,
            windKmh: 10,
            score: { state: 'score', value: 100 },
            feelsLike: 13,
        };
        const label = venueRowLabel(row);
        assert.equal(label, 'Venue: The Terrace. Cafe · Melbourne. 14h 14m sun today · Light wind. '
            + 'Sun hours are direct sun on a clear day. Wind 10 km/h. Sun score 100 out of 100. Feels like 13 degrees.');
        assert.equal(nameContainsLabel(label, visible(row)), true);
    });

    it('keeps reason lines in screen order and adds outdoor spaces and access after the score', () => {
        const row = {
            venueName: 'Spleen Central',
            subtitle: 'Cocktail & wine bar · CBD',
            sunLine: 'Sunny until 8:20pm · Light wind',
            notes: ['Fireplace lit', 'Heated indoors'],
            windKmh: 7,
            outdoor: ['Rooftop'],
            score: { state: 'score', value: 64 },
            feelsLike: 14,
            amenities: ['Wheelchair accessible', 'Dog friendly'],
        };
        const label = venueRowLabel(row);
        assert.equal(label, 'Venue: Spleen Central. Cocktail & wine bar · CBD. Sunny until 8:20pm · Light wind. '
            + 'Fireplace lit. Heated indoors. Wind 7 km/h. Rooftop. Sun score 64 out of 100. Feels like 14 degrees. '
            + 'Wheelchair accessible, Dog friendly.');
        assert.equal(nameContainsLabel(label, visible(row)), true);
        // The rain test in e2e finds a reason between full stops.
        assert.ok(label.includes('. Heated indoors. '));
    });

    it('says why the score is missing after dark and in rain', () => {
        assert.equal(venueRowLabel({ venueName: 'Bar', score: { state: 'night', value: 0 } }),
            'Venue: Bar. Sun score not shown after dark.');
        assert.equal(venueRowLabel({ venueName: 'Bar', score: { state: 'rain', value: 3 } }),
            'Venue: Bar. Sun score not shown while it rains.');
    });

    it('gives a stay its sun moment without a score or feels-like', () => {
        const row = {
            venueName: 'Quest St Kilda Bayside',
            subtitle: 'Serviced apartment · St Kilda',
            stayBadge: '☕ Morning 6:00am–10:00am · North-east side, Level 2 · Estimated',
        };
        const label = venueRowLabel(row);
        assert.equal(label, 'Venue: Quest St Kilda Bayside. Serviced apartment · St Kilda. '
            + '☕ Morning 6:00am–10:00am · North-east side, Level 2 · Estimated.');
        assert.equal(nameContainsLabel(label, visible(row)), true);
    });

    it('leaves out empty parts and never doubles a full stop', () => {
        assert.equal(venueRowLabel({ venueName: '  Rococo ', subtitle: '', sunLine: 'Sun has set.', notes: [null, ' '] }),
            'Venue: Rococo. Sun has set.');
        assert.equal(venueRowLabel({ venueName: '' }), 'Venue: Unnamed venue.');
        assert.equal(venueRowLabel({ venueName: 'Cafe', score: { state: 'score', value: null } }), 'Venue: Cafe.');
    });

    it('starts with "Venue:" so list rows stand apart from other buttons', () => {
        assert.match(venueRowLabel({ venueName: 'Mr Tulk' }), /^Venue: Mr Tulk\b/);
    });
});
