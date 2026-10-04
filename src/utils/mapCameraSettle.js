/**
 * Sun Forecast network work waits until the Mapbox camera is still.
 * An in-progress flyTo keeps the gate closed. A settled or missing map
 * opens it immediately. Unmount removes the moveend listener.
 */

let activeMap = null;

export function registerMapCamera(map) {
    activeMap = map || null;
    return function unregisterMapCamera() {
        if (activeMap === map) activeMap = null;
    };
}

export function getMapCamera() {
    return activeMap;
}

export function cameraIsActive(map) {
    if (!map) return false;
    if (typeof map.isMoving === 'function' && map.isMoving()) return true;
    if (typeof map.isZooming === 'function' && map.isZooming()) return true;
    if (typeof map.isRotating === 'function' && map.isRotating()) return true;
    return false;
}

/**
 * Calls onReady when the camera is settled. While flyTo, zoom, or rotate
 * is active, waits for moveend and checks the camera again. Cancel detaches
 * the listener so a late moveend cannot start a fetch.
 */
export function armForecastFetchWhenCameraSettled(map, onReady) {
    let finished = false;
    let handler = null;

    const detach = () => {
        if (!handler || !map || typeof map.off !== 'function') {
            handler = null;
            return;
        }
        try { map.off('moveend', handler); } catch { /* map already removed */ }
        handler = null;
    };

    const finish = () => {
        if (finished) return;
        finished = true;
        detach();
        onReady();
    };

    let moving = false;
    try {
        moving = cameraIsActive(map);
    } catch {
        moving = false;
    }

    if (!moving) {
        finish();
        return function cancelSettledFetch() {
            finished = true;
        };
    }

    handler = () => {
        let stillMoving = false;
        try {
            stillMoving = cameraIsActive(map);
        } catch {
            stillMoving = false;
        }
        if (stillMoving) return;
        finish();
    };

    try {
        if (typeof map.on !== 'function') {
            finish();
        } else {
            map.on('moveend', handler);
        }
    } catch {
        handler = null;
        finish();
    }

    return function cancelSettledFetch() {
        if (finished) return;
        finished = true;
        detach();
    };
}

/** The hourly strip stays on its loading view until this is true. */
export function shouldStartForecastFetch({ fetchReady = false, enabled = false, hasCoords = false } = {}) {
    return fetchReady === true && enabled === true && hasCoords === true;
}
