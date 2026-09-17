import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    TOD_DAY_START_MIN,
    TOD_DAY_END_MIN,
    TOD_SLIDER_STEP_MIN,
    localTimeToSliderMinutes,
} from './todMinutes.js';

describe('localTimeToSliderMinutes', () => {
    it('maps device local hours and minutes onto minutes-from-midnight', () => {
        const date = new Date(2026, 8, 17, 10, 35, 0);
        assert.equal(localTimeToSliderMinutes(date), 10 * 60 + 35);
    });

    it('does not default to a hardcoded 1:00 PM unless local time is 1:00 PM', () => {
        const morning = new Date(2026, 8, 17, 9, 0, 0);
        assert.equal(localTimeToSliderMinutes(morning), 9 * 60);
        assert.notEqual(localTimeToSliderMinutes(morning), 13 * 60);
    });

    it('snaps to the slider step', () => {
        const date = new Date(2026, 8, 17, 13, 2, 0);
        assert.equal(localTimeToSliderMinutes(date) % TOD_SLIDER_STEP_MIN, 0);
        assert.equal(localTimeToSliderMinutes(date), 13 * 60);
    });

    it('clamps before the slider range to day start', () => {
        const date = new Date(2026, 8, 17, 4, 15, 0);
        assert.equal(localTimeToSliderMinutes(date), TOD_DAY_START_MIN);
    });

    it('clamps after the slider range to day end', () => {
        const date = new Date(2026, 8, 17, 22, 40, 0);
        assert.equal(localTimeToSliderMinutes(date), TOD_DAY_END_MIN);
    });
});
