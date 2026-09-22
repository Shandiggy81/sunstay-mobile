import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { demoVenues } from '../data/demoVenues';
import { interpretVenueResponse } from './interpretVenueResponse';
import { venueRefreshBusy } from '../utils/pullRefreshStatus';
import { VENUE_REFRESH_HANG } from '../utils/iosCrashIsolation';
import {
    VENUE_REFRESH_TIMEOUT_MS,
    abortableDelay,
    createVenueRefreshRequest,
    shouldCommitVenueResult,
} from '../utils/venueRefreshRequest';

/**
 * useVenues hook
 * Asynchronously fetches live venue records from Supabase with an automatic
 * fallback to static demoVenues.js.
 *
 * Resilience:
 * - Starts with demoVenues so the initial UI renders instantly with zero layout shift.
 * - Races a 5-second timeout against the in-flight request and aborts it.
 * - A stale request cannot clear the newer timeout or the user-refresh flag.
 * - Results that arrive after timeout, abort, or a newer request are ignored.
 * - If Supabase fails, is offline, or returns 0 rows, gracefully retains the static data.
 *
 * @returns {{
 *   venues: Array,
 *   setVenues: Function,
 *   isLoading: boolean,
 *   isRefreshing: boolean,
 *   source: 'supabase' | 'fallback',
 *   error: any,
 *   refetch: () => Promise<{ ok: boolean, error?: any, skipped?: boolean, empty?: boolean, rows?: Array|null }>
 * }}
 */
export function useVenues() {
    const [venues, setVenues] = useState(demoVenues);
    const [isLoading, setIsLoading] = useState(false);
    const [userRefresh, setUserRefresh] = useState(false);
    const [source, setSource] = useState('fallback');
    const [error, setError] = useState(null);

    const mountedRef = useRef(true);
    const refreshRequestRef = useRef(null);

    const getRefreshRequest = useCallback(() => {
        if (!refreshRequestRef.current) {
            refreshRequestRef.current = createVenueRefreshRequest({
                timeoutMs: VENUE_REFRESH_TIMEOUT_MS,
            });
        }
        return refreshRequestRef.current;
    }, []);

    const syncUserRefresh = useCallback(() => {
        if (!mountedRef.current) return;
        setUserRefresh(getRefreshRequest().isUserRefresh());
    }, [getRefreshRequest]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            getRefreshRequest().abortAll();
        };
    }, [getRefreshRequest]);

    const fetchLiveVenues = useCallback(async ({ userInitiated = false } = {}) => {
        const request = getRefreshRequest();
        if (!supabase && !(VENUE_REFRESH_HANG && userInitiated)) {
            console.info('[useVenues] Supabase client not initialized, running on static demoVenues.');
            request.clearUserRefresh();
            if (mountedRef.current) {
                setUserRefresh(false);
                setIsLoading(false);
            }
            return { ok: true, skipped: true, empty: false, rows: null, error: null };
        }

        if (mountedRef.current) {
            setIsLoading(true);
            if (userInitiated) setUserRefresh(true);
            setError(null);
        }

        const outcome = await request.execute(async (signal, { isCurrent }) => {
            if (VENUE_REFRESH_HANG && userInitiated) {
                await abortableDelay(20000, signal);
            }
            if (!supabase) {
                return { ok: true, skipped: true, empty: false, rows: null, error: null };
            }
            const response = await supabase.from('venues').select('*').abortSignal(signal);
            if (!mountedRef.current || !isCurrent()) {
                return { ok: false, stale: true, ignored: true, rows: null, error: null };
            }
            return interpretVenueResponse(response);
        }, { userInitiated });

        if (!mountedRef.current) return outcome;

        if (outcome?.stale || outcome?.ignored) {
            syncUserRefresh();
            return outcome;
        }

        if (shouldCommitVenueResult(outcome)) {
            console.info(`[useVenues] Loaded ${outcome.rows.length} live venues from Supabase.`);
            setVenues(outcome.rows);
            setSource('supabase');
            setError(null);
        } else if (outcome?.empty) {
            console.warn('[useVenues] Zero venues returned from Supabase. Maintaining static fallback.');
        } else if (outcome && outcome.ok === false && !outcome.skipped) {
            console.warn('[useVenues] Failed to fetch venues from Supabase, maintaining static fallback:', outcome.error?.message || outcome.error);
            if (outcome.error) setError(outcome.error);
        }

        if (mountedRef.current) setIsLoading(false);
        syncUserRefresh();
        return outcome;
    }, [getRefreshRequest, syncUserRefresh]);

    const refetch = useCallback(() => {
        getRefreshRequest();
        setUserRefresh(true);
        return fetchLiveVenues({ userInitiated: true }).finally(() => {
            if (mountedRef.current) {
                setUserRefresh(getRefreshRequest().isUserRefresh());
            }
        });
    }, [fetchLiveVenues, getRefreshRequest]);

    useEffect(() => {
        fetchLiveVenues();
    }, [fetchLiveVenues]);

    return {
        venues,
        setVenues,
        isLoading,
        isRefreshing: venueRefreshBusy({ userRefresh }),
        source,
        error,
        refetch,
    };
}
