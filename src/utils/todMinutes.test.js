import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOD_DAY_START_MIN,
    TOD_DAY_END_MIN,
    TOD_SLIDER_STEP_MIN,
    localTimeToSliderMinutes,
} from './todMinutes.js';

describe('localTimeToSliderMinutes', () => {
    it('maps Australia/Melbourne wall-clock hours onto minutes-from-midnight', () => {
        // 00:35 UTC = 10:35 AEST.
        const date = new Date('2026-09-17T00:35:00Z');
        assert.equal(localTimeToSliderMinutes(date), 10 * 60 + 35);
    });

    it('does not use UTC hour when Melbourne is already in the afternoon', () => {
        // 03:00 UTC = 13:00 AEST. UTC hour 3 must not win.
        const afternoon = new Date('2026-09-17T03:00:00Z');
        assert.equal(localTimeToSliderMinutes(afternoon), 13 * 60);
        assert.notEqual(localTimeToSliderMinutes(afternoon), 3 * 60);
    });

    it('snaps to the slider step', () => {
        const date = new Date('2026-09-17T03:02:00Z'); // 13:02 AEST
        assert.equal(localTimeToSliderMinutes(date) % TOD_SLIDER_STEP_MIN, 0);
        assert.equal(localTimeToSliderMinutes(date), 13 * 60);
    });

    it('clamps before the slider range to day start', () => {
        const date = new Date('2026-09-16T16:15:00Z'); // 02:15 AEST
        assert.equal(localTimeToSliderMinutes(date), TOD_DAY_START_MIN);
    });

    it('clamps after the slider range to day end', () => {
        const date = new Date('2026-09-17T12:40:00Z'); // 22:40 AEST
        assert.equal(localTimeToSliderMinutes(date), TOD_DAY_END_MIN);
    });

    it('follows AEDT so midday Melbourne is 12:00, not the UTC hour', () => {
        const noonAedt = new Date('2026-01-15T01:00:00Z'); // 12:00 AEDT
        assert.equal(localTimeToSliderMinutes(noonAedt), 12 * 60);
    });
});
