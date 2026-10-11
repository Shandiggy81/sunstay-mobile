import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { areaCountLabel, areaPromptNeeded, normalizeBounds, venueInBounds } from './searchArea.js';

const cbd = { minLng: 144.94, minLat: -37.83, maxLng: 144.99, maxLat: -37.80 };

describe('areaPromptNeeded', () => {
    it('offers a search the first time the user moves the map', () => {
        assert.equal(areaPromptNeeded(null, cbd), true);
    });

    it('ignores small nudges', () => {
        const nudge = { minLng: 144.945, minLat: -37.832, maxLng: 144.995, maxLat: -37.802 };
        assert.equal(areaPromptNeeded(cbd, nudge), false);
        assert.equal(areaPromptNeeded(cbd, cbd), false);
    });

    it('offers a search after panning about a third of the screen', () => {
        const panned = { minLng: 144.96, minLat: -37.83, maxLng: 145.01, maxLat: -37.80 };
        assert.equal(areaPromptNeeded(cbd, panned), true);
    });

    it('offers a search after a real zoom in or out', () => {
        const zoomedIn = { minLng: 144.955, minLat: -37.82, maxLng: 144.975, maxLat: -37.81 };
        const zoomedOut = { minLng: 144.90, minLat: -37.86, maxLng: 145.03, maxLat: -37.77 };
        assert.equal(areaPromptNeeded(cbd, zoomedIn), true);
        assert.equal(areaPromptNeeded(cbd, zoomedOut), true);
    });

    it('never prompts for a broken viewport', () => {
        assert.equal(areaPromptNeeded(cbd, null), false);
        assert.equal(areaPromptNeeded(cbd, { minLng: 1, minLat: 1, maxLng: 0, maxLat: 2 }), false);
        assert.equal(normalizeBounds({ minLng: 'x', minLat: 0, maxLng: 1, maxLat: 1 }), null);
    });
});

describe('venueInBounds', () => {
    it('keeps venues inside the area, edges included', () => {
        assert.equal(venueInBounds({ id: 1, lat: -37.815, lng: 144.965 }, cbd), true);
        assert.equal(venueInBounds({ id: 2, lat: '-37.80', lng: '144.99' }, cbd), true);
    });

    it('drops venues outside the area or without coordinates', () => {
        assert.equal(venueInBounds({ id: 3, lat: -37.85, lng: 144.965 }, cbd), false);
        assert.equal(venueInBounds({ id: 4, lat: null, lng: 144.965 }, cbd), false);
        assert.equal(venueInBounds({ id: 5, lat: -37.815, lng: 144.965 }, null), false);
    });
});

describe('areaCountLabel', () => {
    it('reads naturally', () => {
        assert.deepEqual([0, 1, 12, null].map(areaCountLabel), [
            '0 venues in this area',
            '1 venue in this area',
            '12 venues in this area',
            '0 venues in this area',
        ]);
    });
});
