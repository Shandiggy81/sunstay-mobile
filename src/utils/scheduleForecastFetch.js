/**
 * Starts Sun Forecast network work after the venue sheet has settled.
 * The overlay transition is 250ms. `requestIdleCallback` waits for that
 * window and gives up after FORECAST_FETCH_SETTLE_MS. Browsers without
 * the idle callback use one cancelable timer of the same length.
 *
 * Cancel before the callback runs and the fetch never starts. A newer
 * generation ignores a callback armed for an older venue.
 */

export const FORECAST_FETCH_SETTLE_MS = 300;

export function scheduleForecastFetch(onReady, options = {}) {
    const timeout = Number.isFinite(options.timeout) ? options.timeout : FORECAST_FETCH_SETTLE_MS;
    const idle = options.idle === undefined
        ? (typeof requestIdleCallback === 'function' ? requestIdleCallback : null)
        : options.idle;
    const cancelIdle = options.cancelIdle === undefined
        ? (typeof cancelIdleCallback === 'function' ? cancelIdleCallback : null)
        : options.cancelIdle;
    const delay = options.delay || ((fn, ms) => setTimeout(fn, ms));
    const clearDelay = options.clearDelay || ((id) => clearTimeout(id));

    let finished = false;
    let idleId = null;
    let timerId = null;

    const fire = () => {
        if (finished) return;
        finished = true;
        idleId = null;
        timerId = null;
        onReady();
    };

    if (typeof idle === 'function') {
        idleId = idle(fire, { timeout });
    } else {
        timerId = delay(fire, timeout);
    }

    return function cancelForecastFetch() {
        if (finished) return;
        finished = true;
        if (idleId != null && typeof cancelIdle === 'function') cancelIdle(idleId);
        if (timerId != null) clearDelay(timerId);
        idleId = null;
        timerId = null;
    };
}

export function createForecastSettleGate() {
    let generation = 0;
    let cancelPending = () => {};

    return {
        current() {
            return generation;
        },
        arm(onReady, options) {
            cancelPending();
            generation += 1;
            const armed = generation;
            const cancelScheduled = scheduleForecastFetch(() => {
                if (armed !== generation) return;
                onReady(armed);
            }, options);
            cancelPending = () => {
                generation += 1;
                cancelScheduled();
            };
            return armed;
        },
        cancel() {
            cancelPending();
            cancelPending = () => {};
        },
    };
}

/** The hourly strip stays on its loading view until this is true. */
export function shouldStartForecastFetch({ fetchReady = false, enabled = false, hasCoords = false } = {}) {
    return fetchReady === true && enabled === true && hasCoords === true;
}
