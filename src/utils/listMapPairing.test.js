import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isHoverPointer, isKeyboardFocus, nextHighlightedVenueId, orphanedPinHover, sameVenueId } from './listMapPairing.js';

describe('isHoverPointer', () => {
    it('is true for mouse and pen, false for touch and unknown', () => {
        assert.equal(isHoverPointer({ pointerType: 'mouse' }), true);
        assert.equal(isHoverPointer({ pointerType: 'pen' }), true);
        for (const event of [{ pointerType: 'touch' }, { pointerType: '' }, {}, null, undefined]) {
            assert.equal(isHoverPointer(event), false);
        }
    });
});

describe('sameVenueId', () => {
    it('compares ids as strings and never matches a missing id', () => {
        assert.equal(sameVenueId(12, '12'), true);
        assert.equal(sameVenueId('clue-1', 'clue-1'), true);
        assert.equal(sameVenueId('clue-1', 'clue-2'), false);
        assert.equal(sameVenueId(null, null), false);
        assert.equal(sameVenueId(undefined, 'x'), false);
    });
});

describe('nextHighlightedVenueId', () => {
    it('claims the highlight on enter and releases it on leave', () => {
        assert.equal(nextHighlightedVenueId(null, { type: 'enter', venueId: 7 }), '7');
        assert.equal(nextHighlightedVenueId('7', { type: 'leave', venueId: 7 }), null);
    });

    it('keeps a newer highlight when an older row reports leave late', () => {
        // pointer moves from row A to row B: B's enter can arrive before A's leave
        const afterB = nextHighlightedVenueId('a', { type: 'enter', venueId: 'b' });
        assert.equal(afterB, 'b');
        assert.equal(nextHighlightedVenueId(afterB, { type: 'leave', venueId: 'a' }), 'b');
    });

    it('ignores unknown events and missing ids', () => {
        assert.equal(nextHighlightedVenueId('a', { type: 'move', venueId: 'b' }), 'a');
        assert.equal(nextHighlightedVenueId('a', { type: 'enter', venueId: null }), 'a');
        assert.equal(nextHighlightedVenueId(undefined, { type: 'leave', venueId: 'a' }), null);
    });
});

describe('isKeyboardFocus', () => {
    it('is true only when the element matches :focus-visible', () => {
        assert.equal(isKeyboardFocus({ matches: (q) => q === ':focus-visible' }), true);
        assert.equal(isKeyboardFocus({ matches: () => false }), false);
        assert.equal(isKeyboardFocus({ matches: () => { throw new Error('unsupported'); } }), false);
        assert.equal(isKeyboardFocus(null), false);
        assert.equal(isKeyboardFocus({}), false);
    });
});

describe('orphanedPinHover', () => {
    const pin = (venueId, extra = {}) => ({ venueId, isCluster: false, released: false, ...extra });

    it('is null while the hovered pin is still on the map', () => {
        assert.equal(orphanedPinHover('7', { a: pin('7'), b: pin('8') }), null);
        assert.equal(orphanedPinHover(7, { a: pin('7') }), null);
    });

    it('names the venue once its pin is gone, released or folded into a cluster', () => {
        assert.equal(orphanedPinHover('7', { b: pin('8') }), '7');
        assert.equal(orphanedPinHover('7', { a: pin('7', { released: true }) }), '7');
        assert.equal(orphanedPinHover('7', { c: { isCluster: true, released: false } }), '7');
        assert.equal(orphanedPinHover('7', {}), '7');
    });

    it('is null when no pin is hovered', () => {
        assert.equal(orphanedPinHover(null, {}), null);
        assert.equal(orphanedPinHover(undefined, { a: pin('7') }), null);
    });
});
