import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    removeStaleMarkers,
    syncExistingClusterMarker,
} from './syncClusterMarkers.js';

function fakeMarker(lngLat) {
    const calls = [];
    return {
        calls,
        setLngLat(coords) {
            calls.push(['setLngLat', coords]);
            this._lngLat = coords;
            return this;
        },
        remove() {
            calls.push(['remove']);
        },
        getLngLat() {
            return this._lngLat || lngLat;
        },
        _lngLat: lngLat,
    };
}

describe('syncExistingClusterMarker', () => {
    it('moves the existing cluster marker to the updated centroid before updating count', () => {
        const order = [];
        const marker = {
            setLngLat(coords) {
                order.push(`lnglat:${coords.join(',')}`);
                return this;
            },
        };
        const existing = { marker, el: {}, count: 3 };
        syncExistingClusterMarker(existing, [144.96, -37.81], 8, {
            updateCount(record, count) {
                order.push(`count:${count}`);
                record.el.count = count;
            },
        });
        assert.deepEqual(order, ['lnglat:144.96,-37.81', 'count:8']);
        assert.equal(existing.count, 8);
        assert.deepEqual(marker.setLngLat ? existing.marker : null, marker);
    });

    it('still moves the marker when the cluster count is unchanged', () => {
        const marker = fakeMarker([144.9, -37.8]);
        const existing = { marker, el: {}, count: 4 };
        syncExistingClusterMarker(existing, [145.0, -37.82], 4, {
            updateCount() {
                assert.fail('count should not be rewritten when it is unchanged');
            },
        });
        assert.deepEqual(marker.calls, [['setLngLat', [145.0, -37.82]]]);
        assert.equal(existing.count, 4);
    });
});

describe('removeStaleMarkers', () => {
    it('removes cluster markers that are no longer in the rendered set', () => {
        const kept = fakeMarker([144.96, -37.81]);
        const gone = fakeMarker([144.97, -37.82]);
        const prev = {
            'cluster-1': { marker: kept, count: 3 },
            'cluster-2': { marker: gone, count: 5 },
        };
        const next = {
            'cluster-1': prev['cluster-1'],
        };
        const removed = removeStaleMarkers(prev, next);
        assert.deepEqual(removed, ['cluster-2']);
        assert.deepEqual(gone.calls, [['remove']]);
        assert.deepEqual(kept.calls, []);
    });
});
