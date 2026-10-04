import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatIsolationHudLines,
    getIsolationContext,
    getIsolationEvents,
    resetIsolationLog,
} from './iosCrashLog.js';
import {
    MAP_LIFECYCLE_KEEP,
    MAP_LIFECYCLE_UNMOUNT_EXPANDED,
    beginMapMount,
    captureMapCamera,
    createMapLifecycleSession,
    createMapMountState,
    finishMapRemove,
    parseMapLifecycle,
    reduceSheetMount,
    cameraForRemount,
    recordMapRemoveFailure,
    releaseMapOwners,
    resetMapLifecycleTracking,
    restoreMapCamera,
    shouldMountMap,
    trackCameraRestore,
    trackMapMount,
    trackMapRemove,
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

describe('map lifecycle mount decision', () => {
    it('keeps the map mounted in keep mode', () => {
        assert.equal(parseMapLifecycle(null), MAP_LIFECYCLE_KEEP);
        assert.equal(parseMapLifecycle(''), MAP_LIFECYCLE_KEEP);
        assert.equal(parseMapLifecycle('keep'), MAP_LIFECYCLE_KEEP);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'keep',
            sheetExpanded: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'keep',
            sheetExpanded: false,
        }), true);
    });

    it('unmounts only at the stable fully expanded state', () => {
        assert.equal(parseMapLifecycle('unmount-expanded'), MAP_LIFECYCLE_UNMOUNT_EXPANDED);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'unmount-expanded',
            sheetExpanded: false,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'unmount-expanded',
            sheetExpanded: true,
        }), false);
    });

    it('ignores intermediate drag values', () => {
        let state = createMapMountState(true);
        state = reduceSheetMount(state, {
            mapboxEnabled: true,
            lifecycle: 'unmount-expanded',
            sheetExpanded: false,
            dragOffset: 12,
        });
        state = reduceSheetMount(state, {
            mapboxEnabled: true,
            lifecycle: 'unmount-expanded',
            sheetExpanded: false,
            dragOffset: 80,
        });
        assert.equal(state.mounted, true);
        assert.equal(state.transitions, 0);
    });

    it('does not repeat a transition for the same sheet state', () => {
        let state = createMapMountState(true);
        const expanded = {
            mapboxEnabled: true,
            lifecycle: 'unmount-expanded',
            sheetExpanded: true,
        };
        state = reduceSheetMount(state, expanded);
        state = reduceSheetMount(state, expanded);
        state = reduceSheetMount(state, expanded);
        assert.equal(state.mounted, false);
        assert.equal(state.transitions, 1);
        state = reduceSheetMount(state, { ...expanded, sheetExpanded: false });
        assert.equal(state.mounted, true);
        assert.equal(state.transitions, 2);
    });

    it('leaves mapbox=0 and the default query unchanged', () => {
        assert.equal(shouldMountMap({
            mapboxEnabled: false,
            lifecycle: 'unmount-expanded',
            sheetExpanded: false,
        }), false);
        assert.equal(shouldMountMap({
            mapboxEnabled: false,
            lifecycle: 'keep',
            sheetExpanded: true,
        }), false);
        assert.equal(parseMapLifecycle(undefined), 'keep');
        assert.equal(parseMapLifecycle('nope'), 'keep');
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: parseMapLifecycle(null),
            sheetExpanded: true,
        }), true);
    });
});

describe('map lifecycle session', () => {
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

    it('sends a map.remove failure to the isolation diagnostic log', () => {
        resetIsolationLog();
        const entry = recordMapRemoveFailure('context dead');
        const events = getIsolationEvents();
        const hud = formatIsolationHudLines();
        assert.equal(entry.kind, 'map-lifecycle');
        assert.equal(entry.message, 'map-remove-failed:context dead');
        assert.equal(events.at(-1).message, 'map-remove-failed:context dead');
        assert.equal(getIsolationContext().mapEvent, 'map-remove-failed:context dead');
        assert.equal(hud.some((line) => line === 'map:map-remove-failed:context dead'), true);
        assert.equal(hud.some((line) => line === 'last:map-lifecycle map-remove-failed:context dead'), true);
        assert.equal(entry.message.includes('map-remove-failed:'), true);
        resetIsolationLog();
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

    it('creates at most one live map and records remove time', () => {
        let session = createMapLifecycleSession();
        const first = beginMapMount(session, 1000);
        assert.equal(first.create, true);
        assert.equal(first.session.liveInstances, 1);
        assert.equal(first.session.mountCount, 1);
        session = finishMapRemove(first.session, 1500);
        assert.equal(session.liveInstances, 0);
        assert.equal(session.removeCount, 1);
        assert.equal(session.lastUnmountAt, 1500);
        assert.equal(finishMapRemove(session, 1600), session);

        const second = beginMapMount(session, 1800);
        assert.equal(second.create, true);
        assert.equal(second.session.mountCount, 2);
        assert.equal(second.session.liveInstances, 1);
        assert.equal(second.session.lastRemountDurationMs, 300);
        const duplicate = beginMapMount(second.session, 1900);
        assert.equal(duplicate.create, false);
        assert.equal(duplicate.session.duplicateDetected, true);
        assert.equal(duplicate.session.liveInstances, 1);
        assert.equal(duplicate.session.mountCount, 2);
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

    it('remounts one instance and restores the camera captured at remove', () => {
        resetMapLifecycleTracking();
        assert.equal(trackMapMount(1000), true);
        assert.equal(cameraForRemount(), null);
        assert.equal(trackCameraRestore('skipped'), 'skipped');
        trackMapRemove({ lng: 144.9, lat: -37.8, zoom: 13, bearing: 0, pitch: 20 }, 1200);
        assert.equal(trackMapMount(1500), true);
        assert.deepEqual(cameraForRemount(), {
            lng: 144.9, lat: -37.8, zoom: 13, bearing: 0, pitch: 20,
        });
        assert.equal(trackMapMount(1600), false);
        const map = fakeMap();
        assert.equal(trackCameraRestore(restoreMapCamera(map, cameraForRemount())), 'success');
        assert.equal(map.jumps.length, 1);
        resetMapLifecycleTracking();
    });
});
