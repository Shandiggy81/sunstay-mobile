import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { demoVenues } from '../data/demoVenues';
import { interpretVenueResponse } from './interpretVenueResponse';
import { venueRefreshBusy } from '../utils/pullRefreshStatus';

/**
 * useVenues hook
 * Asynchronously fetches live venue records from Supabase with an automatic
 * fallback to static demoVenues.js.
 *
 * Resilience:
 * - Starts with demoVenues so the initial UI renders instantly with zero layout shift.
 * - Race-conditions a 5-second timeout against slow mobile connections.
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
    const abortRef = useRef(null);
    const timeoutRef = useRef(null);
    const userRefreshRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            abortRef.current?.abort();
        };
    }, []);

    const fetchLiveVenues = useCallback(async () => {
        if (!supabase) {
            console.info('[useVenues] Supabase client not initialized, running on static demoVenues.');
            userRefreshRef.current = false;
            if (mountedRef.current) setUserRefresh(false);
            return { ok: true, skipped: true, empty: false, rows: null, error: null };
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (mountedRef.current) {
            setIsLoading(true);
            setError(null);
        }

        const timeoutPromise = new Promise((_, reject) => {
            timeoutRef.current = setTimeout(() => {
                controller.abort();
                reject(new Error('Supabase request timed out after 5000ms'));
            }, 5000);
        });

        try {
            const response = await Promise.race([
                supabase.from('venues').select('*').abortSignal(controller.signal),
                timeoutPromise,
            ]);
            const interpreted = interpretVenueResponse(response);
            if (!mountedRef.current) return interpreted;

            if (interpreted.ok) {
                console.info(`[useVenues] Loaded ${interpreted.rows.length} live venues from Supabase.`);
                setVenues(interpreted.rows);
                setSource('supabase');
                setError(null);
                return interpreted;
            }

            if (interpreted.error) {
                throw interpreted.error;
            }

            console.warn('[useVenues] Zero venues returned from Supabase. Maintaining static fallback.');
            return interpreted;
        } catch (err) {
            console.warn('[useVenues] Failed to fetch venues from Supabase, maintaining static fallback:', err?.message || err);
            if (mountedRef.current) setError(err);
            return { ok: false, empty: false, rows: null, error: err };
        } finally {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            userRefreshRef.current = false;
            if (mountedRef.current) {
                setIsLoading(false);
                setUserRefresh(false);
            }
        }
    }, []);

    const refetch = useCallback(() => {
        userRefreshRef.current = true;
        setUserRefresh(true);
        return fetchLiveVenues();
    }, [fetchLiveVenues]);

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
