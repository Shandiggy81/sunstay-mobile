import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    DESKTOP_MAX_TILE_CACHE_SIZE,
    MAP_CONTEXT_LOSS_COOLDOWN_MS,
    MOBILE_MAX_TILE_CACHE_SIZE,
    claimMapboxMount,
    mapMemoryOptions,
    noteMapboxContextLost,
    releaseMapboxMount,
    resetMapGpuGuard,
    suppressMobileGpuLayers,
} from './mapGpuGuard.js';

describe('map GPU mount lock', () => {
    it('refuses a second map while the first lock is held', () => {
        resetMapGpuGuard();
        const first = claimMapboxMount(1000);
        const second = claimMapboxMount(1001);
        assert.equal(first.ok, true);
        assert.equal(second.ok, false);
        assert.equal(second.reason, 'locked');
        releaseMapboxMount();
        assert.equal(claimMapboxMount(1002).ok, true);
        resetMapGpuGuard();
    });

    it('blocks an immediate remount after webglcontextlost and allows one later', () => {
        resetMapGpuGuard();
        assert.equal(claimMapboxMount(0).ok, true);
        releaseMapboxMount();
        noteMapboxContextLost(5000);
        const blocked = claimMapboxMount(5000 + 1000);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.reason, 'context-loss-cooldown');
        const later = claimMapboxMount(5000 + MAP_CONTEXT_LOSS_COOLDOWN_MS);
        assert.equal(later.ok, true);
        resetMapGpuGuard();
    });
});

describe('map GPU memory options', () => {
    it('lowers the mobile tile cache and disables Standard 3D objects', () => {
        const mobile = mapMemoryOptions(true);
        assert.equal(mobile.maxTileCacheSize, MOBILE_MAX_TILE_CACHE_SIZE);
        assert.equal(mobile.maxTileCacheSize, 10);
        assert.equal(mobile.antialias, false);
        assert.deepEqual(mobile.config, { basemap: { show3dObjects: false } });
        assert.equal(Object.hasOwn(mobile, 'optimizeForTerrain'), false);
        assert.equal(Object.hasOwn(mobile, 'pixelRatio'), false);
    });

    it('keeps the desktop tile cache and does not add a mobile config', () => {
        const desktop = mapMemoryOptions(false);
        assert.equal(desktop.maxTileCacheSize, DESKTOP_MAX_TILE_CACHE_SIZE);
        assert.equal(desktop.maxTileCacheSize, 20);
        assert.equal(desktop.antialias, true);
        assert.equal(desktop.config, undefined);
        assert.equal(Object.hasOwn(desktop, 'optimizeForTerrain'), false);
    });

    it('clears terrain and fill-extrusion once on a mobile map', () => {
        const calls = [];
        const map = {
            setConfigProperty(fragment, key, value) { calls.push(['config', fragment, key, value]); },
            setTerrain(value) { calls.push(['terrain', value]); },
            getStyle() {
                return { layers: [{ id: 'building-3d', type: 'fill-extrusion' }, { id: 'roads', type: 'line' }] };
            },
            setLayoutProperty(id, key, value) { calls.push(['layout', id, key, value]); },
        };
        const once = suppressMobileGpuLayers(map);
        assert.equal(once.objects, true);
        assert.equal(once.terrain, true);
        assert.equal(once.extrusion, 1);
        assert.deepEqual(calls, [
            ['config', 'basemap', 'show3dObjects', false],
            ['terrain', null],
            ['layout', 'building-3d', 'visibility', 'none'],
        ]);
    });
});
