import { readFileSync } from 'node:fs';
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
    isIosSafari,
    selectMapLifecycle,
    staticOffloadEnabled,
    reduceSheetMount,
    MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
    MAP_OFFLOAD_SETTLE_MS,
    cameraForRemount,
    createStaticOffloadState,
    markerSyncAfterRestore,
    recordMapRemoveFailure,
    reduceStaticOffload,
    releaseMapOwners,
    resetMapLifecycleTracking,
    restoreMapCamera,
    shouldMountMap,
    MAP_OFFLOAD_PLACEHOLDER_COPY,
    beginGenerationTeardown,
    captureGenerationCamera,
    createGenerationCamera,
    dispatchGenerationCallback,
    staticOffloadHidesMap,
    teardownGenerationCamera,
    trackCameraRestore,
    trackCameraTimer,
    trackMapMount,
    trackMapRemove,
} from './mapLifecycle.js';
import { releaseMarkerRecord } from './mapMarkerLifecycle.js';
import {
    createMapRecoveryState,
    mapRecoveryControl,
    noteContextLost,
    requestMapResume,
} from './mapRecovery.js';

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

    it('defaults to static-when-expanded on iOS Safari and keep everywhere else', () => {
        const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
        const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
        const ipod = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
        const ipadosDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
        const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
        const crios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
        const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        assert.equal(isIosSafari(iphone), true);
        assert.equal(isIosSafari(ipad), true);
        assert.equal(isIosSafari(ipod), true);
        assert.equal(isIosSafari(ipadosDesktop), false);
        assert.equal(isIosSafari(android), false);
        assert.equal(isIosSafari(crios), false);
        assert.equal(isIosSafari(desktop), false);
        assert.equal(isIosSafari(''), false);
        assert.equal(selectMapLifecycle(null, { userAgent: iphone }), MAP_LIFECYCLE_STATIC_WHEN_EXPANDED);
        assert.equal(selectMapLifecycle(undefined, { userAgent: android }), MAP_LIFECYCLE_KEEP);
        assert.equal(selectMapLifecycle(null, { userAgent: desktop }), MAP_LIFECYCLE_KEEP);
        assert.equal(selectMapLifecycle(null, { userAgent: ipadosDesktop }), MAP_LIFECYCLE_KEEP);
        assert.equal(selectMapLifecycle('keep', { userAgent: iphone }), MAP_LIFECYCLE_KEEP);
        assert.equal(selectMapLifecycle('nope', { userAgent: iphone }), MAP_LIFECYCLE_KEEP);
        assert.equal(staticOffloadEnabled({
            lifecycle: selectMapLifecycle(null, { userAgent: iphone }),
            iosSafari: true,
            matrixHud: false,
        }), true);
        assert.equal(staticOffloadEnabled({
            lifecycle: 'keep',
            iosSafari: true,
            matrixHud: false,
        }), false);
        assert.equal(staticOffloadEnabled({
            lifecycle: 'static-when-expanded',
            iosSafari: false,
            matrixHud: false,
        }), false);
        assert.equal(staticOffloadEnabled({
            lifecycle: 'static-when-expanded',
            iosSafari: false,
            matrixHud: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'static-when-expanded',
            diagnostic: staticOffloadEnabled({
                lifecycle: 'static-when-expanded',
                iosSafari: true,
                matrixHud: false,
            }),
            offloadCommitted: true,
        }), false);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'keep',
            sheetExpanded: true,
            diagnostic: false,
            offloadCommitted: true,
        }), true);
        const venueMap = readFileSync(new URL('../components/Map/VenueMap.jsx', import.meta.url), 'utf8');
        assert.equal(venueMap.includes("Sentry.captureMessage('WebGL Context Lost'"), true);
        assert.equal(venueMap.includes('isMobileDevice'), true);
        assert.equal(venueMap.includes('iPhone|iPad|iPod|Android'), true);
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

const STATIC = {
    lifecycle: MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
    diagnostic: true,
    mapboxEnabled: true,
};

function sample(state, extra) {
    return reduceStaticOffload(state, { type: 'sample', at: 0, ...STATIC, ...extra });
}

function settle(state, extra) {
    return reduceStaticOffload(state, {
        type: 'settle',
        at: MAP_OFFLOAD_SETTLE_MS,
        expanded: true,
        dragging: false,
        liveInstances: 0,
        ...STATIC,
        ...extra,
    });
}

describe('static-when-expanded offload', () => {
    const camera = { lng: 144.9631, lat: -37.8136, zoom: 14, bearing: -17.6, pitch: 45 };

    it('keeps the map mounted for keep, unknown modes, and the production default', () => {
        assert.equal(parseMapLifecycle('static-when-expanded'), MAP_LIFECYCLE_STATIC_WHEN_EXPANDED);
        assert.equal(parseMapLifecycle('nope'), 'keep');
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'keep',
            sheetExpanded: true,
            diagnostic: true,
            offloadCommitted: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'static-when-expanded',
            diagnostic: false,
            offloadCommitted: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: false,
            lifecycle: 'static-when-expanded',
            diagnostic: true,
            sheetExpanded: true,
        }), false);
        const production = sample(createStaticOffloadState(), {
            diagnostic: false,
            expanded: true,
            dragging: false,
        });
        assert.equal(production.state.phase, 'live');
        assert.equal(production.state.offloads, 0);
        assert.deepEqual(production.traces, []);
    });

    it('does not offload during a drag or before the sheet stays expanded', () => {
        const dragging = sample(createStaticOffloadState(), { expanded: true, dragging: true });
        assert.equal(dragging.state.phase, 'live');
        assert.equal(dragging.state.offloads, 0);
        const armed = sample(createStaticOffloadState(), { expanded: true, dragging: false, at: 1000 });
        assert.equal(armed.state.phase, 'offload-arming');
        assert.deepEqual(armed.traces, ['map-offload-requested']);
        const early = settle(armed.state, { at: 1000 + MAP_OFFLOAD_SETTLE_MS - 1, expanded: true });
        assert.equal(early.state.phase, 'offload-arming');
        assert.equal(early.state.offloads, 0);
        const dragged = settle(armed.state, { at: 1000 + MAP_OFFLOAD_SETTLE_MS, dragging: true, expanded: true });
        assert.equal(dragged.state.phase, 'live');
        assert.equal(dragged.traces.at(-1), 'map-offload-skipped');
        const forecast = sample(createStaticOffloadState(), {
            expanded: true,
            dragging: false,
            source: 'sun-forecast-open',
        });
        assert.equal(forecast.state.phase, 'live');
        assert.equal(forecast.state.offloads, 0);
    });

    it('coalesces repeated expanded samples into one offload and one camera save', () => {
        let step = sample(createStaticOffloadState(), { expanded: true, dragging: false, at: 0 });
        step = sample(step.state, { expanded: true, dragging: false, at: 50 });
        step = sample(step.state, { expanded: true, dragging: false, at: 100 });
        assert.equal(step.state.traces.filter((name) => name === 'map-offload-requested').length, 1);
        const started = settle(step.state, { at: MAP_OFFLOAD_SETTLE_MS, camera, liveInstances: 1 });
        const again = settle(started.state, { at: MAP_OFFLOAD_SETTLE_MS + 10, camera, liveInstances: 1 });
        assert.equal(started.state.offloads, 1);
        assert.equal(started.state.liveInstances, 1);
        assert.equal(again.state.offloads, 1);
        assert.deepEqual(started.state.camera, camera);
        assert.equal(started.state.cameraSaves, 1);
        const removed = reduceStaticOffload(started.state, {
            type: 'removed',
            camera: { lng: 0, lat: 0, zoom: 1, bearing: 0, pitch: 0 },
            ...STATIC,
        });
        const removedAgain = reduceStaticOffload(removed.state, { type: 'removed', ...STATIC });
        assert.equal(removed.state.removes, 1);
        assert.equal(removed.state.liveInstances, 0);
        assert.equal(removed.state.cameraSaves, 1);
        assert.equal(removed.state.camera.lng, 144.9631);
        assert.deepEqual(removedAgain.traces, []);
        assert.equal(removedAgain.state.removes, 1);
        assert.equal(staticOffloadHidesMap(removed.state.phase), true);
    });

    it('restores one generation after the sheet stays closed and waits for that map', () => {
        let state = settle(sample(createStaticOffloadState(), { expanded: true, dragging: false }).state, {
            camera,
        }).state;
        state = reduceStaticOffload(state, { type: 'removed', camera, ...STATIC }).state;
        assert.equal(state.liveInstances, 0);
        const arming = sample(state, { expanded: false, dragging: false, at: 800 });
        const dragged = sample(arming.state, { expanded: false, dragging: true, at: 900 });
        assert.equal(dragged.state.phase, 'offloaded');
        assert.equal(dragged.state.restores, 0);
        const requested = sample(dragged.state, { expanded: false, dragging: false, at: 1000 });
        assert.deepEqual(requested.traces, ['map-restore-requested']);
        const again = sample(requested.state, { expanded: false, dragging: false, at: 1100 });
        assert.deepEqual(again.traces, []);
        const blocked = settle(requested.state, {
            at: 1000 + MAP_OFFLOAD_SETTLE_MS,
            expanded: false,
            liveInstances: 1,
        });
        assert.equal(blocked.state.phase, 'offloaded');
        assert.equal(blocked.state.restores, 0);
        const restored = settle(requested.state, {
            at: 1000 + MAP_OFFLOAD_SETTLE_MS,
            expanded: false,
            liveInstances: 0,
            initLock: false,
        });
        assert.equal(restored.state.phase, 'restoring');
        assert.equal(restored.state.restores, 1);
        assert.equal(restored.state.generationsCreated, 1);
        assert.equal(restored.state.activeGeneration, 2);
        assert.equal(restored.state.liveInstances, 1);
        assert.deepEqual(restored.traces, ['map-restore-start']);
        const second = settle(restored.state, { at: 2000, expanded: false, liveInstances: 0 });
        assert.equal(second.state.restores, 1);
        const waiting = reduceStaticOffload(restored.state, {
            type: 'markers-ready',
            generation: 2,
            mapReady: false,
            ...STATIC,
        });
        assert.equal(waiting.state.phase, 'restoring');
        assert.equal(waiting.state.markerSyncs, 0);
        assert.deepEqual(markerSyncAfterRestore({
            mapReady: false,
            generation: 2,
            currentGeneration: 2,
        }), { sync: false, reason: 'map-not-ready' });
        const stale = reduceStaticOffload(restored.state, {
            type: 'markers-ready',
            generation: 1,
            mapReady: true,
            ...STATIC,
        });
        assert.equal(stale.state.phase, 'restoring');
        assert.equal(stale.state.markerSyncs, 0);
        const ready = reduceStaticOffload(restored.state, {
            type: 'map-ready',
            generation: 2,
            ...STATIC,
        });
        const synced = reduceStaticOffload(ready.state, {
            type: 'markers-ready',
            generation: 2,
            ...STATIC,
        });
        assert.equal(synced.state.phase, 'live');
        assert.equal(synced.state.markerSyncs, 1);
        assert.equal(synced.state.cameraRestores, 1);
        assert.equal(synced.state.placeholder, false);
        assert.deepEqual(synced.traces, ['map-restore-complete']);
        const repeat = reduceStaticOffload(synced.state, {
            type: 'markers-ready',
            generation: 2,
            mapReady: true,
            ...STATIC,
        });
        assert.equal(repeat.state.cameraRestores, 1);
        assert.equal(repeat.state.markerSyncs, 1);
    });

    it('releases old markers once and does not retry a failed restore', () => {
        const element = { parentNode: { removeChild() { element.parentNode = null; } }, remove() { this.parentNode = null; } };
        const record = { released: false, element, marker: { removed: 0, remove() { this.removed += 1; } } };
        assert.equal(releaseMarkerRecord(record), true);
        assert.equal(releaseMarkerRecord(record), false);
        assert.equal(record.marker.removed, 1);
        let state = settle(sample(createStaticOffloadState(), { expanded: true, dragging: false }).state).state;
        state = reduceStaticOffload(state, { type: 'removed', camera, ...STATIC }).state;
        state = sample(state, { expanded: false, dragging: false, at: 0 }).state;
        state = settle(state, { expanded: false, liveInstances: 0, at: MAP_OFFLOAD_SETTLE_MS }).state;
        const failed = reduceStaticOffload(state, { type: 'restore-failed', liveInstances: 1, ...STATIC });
        const failedAgain = reduceStaticOffload(failed.state, { type: 'restore-failed', ...STATIC });
        const retry = sample(failed.state, { expanded: false, dragging: false, at: 5000 });
        assert.equal(failed.state.phase, 'restore-failed');
        assert.equal(failed.state.restores, 1);
        assert.deepEqual(failedAgain.traces, []);
        assert.equal(retry.state.phase, 'restore-failed');
        assert.equal(retry.state.restores, 1);
        assert.equal(failed.state.liveInstances, 1);
    });

    it('leaves a second context loss on the existing session lock', () => {
        const live = { ...createMapRecoveryState(), phase: 'live', generation: 1 };
        const first = noteContextLost(live, 1, 0);
        const second = noteContextLost({ ...first.state, phase: 'live', generation: 2 }, 2, 10);
        assert.equal(second.state.sessionLocked, true);
        assert.equal(requestMapResume(second.state, 20).reason, 'session-locked');
        const offload = sample(createStaticOffloadState(), { expanded: true, dragging: false });
        assert.equal(offload.state.phase, 'offload-arming');
        assert.equal(second.state.sessionLocked, true);
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

    it('keeps the offload placeholder distinct from WebGL recovery copy', () => {
        assert.equal(MAP_OFFLOAD_PLACEHOLDER_COPY, 'Map paused while viewing venue');
        const live = { ...createMapRecoveryState(), phase: 'live', generation: 1 };
        const paused = noteContextLost(live, 1, 1000);
        const locked = noteContextLost({ ...paused.state, phase: 'live', generation: 2 }, 2, 2000);
        const resumeFailed = { ...locked.state, phase: 'resume-failed' };
        const messages = [
            mapRecoveryControl(paused.state, 1000).status,
            mapRecoveryControl(locked.state, 2000).status,
            mapRecoveryControl(resumeFailed, 2000).status,
        ];
        assert.deepEqual(messages, [
            'Map paused. Tap Resume map to try again.',
            'Map paused for this session. Reload the page to try again.',
            'Map could not be resumed. Reload the page to try again.',
        ]);
        for (const message of messages) {
            assert.equal(message === MAP_OFFLOAD_PLACEHOLDER_COPY, false);
        }
        const traces = [
            'map-offload-requested',
            'map-offload-start',
            'map-offload-complete',
            'map-restore-requested',
            'map-restore-start',
            'map-restore-complete',
            'map-restore-failed',
        ];
        assert.equal(traces.includes('context-loss'), false);
        assert.equal(traces.includes('map-context-loss'), false);
    });
});

describe('static-when-expanded sheet transition', () => {
    const venueSource = readFileSync(new URL('../components/Map/VenueMap.jsx', import.meta.url), 'utf8');

    function liveMap() {
        return {
            stops: 0,
            flew: 0,
            resized: 0,
            removed: false,
            center: { lng: 144.9631, lat: -37.8136 },
            zoom: 14,
            bearing: -17.6,
            pitch: 0,
            stop() { this.stops += 1; },
            flyTo() { this.flew += 1; },
            resize() { this.resized += 1; },
            remove() { this.removed = true; },
            getCenter() { return this.center; },
            getZoom() { return this.zoom; },
            getBearing() { return this.bearing; },
            getPitch() { return this.pitch; },
        };
    }

    function remember(guard, generation, kind, run) {
        const decision = dispatchGenerationCallback(guard, generation, kind, run);
        return decision.state;
    }

    function unmountMap(guard, map) {
        const inactive = { ...guard, active: false };
        return teardownGenerationCamera(inactive, map);
    }

    it('unmounts once after the expanded sheet settles and keeps the generation guard', () => {
        assert.equal(/decision\.camera|settled\.camera/.test(venueSource), false);
        assert.equal(venueSource.includes('cameraGuardRef.current = decision.state'), true);
        assert.equal(venueSource.includes('cameraGuardRef.current = settled.state'), true);

        const map = liveMap();
        let reactUpdates = 0;
        let guard = remember(createGenerationCamera(1), 1, 'marker-sync', () => {
            reactUpdates += 1;
        });
        guard = remember(guard, 1, 'resize', () => {
            map.resize();
        });
        assert.equal(guard.generation, 1);
        assert.equal(Array.isArray(guard.timers), true);
        assert.equal(reactUpdates, 1);
        assert.equal(map.resized, 1);

        const armed = sample(createStaticOffloadState(), {
            expanded: true,
            dragging: false,
            at: 1000,
        });
        assert.equal(armed.state.phase, 'offload-arming');
        assert.equal(armed.traces[0], 'map-offload-requested');
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
            diagnostic: true,
            offloadCommitted: staticOffloadHidesMap(armed.state.phase),
        }), true);

        const offloaded = settle(armed.state, {
            at: 1000 + MAP_OFFLOAD_SETTLE_MS,
            expanded: true,
            liveInstances: 1,
        });
        assert.equal(offloaded.state.phase, 'offloaded');
        assert.equal(offloaded.state.offloads, 1);
        assert.equal(offloaded.state.removes, 0);
        assert.equal(offloaded.state.liveInstances, 1);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
            diagnostic: true,
            offloadCommitted: staticOffloadHidesMap(offloaded.state.phase),
        }), false);

        const retired = unmountMap(guard, map);
        assert.equal(map.stops, 1);
        assert.equal(retired.stopCalls, 1);
        assert.equal(retired.captures, 1);
        const removed = reduceStaticOffload(offloaded.state, { type: 'removed', ...STATIC });
        const removedAgain = reduceStaticOffload(removed.state, { type: 'removed', ...STATIC });
        assert.equal(removed.state.removes, 1);
        assert.equal(removed.state.liveInstances, 0);
        assert.equal(removedAgain.state.removes, 1);
        assert.equal(unmountMap(retired, map).stopCalls, 1);

        const stale = dispatchGenerationCallback(retired, 1, 'flyTo', () => {
            reactUpdates += 10;
            map.flyTo();
        });
        assert.equal(stale.ran, false);
        assert.equal(reactUpdates, 1);
        assert.equal(map.flew, 0);
    });

    it('restores one generation after a selected venue closes', () => {
        const map = liveMap();
        let reactUpdates = 0;
        let guard = remember(createGenerationCamera(1), 1, 'flyTo', () => {
            map.flyTo();
        });
        assert.equal(guard.generation, 1);
        assert.equal(map.flew, 1);

        const covered = sample(createStaticOffloadState(), {
            expanded: true,
            dragging: false,
            at: 2000,
        });
        const offloaded = settle(covered.state, {
            at: 2000 + MAP_OFFLOAD_SETTLE_MS,
            expanded: true,
            liveInstances: 1,
            camera: { lng: 144.9631, lat: -37.8136, zoom: 15, bearing: -17.6, pitch: 45 },
        });
        assert.equal(offloaded.state.phase, 'offloaded');
        assert.equal(offloaded.state.removes, 0);
        const retired = unmountMap(guard, map);
        const removed = reduceStaticOffload(offloaded.state, { type: 'removed', ...STATIC });
        assert.equal(removed.state.removes, 1);
        assert.equal(map.stops, 1);

        const closing = sample(removed.state, { expanded: false, dragging: false, at: 4000 });
        assert.equal(closing.state.phase, 'restore-arming');
        assert.equal(closing.traces[0], 'map-restore-requested');
        const restoring = settle(closing.state, {
            at: 4000 + MAP_OFFLOAD_SETTLE_MS,
            expanded: false,
            liveInstances: 0,
            initLock: false,
        });
        assert.equal(restoring.state.phase, 'restoring');
        assert.equal(restoring.state.restores, 1);
        assert.equal(restoring.state.generationsCreated, 1);
        assert.equal(restoring.state.liveInstances, 1);
        assert.equal(restoring.traces[0], 'map-restore-start');
        const again = settle(restoring.state, {
            at: 5000,
            expanded: false,
            liveInstances: 0,
        });
        assert.equal(again.state.generationsCreated, 1);
        assert.equal(again.state.liveInstances, 1);

        const next = remember(createGenerationCamera(restoring.state.activeGeneration), restoring.state.activeGeneration, 'flyTo', () => {
            reactUpdates += 1;
            map.flyTo();
        });
        const stale = dispatchGenerationCallback(retired, 1, 'marker-sync', () => {
            reactUpdates += 5;
        });
        assert.equal(next.generation, restoring.state.activeGeneration);
        assert.equal(stale.ran, false);
        assert.equal(reactUpdates, 1);
        assert.equal(map.flew, 2);
    });

    it('leaves keep, a hidden matrix HUD, and mapbox=0 on their existing paths', () => {
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: 'keep',
            sheetExpanded: true,
            diagnostic: true,
            offloadCommitted: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: true,
            lifecycle: MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
            sheetExpanded: true,
            diagnostic: false,
            offloadCommitted: true,
        }), true);
        assert.equal(shouldMountMap({
            mapboxEnabled: false,
            lifecycle: MAP_LIFECYCLE_STATIC_WHEN_EXPANDED,
            sheetExpanded: true,
            diagnostic: true,
            offloadCommitted: true,
        }), false);
        const hiddenHud = sample(createStaticOffloadState(), {
            diagnostic: false,
            expanded: true,
            dragging: false,
        });
        const mapboxOff = sample(createStaticOffloadState(), {
            mapboxEnabled: false,
            expanded: true,
            dragging: false,
        });
        assert.equal(hiddenHud.state.phase, 'live');
        assert.equal(hiddenHud.state.offloads, 0);
        assert.equal(mapboxOff.state.phase, 'live');
        assert.equal(mapboxOff.state.offloads, 0);
        assert.equal(MAP_OFFLOAD_PLACEHOLDER_COPY, 'Map paused while viewing venue');
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
