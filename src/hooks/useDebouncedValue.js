import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS, createDebouncer, searchDebounceWait } from '../utils/debounce';

/**
 * Returns `value` immediately on first render, then lags subsequent updates
 * until `delay` ms of quiet. Empty values flush immediately (Clear all).
 */
export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const wait = searchDebounceWait(value, delay);
        if (wait === 0) {
            setDebounced(value);
            return undefined;
        }
        const run = createDebouncer(() => setDebounced(value), wait);
        run();
        return () => run.cancel();
    }, [value, delay]);

    return debounced;
}
