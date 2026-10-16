// 902 venues are ~1.2 MB of JSON (~90 KB gzipped). 5 s was set for ~100 venues;
// on a throttled phone the response landed right at 5 s and the app quietly
// stayed on the 56 demo venues.
export const VENUE_REFRESH_TIMEOUT_MS = 15000;
export const VENUE_INITIAL_RETRY_DELAY_MS = 2000;

/**
 * Whether the first venue load should try once more: only after a timeout or
 * a failed request, never after a stale/ignored result or an empty table.
 */
export function shouldRetryInitialLoad(outcome, attempt) {
    if (attempt !== 0 || !outcome) return false;
    if (outcome.stale || outcome.ignored || outcome.skipped || outcome.empty) return false;
    return outcome.ok === false && (Boolean(outcome.timedOut) || outcome.error != null);
}

export function venueRefreshTimeoutError(timeoutMs = VENUE_REFRESH_TIMEOUT_MS) {
    const error = new Error(`Venue refresh timed out after ${timeoutMs}ms`);
    error.name = 'TimeoutError';
    error.timedOut = true;
    return error;
}

export function shouldCommitVenueResult(outcome) {
    return Boolean(
        outcome
        && outcome.ok
        && Array.isArray(outcome.rows)
        && outcome.rows.length > 0
        && !outcome.stale
        && !outcome.ignored
        && !outcome.timedOut
    );
}

/**
 * The first load's single delayed retry. Any newer request (a pull-to-refresh,
 * an unmount) calls cancel() before it starts, so the retry can never fire
 * later and abort the newer request.
 */
export function createInitialRetry({
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
} = {}) {
    let timer = null;
    return {
        schedule(fn, ms = VENUE_INITIAL_RETRY_DELAY_MS) {
            if (timer != null) clearTimer(timer);
            timer = setTimer(() => {
                timer = null;
                fn();
            }, ms);
        },
        cancel() {
            if (timer != null) {
                clearTimer(timer);
                timer = null;
            }
        },
        pending() {
            return timer != null;
        },
    };
}

/**
 * Wait until `ms` elapses or `signal` aborts. Abort rejects so a raced
 * timeout can settle without leaving this timer running.
 */
export function abortableDelay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            if (typeof signal?.removeEventListener === 'function') {
                signal.removeEventListener('abort', onAbort);
            }
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            const error = new Error('Venue refresh aborted');
            error.name = 'AbortError';
            reject(error);
        };
        if (signal?.aborted) {
            onAbort();
            return;
        }
        if (typeof signal?.addEventListener === 'function') {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}

function guardSettled(promise) {
    promise.catch(() => {
        // The loser of Promise.race still rejects. Mark it handled.
    });
    return promise;
}

/**
 * One in-flight venue refresh. A timeout (VENUE_REFRESH_TIMEOUT_MS) aborts that request's
 * AbortController. A newer request or unmount bumps the generation so a
 * stale `finally` cannot clear the live timer or the busy flag, and a
 * resolution that arrives after timeout or abort is ignored.
 */
export function createVenueRefreshRequest({
    timeoutMs = VENUE_REFRESH_TIMEOUT_MS,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    AbortControllerImpl = AbortController,
} = {}) {
    let generation = 0;
    let timer = null;
    let controller = null;
    let userRefresh = false;

    const clearActiveTimer = () => {
        if (timer != null) {
            clearTimer(timer);
            timer = null;
        }
    };

    const finishIfCurrent = (gen) => {
        if (gen !== generation) return false;
        clearActiveTimer();
        userRefresh = false;
        return true;
    };

    return {
        isUserRefresh() {
            return userRefresh;
        },
        clearUserRefresh() {
            userRefresh = false;
        },
        abortAll() {
            generation += 1;
            try { controller?.abort(); } catch { /* abort is best-effort */ }
            controller = null;
            clearActiveTimer();
            userRefresh = false;
        },
        execute(fetcher, { userInitiated = false } = {}) {
            const gen = ++generation;
            try { controller?.abort(); } catch { /* previous request is being replaced */ }
            clearActiveTimer();
            const next = new AbortControllerImpl();
            controller = next;
            if (userInitiated) userRefresh = true;

            let settled = false;
            let timedOut = false;
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimer(() => {
                    if (gen !== generation || settled) return;
                    timedOut = true;
                    try { next.abort(); } catch { /* abort is best-effort */ }
                    reject(venueRefreshTimeoutError(timeoutMs));
                }, timeoutMs);
            });
            const fetcherPromise = Promise.resolve().then(() => {
                if (next.signal?.aborted || gen !== generation) {
                    const error = new Error('Venue refresh aborted');
                    error.name = 'AbortError';
                    throw error;
                }
                return fetcher(next.signal, {
                    generation: gen,
                    isCurrent: () => gen === generation && !settled,
                });
            });

            return Promise.race([
                guardSettled(fetcherPromise),
                guardSettled(timeoutPromise),
            ]).then((result) => {
                settled = true;
                if (gen !== generation) {
                    return { ok: false, stale: true, ignored: true, rows: null, error: null };
                }
                return result;
            }).catch((error) => {
                settled = true;
                if (gen !== generation) {
                    return { ok: false, stale: true, ignored: true, rows: null, error };
                }
                return {
                    ok: false,
                    empty: false,
                    rows: null,
                    error,
                    timedOut: timedOut || Boolean(error?.timedOut),
                };
            }).finally(() => {
                finishIfCurrent(gen);
            });
        },
    };
}
