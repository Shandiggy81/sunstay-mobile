import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyMarkerGesture,
    bindMapGestureListeners,
    releaseMarkerRecord,
    releaseMarkerRecords,
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
