import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    PHOTO_COMING_SOON_MESSAGE,
    SHOW_CUSTOM_FILTERS,
    SHOW_WEATHER_GUARANTEE,
    sunHoursSource,
} from './demoDeadEnds.js';

describe('demo dead ends', () => {
    it('hides controls that have no working outcome yet', () => {
        assert.equal(SHOW_CUSTOM_FILTERS, false);
        assert.equal(SHOW_WEATHER_GUARANTEE, false);
    });

    it('tells people their photo was not uploaded', () => {
        assert.match(PHOTO_COMING_SOON_MESSAGE, /coming soon/i);
        assert.match(PHOTO_COMING_SOON_MESSAGE, /nothing was uploaded/i);
    });

    it('marks sun hours as an estimate only when there is no forecast or curve', () => {
        assert.equal(sunHoursSource({ hasForecast: true, hasCurve: true }), 'forecast');
        assert.equal(sunHoursSource({ hasForecast: true }), 'forecast');
        assert.equal(sunHoursSource({ hasCurve: true }), 'curve');
        assert.equal(sunHoursSource({}), 'estimate');
        assert.equal(sunHoursSource(), 'estimate');
    });
});
