import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEBUG_MASCOT_RENDER,
    ENABLE_MASCOT_PULL_REFRESH,
    ENABLE_MAPBOX,
    ENABLE_SHEET_MOTION,
    MAP_LIFECYCLE,
    crashTestId,
    mapSurfaceMode,
    renderMatrixTestId,
    resolveIosIsolation,
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

describe('card-count isolation overrides', () => {
    function storage(seed = {}) {
        const data = { ...seed };
        return {
            getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
        };
    }

    it('shows every venue unless a 15/30/45/59 override is set', () => {
        const defaults = resolveIosIsolation({});
        assert.equal(defaults.venueRenderLimit, null);
        assert.equal(defaults.mapbox, true);
        assert.equal(defaults.sheetMotion, true);
        assert.equal(defaults.refreshHang, false);
        assert.equal(defaults.matrixHud, false);
        assert.equal(defaults.sheetWillChange, 'while-dragging');
        assert.equal(defaults.sheetBackdrop, 'none-while-dragging');
        assert.equal(defaults.renderMatrix, 'default');
        assert.equal(defaults.venueRenderMode, 'progressive');
        assert.equal(defaults.mapLifecycle, 'keep');
        assert.equal(MAP_LIFECYCLE, 'keep');
        assert.equal(resolveIosIsolation({ search: '?mapLifecycle=unmount-expanded' }).mapLifecycle, 'unmount-expanded');
        assert.equal(resolveIosIsolation({ search: '?mapLifecycle=keep' }).mapLifecycle, 'keep');
        assert.equal(resolveIosIsolation({ search: '?mapLifecycle=nope' }).mapLifecycle, 'keep');
    });

    it('lets the query string override storage for the A–E card matrix', () => {
        assert.equal(renderMatrixTestId({ map: true, limit: 59, motion: true }), 'A');
        assert.equal(renderMatrixTestId({ map: false, limit: 59, motion: true }), 'B');
        assert.equal(renderMatrixTestId({ map: true, limit: 15, motion: true }), 'C');
        assert.equal(renderMatrixTestId({ map: true, limit: 59, motion: false }), 'D');
        assert.equal(renderMatrixTestId({ map: false, limit: 15, motion: false }), 'E');
        assert.equal(renderMatrixTestId({ map: true, limit: 30, motion: true }), 'custom');

        const fromQuery = resolveIosIsolation({
            search: '?mapbox=0&venueLimit=15&sheetMotion=0&matrixHud=1&sheetWillChange=off&refreshHang=1',
            storage: storage({ 'ss-venue-render-limit': '59', 'ss-mapbox': '1' }),
        });
        assert.equal(fromQuery.renderMatrix, 'E');
        assert.equal(fromQuery.venueRenderLimit, 15);
        assert.equal(fromQuery.mapbox, false);
        assert.equal(fromQuery.sheetMotion, false);
        assert.equal(fromQuery.matrixHud, true);
        assert.equal(fromQuery.sheetWillChange, 'off');
        assert.equal(fromQuery.refreshHang, true);
    });

    it('reads localStorage when the query does not set the flag', () => {
        const flags = resolveIosIsolation({
            search: '',
            storage: storage({ 'ss-venue-render-limit': '30', 'ss-sheet-backdrop': 'always' }),
        });
        assert.equal(flags.venueRenderLimit, 30);
        assert.equal(flags.sheetBackdrop, 'always');
        assert.equal(flags.renderMatrix, 'custom');
        assert.equal(flags.venueRenderMode, 'diagnostic-cap');
    });

    it('keeps venueLimit=all as a diagnostic show-all, separate from progressive', () => {
        const showAll = resolveIosIsolation({ search: '?venueLimit=all' });
        assert.equal(showAll.venueRenderLimit, null);
        assert.equal(showAll.venueRenderMode, 'diagnostic-all');
        assert.equal(showAll.renderMatrix, 'default');
        assert.equal(resolveIosIsolation({ search: '?venueLimit=45' }).venueRenderLimit, 45);
        assert.equal(resolveIosIsolation({ search: '?venueLimit=45' }).venueRenderMode, 'diagnostic-cap');
    });
});
