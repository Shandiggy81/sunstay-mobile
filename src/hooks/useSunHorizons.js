import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cacheHorizonRows, horizonIdsToFetch } from '../utils/sunMomentFilters.js';

// Session cache shared by every caller: venue id → horizon (or null when the
// venue has none). Horizons only change when the building data is reseeded.
const cache = new Map();

/**
 * 36-sector building horizons (microclimate_profiles.sun_horizon_deg, public
 * read) for every listed venue, loaded in one batched select per new set of
 * ids. Returns a Map of venue id → horizon; empty without Supabase. Never throws.
 *
 * @param {object[]} venues
 * @returns {Map<string, number[]|null>}
 */
export function useSunHorizons(venues) {
    const [version, setVersion] = useState(0);
    const idsKey = useMemo(
        () => (Array.isArray(venues) ? venues.map((v) => v?.id).filter((id) => id != null).join('|') : ''),
        [venues],
    );

    useEffect(() => {
        if (!supabase || !idsKey) return;
        const ids = horizonIdsToFetch(idsKey.split('|'), cache);
        if (ids.length === 0) return;
        supabase
            .from('microclimate_profiles')
            .select('venue_id, sun_horizon_deg')
            .in('venue_id', ids)
            .then(({ data, error }) => {
                // On error nothing is cached, so the next venue list retries.
                if (error) return;
                cacheHorizonRows(cache, ids, data);
                // The cache is shared, so a reply for an older venue list still counts.
                setVersion((n) => n + 1);
            }, () => {});
    }, [idsKey]);

    // A fresh Map per load so memoised consumers recompute.
    return useMemo(() => new Map(cache), [version, idsKey]);
}
