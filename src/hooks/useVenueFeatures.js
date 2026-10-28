import { useCallback, useEffect, useState } from 'react';
import { restoreLivePreview, serialiseLivePreview } from '../utils/venueFeaturePin.js';

// The partner preview's live switches stay on this device (no server write):
// kept in localStorage so a reload doesn't lose them, and dropped after 12 h.
const STORAGE_KEY = 'ss-partner-live-preview';

function readSaved() {
    try { return restoreLivePreview(localStorage.getItem(STORAGE_KEY)); } catch { return {}; }
}

export function useVenueFeatures() {
    const [liveVenueFeatures, setLiveVenueFeatures] = useState(readSaved);

    useEffect(() => {
        try {
            if (Object.keys(liveVenueFeatures).length) localStorage.setItem(STORAGE_KEY, serialiseLivePreview(liveVenueFeatures));
            else localStorage.removeItem(STORAGE_KEY);
        } catch { /* Private mode or blocked storage: the preview still works in memory. */ }
    }, [liveVenueFeatures]);

    const updateLiveVenueFeature = useCallback((venueId, patch) => {
        if (typeof venueId === 'function') {
            setLiveVenueFeatures(venueId);
            return;
        }

        setLiveVenueFeatures(prev => ({
            ...prev,
            [venueId]: {
                ...(prev[venueId] || {}),
                ...patch,
            },
        }));
    }, []);

    return { liveVenueFeatures, updateLiveVenueFeature };
}
