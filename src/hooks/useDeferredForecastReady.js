import { useEffect, useState } from 'react';
import { createForecastSettleGate } from '../utils/scheduleForecastFetch';

/**
 * False until the sheet settle gate fires. A venue change or tab exit
 * cancels the pending callback, so the fetch never starts for a stale view.
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
        const gate = createForecastSettleGate();
        gate.arm(() => setReady(true));
        return () => gate.cancel();
    }, [isActive, token]);

    return isActive && ready;
}
