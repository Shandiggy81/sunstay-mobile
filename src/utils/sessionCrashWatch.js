/**
 * Reports a tab that died without a clean page exit.
 *
 * iOS Safari kills a tab that uses too much memory (Jetsam) and reloads it
 * without firing `pagehide`. sessionStorage survives that reload, so a flag
 * set while the page is open and cleared on `pagehide` tells the next load
 * whether the previous one ended abnormally.
 */

export const SESSION_OPEN_KEY = 'ss-session-open';

function usable(storage) {
    return !!storage
        && typeof storage.getItem === 'function'
        && typeof storage.setItem === 'function'
        && typeof storage.removeItem === 'function';
}

function safely(run, fallback = null) {
    try {
        return run();
    } catch {
        // Private mode and blocked storage can throw on every access.
        return fallback;
    }
}

/**
 * @param {{
 *   storage?: Storage|null,
 *   target?: Window|null,
 *   report?: () => void,
 * }} options
 * @returns {{ previousEndedAbnormally: boolean, stop: () => void }}
 */
export function watchSessionCrashes({ storage = null, target = null, report = () => {} } = {}) {
    if (!usable(storage)) return { previousEndedAbnormally: false, stop: () => {} };

    const previousEndedAbnormally = safely(() => storage.getItem(SESSION_OPEN_KEY) === '1', false);
    if (previousEndedAbnormally) report();

    const markOpen = () => safely(() => storage.setItem(SESSION_OPEN_KEY, '1'));
    const markClosed = () => safely(() => storage.removeItem(SESSION_OPEN_KEY));
    markOpen();

    if (!target || typeof target.addEventListener !== 'function') {
        return { previousEndedAbnormally, stop: () => {} };
    }
    // A page restored from the back/forward cache is open again.
    const onPageShow = (event) => {
        if (event?.persisted) markOpen();
    };
    target.addEventListener('pagehide', markClosed);
    target.addEventListener('pageshow', onPageShow);
    return {
        previousEndedAbnormally,
        stop: () => {
            target.removeEventListener('pagehide', markClosed);
            target.removeEventListener('pageshow', onPageShow);
        },
    };
}
