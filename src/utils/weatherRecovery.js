/**
 * When the weather may be fetched again after the first Open-Meteo call failed.
 *
 * Without this, one slow or failed call on load left the whole visit on demo
 * weather ("Live weather unavailable") until a reload. The rules are bounded on
 * purpose: one timed retry per page load, then only a real signal that the
 * network or the tab is back, never a loop.
 */

/** Delay before the single automatic retry after a failed fetch. */
export const WEATHER_RETRY_DELAY_MS = 5000;
/** Minimum gap between the start of one attempt and an event-driven retry. */
export const WEATHER_RETRY_MIN_GAP_MS = 15000;

/**
 * @param {object} state
 * @param {boolean} state.live            live weather is on screen
 * @param {boolean} state.inFlight        a request is running
 * @param {boolean} state.timedRetryUsed  the one timed retry has been scheduled already
 * @param {number|null} state.lastAttemptAt  start time (ms) of the last attempt
 * @param {number} state.now
 * @param {'failed'|'online'|'visible'} state.trigger
 * @returns {{ retry: false } | { retry: true, delayMs: number }}
 */
export function weatherRetryDecision({ live, inFlight, timedRetryUsed, lastAttemptAt, now, trigger }) {
    if (live || inFlight) return { retry: false };

    if (trigger === 'failed') {
        return timedRetryUsed ? { retry: false } : { retry: true, delayMs: WEATHER_RETRY_DELAY_MS };
    }

    if (trigger === 'online' || trigger === 'visible') {
        const since = Number.isFinite(lastAttemptAt) && Number.isFinite(now) ? now - lastAttemptAt : Infinity;
        return since >= WEATHER_RETRY_MIN_GAP_MS ? { retry: true, delayMs: 0 } : { retry: false };
    }

    return { retry: false };
}
