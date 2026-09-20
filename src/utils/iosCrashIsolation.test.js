import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEBUG_MASCOT_RENDER,
    ENABLE_MASCOT_PULL_REFRESH,
    ENABLE_MAPBOX,
    ENABLE_SHEET_MOTION,
    crashTestId,
    mapSurfaceMode,
    sheetSurfaceMode,
    venueListMode,
} from './iosCrashIsolation.js';

describe('iOS crash isolation flags', () => {
    it('exposes real boolean flags (temporary, flip one at a time)', () => {
        assert.equal(typeof DEBUG_MASCOT_RENDER, 'boolean');
        assert.equal(DEBUG_MASCOT_RENDER, false);
        assert.equal(typeof ENABLE_MASCOT_PULL_REFRESH, 'boolean');
        assert.equal(typeof ENABLE_MAPBOX, 'boolean');
        assert.equal(typeof ENABLE_SHEET_MOTION, 'boolean');
    });

    it('defaults keep every live feature on so Safari starts at matrix A', () => {
        assert.equal(ENABLE_MAPBOX, true);
        assert.equal(ENABLE_SHEET_MOTION, true);
        assert.equal(ENABLE_MASCOT_PULL_REFRESH, true);
        assert.equal(crashTestId({
            map: ENABLE_MAPBOX,
            motion: ENABLE_SHEET_MOTION,
            pull: ENABLE_MASCOT_PULL_REFRESH,
        }), 'A');
    });

    it('maps the A–E matrix to independent feature combinations', () => {
        assert.equal(crashTestId({ map: true, motion: true, pull: true }), 'A');
        assert.equal(crashTestId({ map: false, motion: true, pull: true }), 'B');
        assert.equal(crashTestId({ map: true, motion: false, pull: true }), 'C');
        assert.equal(crashTestId({ map: true, motion: true, pull: false }), 'D');
        assert.equal(crashTestId({ map: false, motion: false, pull: false }), 'E');
        assert.equal(crashTestId({ map: false, motion: false, pull: true }), 'custom');
        assert.equal(crashTestId({ map: false, motion: true, pull: false }), 'custom');
        assert.equal(crashTestId({ map: true, motion: false, pull: false }), 'custom');
    });

    it('selects a real fallback surface when a flag is off', () => {
        assert.equal(venueListMode(true), 'mascot-pull');
        assert.equal(venueListMode(false), 'plain');
        assert.equal(mapSurfaceMode(true), 'mapbox');
        assert.equal(mapSurfaceMode(false), 'static-fallback');
        assert.equal(sheetSurfaceMode(true), 'framer-motion');
        assert.equal(sheetSurfaceMode(false), 'static-div');
    });
});
