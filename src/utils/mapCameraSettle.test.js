import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveForecastView } from './resolveForecastView.js';
import {
    armForecastFetchWhenCameraSettled,
    cameraIsActive,
    getMapCamera,
    registerMapCamera,
    shouldStartForecastFetch,
} from './mapCameraSettle.js';

function fakeMap({ moving = false, zooming = false, rotating = false } = {}) {
    const handlers = [];
    return {
        moving,
        zooming,
        rotating,
        isMoving() { return this.moving; },
        isZooming() { return this.zooming; },
        isRotating() { return this.rotating; },
        on(type, fn) {
            if (type !== 'moveend') return;
            handlers.push(fn);
        },
        off(type, fn) {
            if (type !== 'moveend') return;
            const index = handlers.indexOf(fn);
            if (index >= 0) handlers.splice(index, 1);
        },
        emitMoveEnd() {
            handlers.slice().forEach((fn) => fn());
        },
        listenerCount() {
            return handlers.length;
        },
    };
}

describe('sun forecast fetch waits for the map camera', () => {
    it('does not start a fetch while flyTo is active', () => {
        const map = fakeMap({ moving: true });
        let ready = false;
        const cancel = armForecastFetchWhenCameraSettled(map, () => {
            ready = true;
        });
        assert.equal(cameraIsActive(map), true);
        assert.equal(ready, false);
        assert.equal(map.listenerCount(), 1);
        map.emitMoveEnd();
        assert.equal(ready, false);
        assert.equal(map.listenerCount(), 1);
        cancel();
    });

    it('starts the fetch on moveend after the camera stops', () => {
        const map = fakeMap({ moving: true });
        let calls = 0;
        armForecastFetchWhenCameraSettled(map, () => {
            calls += 1;
        });
        map.moving = false;
        map.emitMoveEnd();
        map.emitMoveEnd();
        assert.equal(calls, 1);
        assert.equal(map.listenerCount(), 0);
    });

    it('starts immediately when the camera is already settled', () => {
        const map = fakeMap({ moving: false, zooming: false });
        let calls = 0;
        armForecastFetchWhenCameraSettled(map, () => {
            calls += 1;
        });
        assert.equal(calls, 1);
        assert.equal(map.listenerCount(), 0);
    });

    it('waits while zooming even if isMoving is false', () => {
        const map = fakeMap({ moving: false, zooming: true });
        let calls = 0;
        armForecastFetchWhenCameraSettled(map, () => {
            calls += 1;
        });
        assert.equal(calls, 0);
        map.zooming = false;
        map.emitMoveEnd();
        assert.equal(calls, 1);
    });

    it('removes the moveend listener when the panel unmounts first', () => {
        const map = fakeMap({ moving: true });
        let calls = 0;
        const cancel = armForecastFetchWhenCameraSettled(map, () => {
            calls += 1;
        });
        cancel();
        assert.equal(map.listenerCount(), 0);
        map.moving = false;
        map.emitMoveEnd();
        assert.equal(calls, 0);
    });

    it('treats a missing map as settled and replaces the registered instance', () => {
        let calls = 0;
        armForecastFetchWhenCameraSettled(null, () => {
            calls += 1;
        });
        assert.equal(calls, 1);
        const first = fakeMap();
        const second = fakeMap();
        const releaseFirst = registerMapCamera(first);
        assert.equal(getMapCamera(), first);
        const releaseSecond = registerMapCamera(second);
        releaseFirst();
        assert.equal(getMapCamera(), second);
        releaseSecond();
        assert.equal(getMapCamera(), null);
    });

    it('keeps the loading view until the camera gate opens the fetch', () => {
        assert.equal(shouldStartForecastFetch({ fetchReady: false, enabled: true, hasCoords: true }), false);
        assert.equal(shouldStartForecastFetch({ fetchReady: true, enabled: true, hasCoords: true }), true);
        assert.equal(resolveForecastView({ loading: true, error: false, items: [] }), 'loading');
        assert.equal(resolveForecastView({ loading: false, error: true, items: [] }), 'error');
    });
});
