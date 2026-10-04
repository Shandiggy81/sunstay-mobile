import { useEffect, useState } from 'react';
import { armForecastFetchWhenCameraSettled, getMapCamera } from '../utils/mapCameraSettle';

/**
 * False while the map camera is moving. A settled map opens the gate on
 * this commit's effect. Tab exit or a venue change removes the moveend
 * listener before it can start a fetch.
 */
export function useDeferredForecastReady(active, token = '') {
    const [ready, setReady] = useState(false);
    const [epoch, setEpoch] = useState({ active: Boolean(active), token });
    const isActive = Boolean(active);

    if (epoch.active !== isActive || epoch.token !== token) {
        setEpoch({ active: isActive, token });
        if (ready) setReady(false);
    }

    useEffect(() => {
        if (!isActive) return undefined;
        let alive = true;
        const cancel = armForecastFetchWhenCameraSettled(getMapCamera(), () => {
            if (alive) setReady(true);
        });
        return () => {
            alive = false;
            cancel();
        };
    }, [isActive, token]);

    return isActive && ready;
}
