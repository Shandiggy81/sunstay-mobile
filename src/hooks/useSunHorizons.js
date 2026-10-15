import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cacheHorizonRows, chunkIds, horizonIdsToFetch, inlineSunHorizons } from '../utils/sunMomentFilters.js';

// Session cache shared by every caller: venue id → horizon (or null when the
// venue has none). Horizons only change when the building data is reseeded.
const cache = new Map();
// Ids with a request in flight, so a changing venue list doesn't ask twice.
const pending = new Set();

/**
 * 36-sector building horizons (microclimate_profiles.sun_horizon_deg, public
 * read) for every listed venue, loaded in batched selects (150 ids each) per new set of
 * ids. Returns a Map of venue id → horizon; empty without Supabase. Never throws.
 *
 * @param {object[]} venues
 * @returns {Map<string, number[]|null>}
 */
export function useSunHorizons(venues) {
    const [version, setVersion] = useState(0);
    // Venues that already carry sun_horizon_deg (even null) need no lookup.
    const inline = useMemo(() => inlineSunHorizons(venues), [venues]);
    const idsKey = useMemo(
        () => (Array.isArray(venues)
            ? venues.map((v) => v?.id).filter((id) => id != null && !inline.has(String(id))).join('|')
            : ''),
        [venues, inline],
    );

    useEffect(() => {
        if (!supabase || !idsKey) return;
        const ids = horizonIdsToFetch(idsKey.split('|'), cache).filter((id) => !pending.has(id));
        if (ids.length === 0) return;
        // Batched so a large venue list stays under the gateway's URL limit.
        for (const batch of chunkIds(ids)) {
            batch.forEach((id) => pending.add(id));
            supabase
                .from('microclimate_profiles')
                .select('venue_id, sun_horizon_deg')
                .in('venue_id', batch)
                .then(({ data, error }) => {
                    batch.forEach((id) => pending.delete(id));
                    // On error nothing is cached, so the next venue list retries.
                    if (error) return;
                    cacheHorizonRows(cache, batch, data);
                    // The cache is shared, so a reply for an older venue list still counts.
                    setVersion((n) => n + 1);
                }, () => { batch.forEach((id) => pending.delete(id)); });
        }
    }, [idsKey]);

    // A fresh Map per load so memoised consumers recompute.
    return useMemo(() => {
        const out = new Map(cache);
        for (const [id, horizon] of inline) out.set(id, horizon);
        return out;
    }, [version, idsKey, inline]);
}
