import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Microclimate for every venue inside the current map viewport, via the
 * `venues_in_bbox` RPC.
 *
 * This deliberately does not replace `useVenues`. The RPC returns a narrow
 * projection (id, name, coordinates and microclimate) while the venue sheet
 * reads dozens of columns — images, tags, shielding, room types, happy hour.
 * So this is a viewport-scoped overlay keyed by venue id, merged onto the full
 * rows at the point of display.
 *
 * The response carries the whole 24-slot `sun_hour_fraction` curve, so moving
 * the time-of-day slider is a local array lookup. No refetch, no lag.
 *
 * Failure is always soft: any error leaves `byId` empty and the UI falls back
 * to its existing client-side estimates.
 *
 * @module hooks/useVenuesInBbox
 */

const EMPTY = Object.freeze({});

// The map fires moveend continuously while a user pans. Waiting for the
// gesture to settle keeps this to one request per intentional viewport change.
const BBOX_DEBOUNCE_MS = 350;
const REQUEST_TIMEOUT_MS = 5000;

// Round the bbox before using it as a dependency, so sub-metre jitter from
// inertial panning does not spam the network.
const BBOX_PRECISION = 3;

const roundTo = (n, places) => {
    const factor = 10 ** places;
    return Math.round(n * factor) / factor;
};

function normalizeBbox(bbox) {
    if (!bbox) return null;
    const { minLng, minLat, maxLng, maxLat } = bbox;
    const values = [minLng, minLat, maxLng, maxLat].map(Number);
    if (!values.every(Number.isFinite)) return null;
    const [west, south, east, north] = values;
    if (east <= west || north <= south) return null;
    return {
        minLng: roundTo(west, BBOX_PRECISION),
        minLat: roundTo(south, BBOX_PRECISION),
        maxLng: roundTo(east, BBOX_PRECISION),
        maxLat: roundTo(north, BBOX_PRECISION),
    };
}

/**
 * @param {{minLng:number,minLat:number,maxLng:number,maxLat:number}|null} bbox
 * @param {{ limit?: number, enabled?: boolean }} [options]
 * @returns {{ byId: Record<string, object>, isLoading: boolean, error: any, source: 'rpc'|'none', count: number }}
 */
export function useVenuesInBbox(bbox, { limit = 500, enabled = true } = {}) {
    const normalized = useMemo(() => normalizeBbox(bbox), [bbox]);
    // A primitive dependency, so re-running is driven by the numbers rather
    // than by a fresh object identity on every map event.
    const bboxKey = normalized
        ? `${normalized.minLng},${normalized.minLat},${normalized.maxLng},${normalized.maxLat}`
        : null;

    const [byId, setById] = useState(EMPTY);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const latestRequestRef = useRef(0);

    useEffect(() => {
        if (!enabled || !bboxKey || !supabase) return undefined;

        let cancelled = false;
        const controller = new AbortController();
        const requestId = latestRequestRef.current + 1;
        latestRequestRef.current = requestId;

        const debounceId = setTimeout(() => {
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            setIsLoading(true);

            supabase
                .rpc('venues_in_bbox', {
                    min_lng: normalized.minLng,
                    min_lat: normalized.minLat,
                    max_lng: normalized.maxLng,
                    max_lat: normalized.maxLat,
                    p_limit: limit,
                })
                .abortSignal(controller.signal)
                .then(({ data, error: rpcError }) => {
                    clearTimeout(timeoutId);
                    // Drop responses from a viewport the user has already left.
                    if (cancelled || latestRequestRef.current !== requestId) return;

                    if (rpcError) {
                        console.warn('[useVenuesInBbox] venues_in_bbox failed, keeping client-side estimates:', rpcError.message || rpcError);
                        setError(rpcError);
                        setIsLoading(false);
                        return;
                    }

                    const next = Object.create(null);
                    for (const row of Array.isArray(data) ? data : []) {
                        if (row?.id != null) next[row.id] = row;
                    }
                    setById(next);
                    setError(null);
                    setIsLoading(false);
                })
                .catch((err) => {
                    clearTimeout(timeoutId);
                    if (cancelled || latestRequestRef.current !== requestId) return;
                    console.warn('[useVenuesInBbox] venues_in_bbox request errored, keeping client-side estimates:', err?.message || err);
                    setError(err);
                    setIsLoading(false);
                });
        }, BBOX_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(debounceId);
            controller.abort();
        };
    }, [bboxKey, limit, enabled, normalized]);

    const count = useMemo(() => Object.keys(byId).length, [byId]);

    return {
        byId,
        isLoading,
        error,
        source: count > 0 ? 'rpc' : 'none',
        count,
    };
}

export default useVenuesInBbox;
