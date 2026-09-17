import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useVenuesInBbox } from '../hooks/useVenuesInBbox';
import { readMicroclimate } from '../utils/microclimate';

/**
 * Viewport-scoped microclimate, fetched from the `venues_in_bbox` RPC and read
 * at whatever time the time-of-day slider is sitting on.
 *
 * State and actions are separate contexts on purpose. VenueMap is a pure
 * writer — it reports the viewport bbox and the slider position — and
 * subscribing it to the state would re-render the map, and re-run marker sync,
 * on every scrub tick. Holding the actions value stable keeps writers out of
 * the render path entirely; only the components that display a reading update.
 *
 * @module context/MicroclimateContext
 */

const MicroclimateStateContext = createContext(null);
const MicroclimateActionsContext = createContext(null);

const EMPTY_READING = Object.freeze({
    available: false,
    sunFraction: null,
    sunPercent: '—',
    sunLabel: null,
    windExposure: null,
    windLabel: null,
    comfortHint: null,
    isLiveSun: false,
    confidence: null,
});

export const MicroclimateProvider = ({ children }) => {
    const [bbox, setBboxState] = useState(null);
    // null means "whatever the server resolved for now"; a number is the
    // Melbourne wall-clock minute the user has scrubbed to.
    const [todMinutes, setTodMinutesState] = useState(null);

    const { byId, isLoading, error, source, count } = useVenuesInBbox(bbox);

    const setBbox = useCallback((next) => {
        setBboxState((prev) => {
            if (!next) return prev;
            if (
                prev
                && prev.minLng === next.minLng
                && prev.minLat === next.minLat
                && prev.maxLng === next.maxLng
                && prev.maxLat === next.maxLat
            ) {
                return prev;
            }
            return next;
        });
    }, []);

    const setTodMinutes = useCallback((minutes) => {
        setTodMinutesState((prev) => {
            if (minutes == null) return null;
            const n = Number(minutes);
            if (!Number.isFinite(n)) return prev;
            return n === prev ? prev : n;
        });
    }, []);

    // Stable for the provider's lifetime, so writers never re-render.
    const actions = useMemo(() => ({ setBbox, setTodMinutes }), [setBbox, setTodMinutes]);

    const state = useMemo(
        () => ({ byId, todMinutes, isLoading, error, source, count }),
        [byId, todMinutes, isLoading, error, source, count],
    );

    return (
        <MicroclimateActionsContext.Provider value={actions}>
            <MicroclimateStateContext.Provider value={state}>
                {children}
            </MicroclimateStateContext.Provider>
        </MicroclimateActionsContext.Provider>
    );
};

/**
 * Writer side: report the map viewport and the slider position.
 * Safe to call outside the provider, where it is a no-op.
 *
 * @returns {{ setBbox: Function, setTodMinutes: Function }}
 */
export const useMicroclimateActions = () => {
    const ctx = useContext(MicroclimateActionsContext);
    return ctx ?? NOOP_ACTIONS;
};

const NOOP_ACTIONS = Object.freeze({ setBbox: () => {}, setTodMinutes: () => {} });

/**
 * Reader side: the whole viewport payload.
 *
 * @returns {{ byId: Record<string, object>, todMinutes: number|null, isLoading: boolean, error: any, source: string, count: number }}
 */
export const useMicroclimateState = () => {
    const ctx = useContext(MicroclimateStateContext);
    return ctx ?? EMPTY_STATE;
};

const EMPTY_STATE = Object.freeze({
    byId: Object.freeze({}),
    todMinutes: null,
    isLoading: false,
    error: null,
    source: 'none',
    count: 0,
});

/**
 * One venue's reading at the current slider time.
 *
 * @param {string|number|null|undefined} venueId
 * @returns {typeof EMPTY_READING}
 */
export const useVenueMicroclimate = (venueId) => {
    const { byId, todMinutes } = useMicroclimateState();
    return useMemo(() => {
        if (venueId == null) return EMPTY_READING;
        const entry = byId[venueId];
        if (!entry) return EMPTY_READING;
        return readMicroclimate(entry, todMinutes);
    }, [byId, venueId, todMinutes]);
};

export default MicroclimateStateContext;
