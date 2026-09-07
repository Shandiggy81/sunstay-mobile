import { useCallback, useState } from 'react';

export function useVenueFeatures() {
    const [liveVenueFeatures, setLiveVenueFeatures] = useState({});

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
