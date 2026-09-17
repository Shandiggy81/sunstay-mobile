import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS, createDebouncer } from '../utils/debounce';

/**
 * Returns `value` immediately on first render, then lags subsequent updates
 * until `delay` ms of quiet. Initial mount must not delay the first venue list.
 */
export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const run = createDebouncer(() => setDebounced(value), delay);
        run();
        return () => run.cancel();
    }, [value, delay]);

    return debounced;
}
