import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useVenuesInBbox } from '../hooks/useVenuesInBbox';
import { readMicroclimate } from '../utils/microclimate';

/**
 * Viewport-scoped microclimate, fetched from the `venues_in_bbox` RPC and read
 * at whatever Melbourne wall-clock time the time-of-day slider is sitting on.
 *
 * State and actions are separate contexts so the slider (a writer) does not
 * subscribe to readings. VenueMap is both: it publishes bbox/slider and also
 * reads `byId` so marker colour/size follow cached `effective_sun` /
 * `effective_wind` / `sun_hour_fraction` instead of client weather estimates.
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

const sameBbox = (a, b) => Boolean(
    a && b
    && a.minLng === b.minLng
    && a.minLat === b.minLat
    && a.maxLng === b.maxLng
    && a.maxLat === b.maxLat,
);

export const MicroclimateProvider = ({ children }) => {
    const [viewportBbox, setViewportBbox] = useState(null);
    // Covers the loaded venues. Used until the map reports a viewport, and
    // when the map never loads at all — a missing Mapbox token or a device
    // without WebGL should not take the list's microclimate down with it.
    const [fallbackBbox, setFallbackBboxState] = useState(null);
    // null means "whatever the server resolved for now"; a number is the
    // Melbourne wall-clock minute the user has scrubbed to.
    const [todMinutes, setTodMinutesState] = useState(null);

    const bbox = viewportBbox ?? fallbackBbox;
    const { byId, isLoading, error, source, count } = useVenuesInBbox(bbox);

    const setBbox = useCallback((next) => {
        setViewportBbox((prev) => (!next || sameBbox(prev, next) ? prev : next));
    }, []);

    const setFallbackBbox = useCallback((next) => {
        setFallbackBboxState((prev) => (!next || sameBbox(prev, next) ? prev : next));
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
    const actions = useMemo(
        () => ({ setBbox, setFallbackBbox, setTodMinutes }),
        [setBbox, setFallbackBbox, setTodMinutes],
    );

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

const NOOP_ACTIONS = Object.freeze({
    setBbox: () => {},
    setFallbackBbox: () => {},
    setTodMinutes: () => {},
});

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
