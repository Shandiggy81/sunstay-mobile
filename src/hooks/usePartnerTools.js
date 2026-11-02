import { useCallback, useEffect, useState } from 'react';
import { PARTNER_TOOLS_EVENT, PARTNER_TOOLS_KEY, partnerClock, restorePartnerTools, updatePartnerTools } from '../utils/partnerTools.js';

// Partner tools (happy hour, events, access, outdoor setup) stay on this device
// until partner sign-in exists, like the live switches in useVenueFeatures.
function readAll() {
    try { return restorePartnerTools(localStorage.getItem(PARTNER_TOOLS_KEY), partnerClock().today); } catch { return {}; }
}

/**
 * One venue's partner tools and a setter. `update(section, value)` replaces a
 * section (happyHour, events, access, outdoor); null clears it. Every open
 * card and the dashboard stay in step through PARTNER_TOOLS_EVENT.
 */
export function usePartnerTools(venueId) {
    const [all, setAll] = useState(readAll);

    useEffect(() => {
        const sync = () => setAll(readAll());
        window.addEventListener(PARTNER_TOOLS_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => {
            window.removeEventListener(PARTNER_TOOLS_EVENT, sync);
            window.removeEventListener('storage', sync);
        };
    }, []);

    const update = useCallback((section, value) => {
        if (venueId == null) return;
        const next = updatePartnerTools(readAll(), venueId, section, value, { today: partnerClock().today });
        try {
            if (Object.keys(next).length) localStorage.setItem(PARTNER_TOOLS_KEY, JSON.stringify(next));
            else localStorage.removeItem(PARTNER_TOOLS_KEY);
        } catch { /* Private mode or blocked storage: keep the change in memory for this session. */ }
        setAll(next);
        window.dispatchEvent(new Event(PARTNER_TOOLS_EVENT));
    }, [venueId]);

    return { tools: venueId == null ? null : all[String(venueId)] ?? null, update };
}
