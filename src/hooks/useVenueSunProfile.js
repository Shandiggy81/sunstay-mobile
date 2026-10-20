import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { parseSunHorizon } from '../utils/sunMoments.js';

// One read per venue per session: the profile only changes when the
// building data is reseeded.
const cache = new Map();
const EMPTY = Object.freeze({ horizon: null, geometryConfidence: null });

function profileFromRow(row) {
    const confidence = row?.geometry_confidence;
    return {
        horizon: parseSunHorizon(row?.sun_horizon_deg),
        geometryConfidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
    };
}

/**
 * The venue's 36-sector building horizon and geometry confidence from
 * microclimate_profiles (public read). Both are null while loading, when
 * there is no profile, or without Supabase. Never throws.
 *
 * @returns {{ horizon: number[]|null, geometryConfidence: number|null }}
 */
export function useVenueSunProfile(venueId) {
    const [profile, setProfile] = useState(() => (venueId && cache.has(venueId) ? cache.get(venueId) : EMPTY));
    useEffect(() => {
        if (!venueId || !supabase) { setProfile(EMPTY); return undefined; }
        if (cache.has(venueId)) { setProfile(cache.get(venueId)); return undefined; }
        let cancelled = false;
        supabase
            .from('microclimate_profiles')
            .select('sun_horizon_deg, geometry_confidence')
            .eq('venue_id', venueId)
            .maybeSingle()
            .then(({ data, error }) => {
                if (cancelled) return;
                const value = error ? EMPTY : profileFromRow(data);
                if (!error) cache.set(venueId, value);
                setProfile(value);
            }, () => { if (!cancelled) setProfile(EMPTY); });
        return () => { cancelled = true; };
    }, [venueId]);
    return profile;
}
