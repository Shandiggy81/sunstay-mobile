import * as Sentry from '@sentry/react';

/**
 * Lightweight iOS isolation diagnostics.
 *
 * Distinguishes React render errors, Mapbox WebGL context loss, map
 * style/tile failures, Safari tab reload / WebContent termination, and
 * ordinary layout or loading failure. A blurred or white map is never
 * proof of WebGL context loss.
 *
 * Temporary. Delete with iosCrashIsolation.js after the matrix is done.
 */

export const ISOLATION_EVENT_KINDS = {
    REACT_RENDER_ERROR: 'react-render-error',
    MAPBOX_WEBGL_CONTEXT_LOST: 'mapbox-webgl-context-lost',
    MAPBOX_STYLE_ERROR: 'mapbox-style-error',
    MAPBOX_TILE_ERROR: 'mapbox-tile-error',
    MAPBOX_ERROR: 'mapbox-error',
    MAP_LIFECYCLE: 'map-lifecycle',
    PAGE_LIFECYCLE: 'page-lifecycle',
    LAYOUT_OR_LOADING: 'layout-or-loading',
    JS_ERROR: 'js-error',
};

export const MAX_ISOLATION_EVENTS = 20;
export const MAX_ISOLATION_TEXT = 160;
export const ISOLATION_STORAGE_KEY = 'ss-ios-isolation-log';

const context = {
    route: '/',
    venue: '',
    tab: '',
    mapEvent: '',
};

let events = [];
let storage = null;
const listeners = new Set();

function emitIsolationLog() {
    listeners.forEach((listener) => {
        try { listener(); } catch { /* HUD listeners must not throw into the app */ }
    });
}

export function subscribeIsolationLog(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function canUseStorage(candidate) {
    return candidate
        && typeof candidate.getItem === 'function'
        && typeof candidate.setItem === 'function';
}

function readStorage() {
    if (!canUseStorage(storage)) return;
    try {
        const raw = storage.getItem(ISOLATION_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        events = parsed
            .filter((item) => item && typeof item === 'object')
            .slice(-MAX_ISOLATION_EVENTS)
            .map((item) => ({
                at: clipIsolationText(item.at || '', 40),
                kind: clipIsolationText(item.kind || ''),
                message: clipIsolationText(item.message || ''),
                source: clipIsolationText(item.source || ''),
                route: clipIsolationText(item.route || ''),
                venue: clipIsolationText(item.venue || ''),
                tab: clipIsolationText(item.tab || ''),
            }));
    } catch {
        // Corrupt session entries must not take down the app.
    }
}

function writeStorage() {
    if (!canUseStorage(storage)) return;
    try {
        storage.setItem(ISOLATION_STORAGE_KEY, JSON.stringify(events));
    } catch {
        // Quota / private-mode failures are non-fatal.
    }
}

export function clipIsolationText(value, max = MAX_ISOLATION_TEXT) {
    if (value == null) return '';
    if (typeof value === 'object') return '[object]';
    const text = String(value);
    return text.length > max ? text.slice(0, max) : text;
}

export function classifyMapboxErrorMessage(message) {
    const text = String(message || '').toLowerCase();
    if (!text) return ISOLATION_EVENT_KINDS.MAPBOX_ERROR;

    const visualOnly = /blur|white screen|blank map|white map/.test(text);
    if (!visualOnly && /webgl.*context.*(lost|loss)|contextlost/.test(text)) {
        return ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST;
    }
    if (/style/.test(text)) return ISOLATION_EVENT_KINDS.MAPBOX_STYLE_ERROR;
    if (/\btile\b|\btiles\b/.test(text)) return ISOLATION_EVENT_KINDS.MAPBOX_TILE_ERROR;
    return ISOLATION_EVENT_KINDS.MAPBOX_ERROR;
}

export function setIsolationContext(next = {}) {
    if (next.route != null) context.route = clipIsolationText(next.route, 80);
    if (next.venue != null) context.venue = clipIsolationText(next.venue, 80);
    if (next.tab != null) context.tab = clipIsolationText(next.tab, 40);
    if (next.mapEvent != null) context.mapEvent = clipIsolationText(next.mapEvent, 80);
    emitIsolationLog();
    return getIsolationContext();
}

export function getIsolationContext() {
    return { ...context };
}

export function getIsolationEvents() {
    return events.slice();
}

export function logIsolationEvent({ kind, message, source } = {}) {
    const entry = {
        at: new Date().toISOString(),
        kind: clipIsolationText(kind || ISOLATION_EVENT_KINDS.LAYOUT_OR_LOADING, 48),
        message: clipIsolationText(message),
        source: clipIsolationText(source, 48),
        route: context.route,
        venue: context.venue,
        tab: context.tab,
    };
    events = [...events, entry].slice(-MAX_ISOLATION_EVENTS);
    const mapRelated = kind === ISOLATION_EVENT_KINDS.MAP_LIFECYCLE
        || kind === ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST
        || kind === ISOLATION_EVENT_KINDS.MAPBOX_STYLE_ERROR
        || kind === ISOLATION_EVENT_KINDS.MAPBOX_TILE_ERROR
        || kind === ISOLATION_EVENT_KINDS.MAPBOX_ERROR;
    if (mapRelated) {
        context.mapEvent = clipIsolationText(message || kind, 80);
    }
    writeStorage();
    emitIsolationLog();
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
        console.info('[ios-isolation]', entry.kind, entry.message, entry.source, entry.route, entry.venue, entry.tab);
    }
    return entry;
}

export function logReactRenderError(error, source) {
    return logIsolationEvent({
        kind: ISOLATION_EVENT_KINDS.REACT_RENDER_ERROR,
        message: error?.message || 'render-error',
        source,
    });
}

export function resetIsolationLog() {
    events = [];
    context.route = '/';
    context.venue = '';
    context.tab = '';
    context.mapEvent = '';
    if (canUseStorage(storage)) {
        try { storage.removeItem(ISOLATION_STORAGE_KEY); } catch { /* noop */ }
    }
    emitIsolationLog();
}

const CLEAN_PAGE_END = new Set(['pagehide', 'pagehide-bfcache']);
const SESSION_LOCK_MESSAGES = new Set(['mount-locked', 'session-locked']);

/** Previous log had a live session and no later pagehide, or a lock with no later pagehide. */
export function previousSessionEndedAbnormally(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return false;
    let lastOpen = -1;
    let lastCleanEnd = -1;
    let lastLock = -1;
    let sawSession = false;
    entries.forEach((event, index) => {
        const message = event?.message || '';
        const kind = event?.kind || '';
        if (message === 'probe-attached') lastOpen = index;
        if (CLEAN_PAGE_END.has(message)) lastCleanEnd = index;
        if (SESSION_LOCK_MESSAGES.has(message)) lastLock = index;
        if (
            message === 'probe-attached'
            || kind === ISOLATION_EVENT_KINDS.PAGE_LIFECYCLE
            || kind === ISOLATION_EVENT_KINDS.MAP_LIFECYCLE
            || kind === ISOLATION_EVENT_KINDS.MAPBOX_WEBGL_CONTEXT_LOST
        ) {
            sawSession = true;
        }
    });
    if (!sawSession) return false;
    if (lastLock >= 0 && lastCleanEnd < lastLock) return true;
    if (lastOpen >= 0 && lastCleanEnd < lastOpen) return true;
    return lastCleanEnd < 0;
}

function reportAbnormalSessionTermination(entries) {
    if (!previousSessionEndedAbnormally(entries)) return;
    Sentry.captureMessage('Abnormal Session Termination (Possible Jetsam Kill)', {
        level: 'fatal',
        tags: { type: 'oom_crash' },
    });
}

export function bindIsolationStorage(nextStorage) {
    storage = canUseStorage(nextStorage) ? nextStorage : null;
    if (storage) {
        readStorage();
        reportAbnormalSessionTermination(events);
    }
}

export function formatIsolationHudLines() {
    const ctx = getIsolationContext();
    const latest = events.at(-1);
    return [
        `route:${ctx.route || '/'}`,
        `venue:${ctx.venue || '—'}`,
        `tab:${ctx.tab || '—'}`,
        `map:${ctx.mapEvent || '—'}`,
        `last:${latest ? `${latest.kind} ${latest.message}` : '—'}`,
    ];
}

function pageLifecycleMessage(type, event) {
    if (type === 'pagehide') {
        return event?.persisted ? 'pagehide-bfcache' : 'pagehide';
    }
    if (type === 'visibilitychange') {
        const state = typeof document !== 'undefined' ? document.visibilityState : '';
        return `visibility-${state || 'change'}`;
    }
    if (type === 'pageshow') {
        return event?.persisted ? 'pageshow-bfcache' : 'pageshow';
    }
    return type;
}

export function attachPageLifecycleProbes(target = typeof window !== 'undefined' ? window : null) {
    if (!target || typeof target.addEventListener !== 'function') {
        return () => {};
    }

    const logPage = (type) => (event) => {
        logIsolationEvent({
            kind: ISOLATION_EVENT_KINDS.PAGE_LIFECYCLE,
            message: pageLifecycleMessage(type, event),
            source: 'window',
        });
    };

    const onError = (event) => {
        const message = event?.message || event?.error?.message || 'window-error';
        logIsolationEvent({
            kind: ISOLATION_EVENT_KINDS.JS_ERROR,
            message,
            source: 'window.onerror',
        });
    };

    const onRejection = (event) => {
        const reason = event?.reason;
        const message = reason?.message || clipIsolationText(reason) || 'unhandledrejection';
        logIsolationEvent({
            kind: ISOLATION_EVENT_KINDS.JS_ERROR,
            message,
            source: 'unhandledrejection',
        });
    };

    const onPageHide = logPage('pagehide');
    const onPageShow = logPage('pageshow');
    const onVisibility = logPage('visibilitychange');

    target.addEventListener('pagehide', onPageHide);
    target.addEventListener('pageshow', onPageShow);
    target.addEventListener('visibilitychange', onVisibility);
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);

    logIsolationEvent({
        kind: ISOLATION_EVENT_KINDS.PAGE_LIFECYCLE,
        message: 'probe-attached',
        source: 'window',
    });

    return () => {
        target.removeEventListener('pagehide', onPageHide);
        target.removeEventListener('pageshow', onPageShow);
        target.removeEventListener('visibilitychange', onVisibility);
        target.removeEventListener('error', onError);
        target.removeEventListener('unhandledrejection', onRejection);
    };
}

if (typeof window !== 'undefined') {
    bindIsolationStorage(window.sessionStorage);
    setIsolationContext({
        route: `${window.location?.pathname || '/'}${window.location?.search || ''}`,
    });
}
