import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseSunHorizon } from '../utils/sunMoments.js';

// One read per venue per session: the horizon only changes when the
// building data is reseeded.
const cache = new Map();

/**
 * The venue's 36-sector building horizon from microclimate_profiles
 * (public read), or null while loading / when there is none / without
 * Supabase. Never throws.
 */
export function useVenueSunHorizon(venueId) {
    const [horizon, setHorizon] = useState(() => (venueId && cache.has(venueId) ? cache.get(venueId) : null));
    useEffect(() => {
        if (!venueId || !supabase) { setHorizon(null); return undefined; }
        if (cache.has(venueId)) { setHorizon(cache.get(venueId)); return undefined; }
        let cancelled = false;
        supabase
            .from('microclimate_profiles')
            .select('sun_horizon_deg')
            .eq('venue_id', venueId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return;
                const value = error ? null : parseSunHorizon(data?.sun_horizon_deg);
                if (!error) cache.set(venueId, value);
                setHorizon(value);
            }, () => { if (!cancelled) setHorizon(null); });
        return () => { cancelled = true; };
    }, [venueId]);
    return horizon;
}
