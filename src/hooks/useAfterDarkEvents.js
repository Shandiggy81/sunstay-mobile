import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEventsTonight } from '../utils/afterDarkEvents.js';
import { shouldFetchAfterDark } from '../utils/afterDarkHome.js';

const IDLE = Object.freeze({ status: 'idle', events: [], error: null, fetchedAt: null });

/** Opening the sheet opts into one request; closing aborts it. No timers or polling. */
export function useAfterDarkEvents({ open, origin, supabaseUrl, anonKey }) {
    const [state, setState] = useState(IDLE);
    const [retryVersion, setRetryVersion] = useState(0);
    const retrySeen = useRef(0);
    const cached = useRef(null);
    const active = useRef(null);
    const configuration = useRef({ supabaseUrl, anonKey });
    const retry = useCallback(() => setRetryVersion(version => version + 1), []);
    const lat = origin?.lat;
    const lng = origin?.lng;

    useEffect(() => {
        const abort = () => {
            active.current?.controller.abort();
            active.current = null;
        };
        const changedConfig = configuration.current.supabaseUrl !== supabaseUrl || configuration.current.anonKey !== anonKey;
        if (changedConfig) {
            abort();
            cached.current = null;
            configuration.current = { supabaseUrl, anonKey };
        }
        if (!open) {
            abort();
            setState(cached.current?.state ?? IDLE);
            return;
        }
        const point = { lat, lng };
        const forced = retrySeen.current !== retryVersion;
        retrySeen.current = retryVersion;
        const previousOrigin = active.current?.origin ?? cached.current?.origin;
        if (!shouldFetchAfterDark({ open, origin: point, previousOrigin, retry: forced })) {
            // A cache is also reused after closing/reopening; an in-flight
            // request remains active across sub-kilometre viewport changes.
            if (!active.current && cached.current) setState(cached.current.state);
            return;
        }
        abort();
        const request = { origin: point, controller: new AbortController() };
        active.current = request;
        setState({ status: 'loading', events: [], error: null, fetchedAt: null });
        fetchEventsTonight({ supabaseUrl, anonKey, origin: point, radiusKm: 3, signal: request.controller.signal })
            .then(result => {
                if (active.current !== request || request.controller.signal.aborted || result.error === 'aborted') return;
                const next = { status: result.ok ? 'ready' : 'error', events: result.events, error: result.error, fetchedAt: result.fetchedAt };
                cached.current = { origin: point, state: next };
                active.current = null;
                setState(next);
            });
        // No dependency cleanup here: a small centre movement must not abort
        // a useful request. Close/retry/large moves are handled explicitly.
    }, [open, lat, lng, retryVersion, supabaseUrl, anonKey]);

    useEffect(() => () => {
        active.current?.controller.abort();
        active.current = null;
    }, []);

    return { ...state, retry };
}
