import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyMarkerGesture,
    bindMapGestureListeners,
    completeMarkerSync,
    createSyncScheduler,
    featuresForMarkerSync,
    markerSyncDecision,
    noteMarkerCleanup,
    noteMarkerListeners,
    noteSourceWait,
    releaseMarkerRecord,
    releaseMarkerSyncFrame,
    releaseMarkerRecords,
    requestMarkerSync,
    requiredMarkerGate,
    resumeMayGoLive,
    syncMarkerLayer,
} from './mapMarkerLifecycle.js';

function fakeMarker() {
    const element = {
        parentNode: {},
        removed: false,
        remove() {
            this.removed = true;
            this.parentNode = null;
        },
    };
    element.parentNode.removeChild = () => element.remove();
    return {
        element,
        removed: 0,
        coords: null,
        remove() { this.removed += 1; },
        getElement() { return element; },
        setLngLat(coords) { this.coords = coords; },
    };
}

function spec(id, kind) {
    const marker = fakeMarker();
    return {
        id,
        kind,
        create() {
            return { id, kind, marker, element: marker.element };
        },
    };
}

describe('generation-safe markers', () => {
    it('creates fresh markers for a new map generation', () => {
        const first = syncMarkerLayer({}, 1, [spec('venue-1', 'sun'), spec('cluster-1', 'cluster')]);
        const resumed = syncMarkerLayer(first.markers, 2, [spec('venue-1', 'sun'), spec('cluster-1', 'cluster')]);
        assert.deepEqual(resumed.created, ['venue-1', 'cluster-1']);
        assert.deepEqual(resumed.reused, []);
        assert.equal(resumed.markers['venue-1'].generation, 2);
        assert.equal(first.markers['venue-1'].released, true);
        assert.equal(first.markers['venue-1'].marker.removed, 1);
    });

    it('ignores an old-generation gesture', () => {
        const marker = fakeMarker();
        const record = { generation: 1, marker, element: marker.element, released: false };
        assert.equal(applyMarkerGesture(record, 2, [1, 2]), false);
        assert.equal(marker.coords, null);
        assert.equal(applyMarkerGesture(record, 1, [144.96, -37.81]), true);
        assert.deepEqual(marker.coords, [144.96, -37.81]);
    });

    it('removes each old marker once', () => {
        const layer = syncMarkerLayer({}, 1, [spec('venue-1', 'sun')]);
        const record = layer.markers['venue-1'];
        assert.equal(releaseMarkerRecord(record), true);
        assert.equal(releaseMarkerRecord(record), false);
        assert.equal(record.marker.removed, 1);
        assert.equal(releaseMarkerRecords([record]), 0);
    });

    it('gives a resumed map only the current marker set', () => {
        const first = syncMarkerLayer({}, 1, [spec('venue-old', 'sun'), spec('cluster-old', 'cluster')]);
        const resumed = syncMarkerLayer(first.markers, 2, [spec('venue-new', 'sun')]);
        assert.deepEqual(Object.keys(resumed.markers), ['venue-new']);
        assert.equal(resumed.markers['venue-new'].generation, 2);
        assert.equal(first.markers['venue-old'].released, true);
        assert.equal(first.markers['cluster-old'].released, true);
    });

    it('does not duplicate a cluster or sun marker inside one generation', () => {
        const sun = spec('venue-1', 'sun');
        const cluster = spec('cluster-1', 'cluster');
        const first = syncMarkerLayer({}, 1, [sun, cluster, sun]);
        const again = syncMarkerLayer(first.markers, 1, [spec('venue-1', 'sun'), spec('cluster-1', 'cluster')]);
        assert.deepEqual(first.created, ['venue-1', 'cluster-1']);
        assert.deepEqual(again.reused, ['venue-1', 'cluster-1']);
        assert.deepEqual(again.created, []);
        assert.equal(Object.keys(again.markers).length, 2);
    });

    it('coalesces a second sync while the first frame is still open', () => {
        const first = requestMarkerSync(createSyncScheduler(), 2);
        const second = requestMarkerSync(first.scheduler, 2);
        assert.equal(first.run, true);
        assert.equal(second.run, false);
        assert.equal(second.scheduler.coalesced, 1);
        assert.equal(second.scheduler.passes, 0);
        const done = completeMarkerSync(second.scheduler, { created: 3, reused: 1, removed: 0 });
        assert.equal(done.frame, false);
        assert.equal(done.passes, 1);
        assert.equal(done.created, 3);
        const again = requestMarkerSync(done, 2);
        assert.equal(again.run, true);
        const unchanged = syncMarkerLayer(syncMarkerLayer({}, 2, [spec('venue-1', 'sun')]).markers, 2, [spec('venue-1', 'sun')]);
        assert.deepEqual(unchanged.created, []);
        assert.deepEqual(unchanged.reused, ['venue-1']);
    });

    it('does not sync markers before the cluster source is loaded', () => {
        assert.deepEqual(markerSyncDecision({ sourceLoaded: false }), { sync: false, reason: 'source-not-loaded' });
        assert.equal(markerSyncDecision({ sourceLoaded: true }).sync, true);
        const features = featuresForMarkerSync({
            querySourceFeatures(id) {
                assert.equal(id, 'venues');
                return [{ id: 'venue-1' }];
            },
        }, 'venues');
        assert.equal(features.length, 1);
        assert.deepEqual(featuresForMarkerSync({ querySourceFeatures() { throw new Error('early'); } }, 'venues'), []);
    });

    it('moves a reused cluster marker to the new centroid', () => {
        const marker = fakeMarker();
        const existing = { id: 'cluster-1', kind: 'cluster', generation: 2, marker, element: marker.element, released: false };
        let seen = null;
        const synced = syncMarkerLayer({ 'cluster-1': existing }, 2, [{
            id: 'cluster-1',
            update(record) { seen = record; record.marker.setLngLat([145, -37]); },
            create() { throw new Error('should reuse'); },
        }]);
        assert.equal(synced.reused[0], 'cluster-1');
        assert.equal(seen, existing);
        assert.deepEqual(marker.coords, [145, -37]);
    });

    it('ignores a stale generation while a sync frame is open and starts the next generation after it closes', () => {
        const open = requestMarkerSync(createSyncScheduler(), 2);
        const stale = requestMarkerSync(open.scheduler, 1);
        assert.equal(stale.run, false);
        assert.equal(stale.scheduler.ignored, 1);
        assert.equal(stale.scheduler.generation, 2);
        const done = completeMarkerSync(open.scheduler, { created: 1, clusterCreated: 1 });
        const resumed = requestMarkerSync(done, 3);
        assert.equal(resumed.run, true);
        assert.equal(resumed.scheduler.generation, 3);
        const repeated = requestMarkerSync(completeMarkerSync(resumed.scheduler, { reused: 1 }), 3);
        assert.equal(repeated.run, true);
        assert.equal(repeated.scheduler.passes, 2);
    });

    it('does not treat a loaded source with no features as required marker sync', () => {
        assert.equal(requiredMarkerGate({ sourceLoaded: true, featureCount: 0 }).reason, 'markers-cleared');
        assert.equal(requiredMarkerGate({ sourceLoaded: true, featureCount: 0 }).ready, true);
        assert.equal(requiredMarkerGate({ sourceLoaded: true, featureCount: 12 }).ready, true);
        const locked = requestMarkerSync(createSyncScheduler(), 2);
        const released = releaseMarkerSyncFrame(locked.scheduler);
        assert.equal(released.frame, false);
        assert.equal(requestMarkerSync(released, 2).run, true);
        const waiting = noteSourceWait(requestMarkerSync(createSyncScheduler(), 2).scheduler);
        assert.equal(waiting.frame, false);
        assert.equal(waiting.sourceWaits, 1);
        assert.equal(requestMarkerSync(waiting, 2).run, true);
    });

    it('lets optional marker groups stay pending without blocking required recovery', () => {
        assert.equal(resumeMayGoLive({ requiredMarkersReady: true, userLocationPending: true, sunWeatherPending: true }), true);
        assert.equal(resumeMayGoLive({ requiredMarkersReady: false, userLocationPending: false }), false);
        const listened = noteMarkerListeners(noteMarkerListeners(createSyncScheduler(), 3), 3);
        assert.equal(listened.listeners, 3);
        const cleaned = noteMarkerCleanup(listened, 2);
        assert.equal(noteMarkerCleanup(cleaned, 0).cleanups, 2);
    });

    it('removes projection listeners once and ignores a stale generation', () => {
        const calls = [];
        const map = {
            handlers: {},
            on(type, listener) {
                this.handlers[type] = this.handlers[type] || [];
                this.handlers[type].push(listener);
            },
            off(type, listener) {
                this.handlers[type] = (this.handlers[type] || []).filter((item) => item !== listener);
            },
        };
        let generation = 1;
        const unbind = bindMapGestureListeners(map, 1, () => generation, (type) => calls.push(type));
        map.handlers.move[0]();
        generation = 2;
        map.handlers.moveend[0]();
        assert.deepEqual(calls, ['move']);
        assert.equal(unbind(), true);
        assert.equal(unbind(), false);
        assert.equal(map.handlers.move.length, 0);
        assert.equal(map.handlers.idle.length, 0);
    });
});
