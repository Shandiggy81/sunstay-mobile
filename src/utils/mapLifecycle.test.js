import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    beginGenerationTeardown,
    captureGenerationCamera,
    captureMapCamera,
    claimCameraRestore,
    createGenerationCamera,
    dispatchGenerationCallback,
    markerSyncAfterRestore,
    releaseMapOwners,
    restoreMapCamera,
    teardownGenerationCamera,
    trackCameraTimer,
} from './mapLifecycle.js';


function fakeMap(camera = { lng: 144.96, lat: -37.81, zoom: 12, bearing: -17.6, pitch: 45 }) {
    const jumps = [];
    return {
        jumps,
        getCenter: () => ({ lng: camera.lng, lat: camera.lat }),
        getZoom: () => camera.zoom,
        getBearing: () => camera.bearing,
        getPitch: () => camera.pitch,
        jumpTo(options) { jumps.push(options); },
        remove() { this.removed = (this.removed || 0) + 1; },
    };
}

describe('map teardown and camera', () => {
    it('cleans up markers, listeners, and the map once', () => {
        const map = fakeMap();
        const marker = { removed: 0, remove() { this.removed += 1; } };
        const listener = { calls: 0 };
        const target = {
            removeEventListener(type, handler) {
                listener.calls += 1;
                listener.type = type;
                listener.handler = handler;
            },
        };
        const handler = () => {};
        const once = releaseMapOwners({
            markers: [marker],
            listeners: [{ target, type: 'webglcontextlost', handler }],
            map,
        });
        const twice = releaseMapOwners(once);
        assert.equal(marker.removed, 1);
        assert.equal(listener.calls, 1);
        assert.equal(map.removed, 1);
        assert.equal(once.removeCalls, 1);
        assert.equal(twice.removeCalls, 1);
        assert.equal(twice.markerCleanups, 1);
        assert.equal(twice.listenerCleanups, 1);
    });

    it('zeroes the owned canvas before a successful remove and leaves it for Mapbox', () => {
        const container = {};
        const sibling = { parentNode: container, id: 'control' };
        const canvas = {
            width: 64,
            height: 64,
            parentNode: container,
            removed: false,
            remove() { this.removed = true; this.parentNode = null; },
        };
        let sawZero = false;
        const map = {
            removed: 0,
            getCanvas() { return canvas; },
            getContainer() { return container; },
            remove() {
                sawZero = canvas.width === 0 && canvas.height === 0;
                this.removed += 1;
            },
        };
        const handler = () => {};
        const target = {
            removed: [],
            addEventListener() {},
            removeEventListener(type, fn, capture) {
                this.removed.push([type, fn, capture]);
            },
        };
        const once = releaseMapOwners({
            markers: [],
            listeners: [{ target, type: 'webglcontextlost', handler, capture: true }],
            map,
        });
        const twice = releaseMapOwners(once);
        assert.equal(sawZero, true);
        assert.equal(canvas.width, 0);
        assert.equal(canvas.height, 0);
        assert.equal(canvas.removed, false);
        assert.equal(canvas.parentNode, container);
        assert.equal(sibling.parentNode, container);
        assert.equal(once.canvasReset, true);
        assert.equal(once.canvasRemoved, false);
        assert.equal(once.removeError, null);
        assert.equal(map.removed, 1);
        assert.equal(twice.removeCalls, 1);
        assert.deepEqual(target.removed, [['webglcontextlost', handler, true]]);
    });

    it('removes only the owned canvas when map.remove throws', () => {
        const container = {};
        const sibling = { parentNode: container };
        const canvas = {
            width: 32,
            height: 32,
            parentNode: container,
            removed: 0,
            remove() { this.removed += 1; this.parentNode = null; },
        };
        const outsider = { parentNode: {}, removed: 0, remove() { this.removed += 1; } };
        let removes = 0;
        const map = {
            getCanvas() { return canvas; },
            getContainer() { return container; },
            remove() {
                removes += 1;
                throw new Error('context dead');
            },
        };
        const once = releaseMapOwners({ markers: [], listeners: [], map });
        releaseMapOwners(once);
        assert.equal(removes, 1);
        assert.equal(canvas.width, 0);
        assert.equal(canvas.height, 0);
        assert.equal(canvas.removed, 1);
        assert.equal(canvas.parentNode, null);
        assert.equal(sibling.parentNode, container);
        assert.equal(outsider.removed, 0);
        assert.equal(once.removeError, 'context dead');
        assert.equal(once.canvasRemoved, true);
        assert.equal(once.released, true);
    });

    it('does not detach a canvas that is not a child of the owned container', () => {
        const container = {};
        const canvas = {
            width: 8,
            height: 8,
            parentNode: { id: 'elsewhere' },
            removed: 0,
            remove() { this.removed += 1; },
        };
        const map = {
            getCanvas() { return canvas; },
            getContainer() { return container; },
            remove() { throw new Error('lost'); },
        };
        const released = releaseMapOwners({ markers: [], listeners: [], map });
        assert.equal(canvas.removed, 0);
        assert.equal(released.canvasRemoved, false);
        assert.equal(released.removeError, 'lost');
    });

    it('removes a marker popup and a detached marker element once', () => {
        const parent = {
            child: null,
            removeChild(node) {
                if (this.child === node) this.child = null;
            },
        };
        const element = {
            parentNode: parent,
            remove() { parent.removeChild(this); },
        };
        parent.child = element;
        const popup = { removed: 0, remove() { this.removed += 1; } };
        const marker = {
            removed: 0,
            remove() { this.removed += 1; },
            getPopup: () => popup,
            getElement: () => element,
        };
        releaseMapOwners({ markers: [marker], listeners: [], map: null });
        releaseMapOwners({ markers: [marker], listeners: [], map: { remove() { throw new Error('second'); } }, released: true });
        assert.equal(marker.removed, 1);
        assert.equal(popup.removed, 1);
        assert.equal(parent.child, null);
    });

    it('restores a captured camera with jumpTo and skips a missing camera', () => {
        const map = fakeMap();
        const camera = captureMapCamera(map);
        assert.deepEqual(camera, { lng: 144.96, lat: -37.81, zoom: 12, bearing: -17.6, pitch: 45 });
        assert.equal(restoreMapCamera(map, camera), 'success');
        assert.deepEqual(map.jumps[0].center, [144.96, -37.81]);
        assert.equal(map.jumps[0].zoom, 12);
        assert.equal(restoreMapCamera(map, null), 'skipped');
        assert.equal(restoreMapCamera(null, camera), 'failure');
        assert.equal(captureMapCamera(null), null);
        const throwing = { jumpTo() { throw new Error('jump failed'); } };
        assert.equal(restoreMapCamera(throwing, camera), 'failure');
    });

    it('restores the camera once per generation', () => {
        const first = claimCameraRestore(null, 2);
        assert.equal(first.restore, true);
        const second = claimCameraRestore(first.claimed, 2);
        assert.equal(second.restore, false);
        assert.equal(claimCameraRestore(second.claimed, 3).restore, true);
    });

    it('syncs markers only for the ready, current generation', () => {
        assert.equal(markerSyncAfterRestore({ mapReady: false, generation: 1, currentGeneration: 1 }).sync, false);
        assert.equal(markerSyncAfterRestore({ mapReady: true, generation: 1, currentGeneration: 2 }).sync, false);
        assert.equal(markerSyncAfterRestore({ mapReady: true, generation: 2, currentGeneration: 2 }).sync, true);
    });
});

function stoppedMap() {
    return {
        stops: 0,
        flew: 0,
        resized: 0,
        center: { lng: 144.1, lat: -37.1 },
        zoom: 12,
        bearing: 0,
        pitch: 0,
        stop() {
            this.stops += 1;
            this.center = { lng: 144.9631, lat: -37.8136 };
            this.zoom = 15;
            this.bearing = -17.6;
            this.pitch = 45;
        },
        getCenter() { return this.center; },
        getZoom() { return this.zoom; },
        getBearing() { return this.bearing; },
        getPitch() { return this.pitch; },
        flyTo() { this.flew += 1; },
        resize() { this.resized += 1; },
    };
}

describe('generation camera teardown', () => {
    it('cancels a pending fly-to, stops, then captures the stopped camera once', () => {
        const map = stoppedMap();
        let fired = false;
        const timer = {
            cleared: false,
            cancel() { this.cleared = true; },
            fire(guard) {
                const decision = dispatchGenerationCallback(guard, 1, 'flyTo', () => {
                    fired = true;
                    map.flyTo();
                });
                return decision;
            },
        };
        let guard = trackCameraTimer(createGenerationCamera(1), timer);
        guard = { ...guard, active: false };
        guard = teardownGenerationCamera(guard, map);
        const late = timer.fire(guard);
        assert.equal(timer.cleared, true);
        assert.equal(fired, false);
        assert.equal(late.ran, false);
        assert.equal(map.stops, 1);
        assert.equal(map.flew, 0);
        assert.deepEqual(guard.order, ['stop', 'capture']);
        assert.equal(guard.captures, 1);
        assert.deepEqual(guard.camera, {
            lng: 144.9631, lat: -37.8136, zoom: 15, bearing: -17.6, pitch: 45,
        });
        const early = captureGenerationCamera(createGenerationCamera(1), map);
        assert.equal(early.captured, false);
        assert.equal(early.captures, 0);
        const again = teardownGenerationCamera(guard, map);
        assert.equal(map.stops, 1);
        assert.equal(again.captures, 1);
        assert.equal(again.camera.lng, 144.9631);
        assert.equal(beginGenerationTeardown(again, map), again);
    });

    it('ignores stale fly, resize, moveend, idle, and marker sync on the current map', () => {
        const map = stoppedMap();
        const retired = teardownGenerationCamera(createGenerationCamera(1), map);
        const current = createGenerationCamera(2);
        let synced = 0;
        const fly = dispatchGenerationCallback(retired, 1, 'flyTo', () => map.flyTo());
        const resize = dispatchGenerationCallback(fly.state, 1, 'resize', () => map.resize());
        const moveend = dispatchGenerationCallback(resize.state, 1, 'moveend', () => map.flyTo());
        const idle = dispatchGenerationCallback(moveend.state, 1, 'idle', () => map.resize());
        const sync = dispatchGenerationCallback(idle.state, 1, 'marker-sync', () => { synced += 1; });
        assert.equal(fly.ran, false);
        assert.equal(resize.ran, false);
        assert.equal(moveend.ran, false);
        assert.equal(idle.ran, false);
        assert.equal(sync.ran, false);
        assert.equal(map.flew, 0);
        assert.equal(map.resized, 0);
        assert.equal(synced, 0);
        assert.deepEqual(sync.state.ignored, ['flyTo', 'resize', 'moveend', 'idle', 'marker-sync']);
        const live = dispatchGenerationCallback(current, 2, 'flyTo', () => map.flyTo());
        assert.equal(live.ran, true);
        assert.equal(map.flew, 1);
        assert.equal(current.generation, 2);
    });
});

describe('incomplete generation guards', () => {
    it('returns { state, ran } and never a camera property', () => {
        let ran = 0;
        const decision = dispatchGenerationCallback(createGenerationCamera(4), 4, 'resize', () => {
            ran += 1;
        });
        assert.deepEqual(Object.keys(decision).sort(), ['ran', 'state']);
        assert.equal(decision.ran, true);
        assert.equal(decision.camera, undefined);
        assert.equal(decision.state.generation, 4);
        assert.equal(ran, 1);
        assert.equal(/decision\.camera|settled\.camera/.test(
            readFileSync(new URL('../components/Map/VenueMap.jsx', import.meta.url), 'utf8'),
        ), false);
    });

    it('tears down null, undefined, and empty guards without throwing', () => {
        for (const incomplete of [null, undefined, {}, { active: false }, { timers: undefined }, { order: undefined }, { ignored: undefined }]) {
            const begun = beginGenerationTeardown(incomplete, null);
            const captured = captureGenerationCamera(incomplete, null);
            const torn = teardownGenerationCamera(incomplete, null);
            assert.equal(Array.isArray(begun.timers), true);
            assert.equal(Array.isArray(begun.order), true);
            assert.equal(captured.captured === true || captured.captured === false, true);
            assert.equal(Number.isFinite(torn.stopCalls), true);
            assert.equal(Array.isArray(torn.order), true);
        }
        assert.equal(captureGenerationCamera({}, null).captured, false);
        assert.equal(beginGenerationTeardown({}, null).stopCalls, 1);
        assert.deepEqual(beginGenerationTeardown({ timers: undefined, order: undefined }, null).timers, []);
        assert.deepEqual(beginGenerationTeardown({ timers: undefined, order: undefined }, null).order, []);
    });

    it('normalizes missing ignored, order, and timers arrays', () => {
        let called = 0;
        const stale = dispatchGenerationCallback(
            { active: false, generation: 1, ignored: undefined },
            1,
            'marker-sync',
            () => { called += 1; },
        );
        assert.equal(stale.ran, false);
        assert.equal(called, 0);
        assert.deepEqual(stale.state.ignored, ['marker-sync']);
        const shot = captureGenerationCamera({
            active: false,
            stopCalls: 1,
            captures: 0,
            order: undefined,
        }, null);
        assert.equal(shot.captured, true);
        assert.deepEqual(shot.order, ['capture']);
        const stopped = beginGenerationTeardown({
            active: true,
            generation: 2,
            stopCalls: 0,
            timers: undefined,
            order: undefined,
        }, null);
        assert.deepEqual(stopped.timers, []);
        assert.deepEqual(stopped.order, []);
    });

    it('stops and captures an empty guard once, and records a real stop failure', () => {
        const map = {
            stops: 0,
            stop() { this.stops += 1; },
            getCenter() { return { lng: 144.9631, lat: -37.8136 }; },
            getZoom() { return 15; },
            getBearing() { return 0; },
            getPitch() { return 0; },
        };
        const once = teardownGenerationCamera({}, map);
        const twice = teardownGenerationCamera(once, map);
        assert.equal(map.stops, 1);
        assert.equal(once.captures, 1);
        assert.equal(twice.captures, 1);
        assert.equal(twice.stopCalls, 1);
        const failing = {
            stops: 0,
            stop() {
                this.stops += 1;
                throw new Error('style is not done loading');
            },
        };
        const failed = beginGenerationTeardown(createGenerationCamera(1), failing);
        const failedAgain = beginGenerationTeardown(failed, failing);
        assert.equal(failing.stops, 1);
        assert.deepEqual(failed.order, ['stop-failed']);
        assert.equal(failedAgain, failed);
    });

    it('ignores stale flyTo, resize, and marker sync after teardown', () => {
        const map = {
            flew: 0,
            resized: 0,
            stop() {},
            flyTo() { this.flew += 1; },
            resize() { this.resized += 1; },
        };
        const retired = teardownGenerationCamera(createGenerationCamera(1), map);
        let synced = 0;
        const fly = dispatchGenerationCallback(retired, 1, 'flyTo', () => map.flyTo());
        const resize = dispatchGenerationCallback(fly.state, 1, 'resize', () => map.resize());
        const sync = dispatchGenerationCallback(resize.state, 1, 'marker-sync', () => { synced += 1; });
        assert.equal(fly.ran, false);
        assert.equal(resize.ran, false);
        assert.equal(sync.ran, false);
        assert.equal(map.flew, 0);
        assert.equal(map.resized, 0);
        assert.equal(synced, 0);
        assert.deepEqual(sync.state.ignored, ['flyTo', 'resize', 'marker-sync']);
    });
});
