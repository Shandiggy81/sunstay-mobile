import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { demoVenues } from '../data/demoVenues';

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
 * @returns {{ venues: Array, setVenues: Function, isLoading: boolean, source: 'supabase' | 'fallback', error: any }}
 */
export function useVenues() {
    const [venues, setVenues] = useState(demoVenues);
    const [isLoading, setIsLoading] = useState(false);
    const [source, setSource] = useState('fallback');
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;

        async function fetchLiveVenues() {
            if (!supabase) {
                console.info('[useVenues] Supabase client not initialized, running on static demoVenues.');
                return;
            }

            setIsLoading(true);
            setError(null);

            // 5-second timeout protection for mobile clients
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Supabase request timed out after 5000ms')), 5000)
            );

            try {
                const queryPromise = supabase
                    .from('venues')
                    .select('*');

                const response = await Promise.race([queryPromise, timeoutPromise]);
                const { data, error: dbError } = response || {};

                if (dbError) {
                    throw dbError;
                }

                if (isMounted) {
                    if (Array.isArray(data) && data.length > 0) {
                        console.info(`[useVenues] Loaded ${data.length} live venues from Supabase.`);
                        setVenues(data);
                        setSource('supabase');
                    } else {
                        console.warn('[useVenues] Zero venues returned from Supabase. Maintaining static fallback.');
                    }
                }
            } catch (err) {
                console.warn('[useVenues] Failed to fetch venues from Supabase, maintaining static fallback:', err?.message || err);
                if (isMounted) {
                    setError(err);
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        fetchLiveVenues();

        return () => {
            isMounted = false;
        };
    }, []);

    return { venues, setVenues, isLoading, source, error };
}
