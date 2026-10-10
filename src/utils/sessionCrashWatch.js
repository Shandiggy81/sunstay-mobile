/**
 * Reports a tab that died without a clean page exit.
 *
 * iOS Safari kills a tab that uses too much memory (Jetsam) and reloads it
 * without firing `pagehide`. sessionStorage survives that reload, so a flag
 * set while the page is open and cleared on `pagehide` tells the next load
 * whether the previous one ended abnormally.
 *
 * iOS also evicts tabs quietly while they sit in the background (the user
 * switched apps for an hour). That looks the same on reload, so the flag
 * records whether the page was on screen: `foreground` means it died while
 * someone was using it (a likely crash), `background` means it was most
 * likely just cleared from memory.
 */

export const SESSION_OPEN_KEY = 'ss-session-open';
const VISIBLE = '1';
const HIDDEN = 'hidden';

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

/** 'foreground' | 'background' | null for a previous session's flag. */
export function classifyPreviousSession(flag) {
    if (flag === VISIBLE) return 'foreground';
    if (flag === HIDDEN) return 'background';
    return null;
}

/**
 * @param {{
 *   storage?: Storage|null,
 *   target?: Window|null,
 *   doc?: Document|null,
 *   report?: (kind: 'foreground'|'background') => void,
 * }} options
 * @returns {{ previousEnd: 'foreground'|'background'|null, stop: () => void }}
 */
export function watchSessionCrashes({ storage = null, target = null, doc = null, report = () => {} } = {}) {
    if (!usable(storage)) return { previousEnd: null, stop: () => {} };

    const previousEnd = classifyPreviousSession(safely(() => storage.getItem(SESSION_OPEN_KEY)));
    if (previousEnd) report(previousEnd);

    const isHidden = () => doc?.visibilityState === 'hidden';
    // Some browsers fire visibilitychange after pagehide; once the page has
    // left cleanly, don't write the flag back until it is shown again.
    let closed = false;
    const markOpen = () => {
        if (closed) return;
        safely(() => storage.setItem(SESSION_OPEN_KEY, isHidden() ? HIDDEN : VISIBLE));
    };
    const markClosed = () => {
        closed = true;
        safely(() => storage.removeItem(SESSION_OPEN_KEY));
    };
    markOpen();

    if (!target || typeof target.addEventListener !== 'function') {
        return { previousEnd, stop: () => {} };
    }
    // A page restored from the back/forward cache is open again.
    const onPageShow = (event) => {
        if (!event?.persisted) return;
        closed = false;
        markOpen();
    };
    const visibilityTarget = doc && typeof doc.addEventListener === 'function' ? doc : null;
    target.addEventListener('pagehide', markClosed);
    target.addEventListener('pageshow', onPageShow);
    visibilityTarget?.addEventListener('visibilitychange', markOpen);
    return {
        previousEnd,
        stop: () => {
            target.removeEventListener('pagehide', markClosed);
            target.removeEventListener('pageshow', onPageShow);
            visibilityTarget?.removeEventListener('visibilitychange', markOpen);
        },
    };
}
