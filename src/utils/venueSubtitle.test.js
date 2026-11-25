import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { venueSubtitle } from './venueSubtitle.js';

describe('venueSubtitle', () => {
    it('joins the type and suburb', () => {
        assert.equal(venueSubtitle({ typeLabel: 'Rooftop Club', suburb: 'South Yarra' }), 'Rooftop Club · South Yarra');
        assert.equal(venueSubtitle({ vibe: 'Pub & bar', suburb: ' West Melbourne ' }), 'Pub & bar · West Melbourne');
    });

    it('leaves out a missing part, with no stray separator', () => {
        assert.equal(venueSubtitle({ suburb: 'Fitzroy' }), 'Fitzroy');
        assert.equal(venueSubtitle({ typeLabel: 'Tavern' }), 'Tavern');
        assert.equal(venueSubtitle({}), '');
        assert.equal(venueSubtitle(null), '');
    });

    it("names a stay's type but never calls food and drink a Bar", () => {
        assert.equal(venueSubtitle({ typeCategory: 'Serviced apartment', suburb: 'Southbank' }), 'Serviced apartment · Southbank');
        assert.equal(venueSubtitle({ typeCategory: 'Bar', suburb: 'St Kilda' }), 'St Kilda');
        assert.equal(venueSubtitle({ typeLabel: 'Eatery' }), 'Food & drink');
    });
});
