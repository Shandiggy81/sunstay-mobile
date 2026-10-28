import { useEffect, useState } from 'react';
import { nearestAccessibleToilet } from '../utils/publicToilets.js';

// Loaded once, on the first venue card, as its own chunk: the home screen
// never pays for the toilet data.
let rowsPromise = null;
function loadRows() {
    rowsPromise ??= import('../data/publicAccessibleToilets.json')
        .then(module => module.default)
        .catch(() => { rowsPromise = null; return null; });
    return rowsPromise;
}

/** Nearest accessible public toilet within 500 m of the venue, or null. */
export function usePublicAccessibleToilet(venue) {
    const lat = venue?.lat;
    const lng = venue?.lng;
    const [toilet, setToilet] = useState(null);
    useEffect(() => {
        let live = true;
        setToilet(null);
        loadRows().then(rows => {
            if (live && rows) setToilet(nearestAccessibleToilet({ lat, lng }, rows));
        });
        return () => { live = false; };
    }, [lat, lng]);
    return toilet;
}
