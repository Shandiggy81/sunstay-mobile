import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';

const MASCOT_SRC = '/assets/mascots/brucey-offline.png';

// `navigator.onLine === true` only means "there is a link" — captive portals and
// dead uplinks still report true. The retry button therefore asks the network a
// real question instead of trusting the flag.
const PROBE_URL = `${import.meta.env.BASE_URL}manifest.json`;
const PROBE_TIMEOUT_MS = 6000;

const isBrowserOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

// The modal only ever renders once the network is already gone, so Brucey has
// to be in the browser's cache before that happens. Warm him on idle, once per
// session, and keep the element alive so the decoded bitmap stays resident.
let mascotWarmer = null;
const warmMascot = () => {
    if (mascotWarmer || typeof Image === 'undefined') return;
    mascotWarmer = new Image();
    mascotWarmer.fetchPriority = 'low';
    mascotWarmer.decoding = 'async';
    mascotWarmer.src = MASCOT_SRC;
};

const probeConnection = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(`${PROBE_URL}?_=${Date.now()}`, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
};

/**
 * Global offline / network-failure boundary.
 *
 * Mounted once near the app root: it listens for the browser's online/offline
 * events and blocks the UI with Brucey while the connection is down. Pass
 * `forceVisible` to surface the same modal from a failed fetch, and `onRetry`
 * to refetch instead of simply dismissing once the link is back.
 */
const NetworkErrorModal = ({ forceVisible = false, onRetry }) => {
    const [offline, setOffline] = useState(() => !isBrowserOnline());
    const [checking, setChecking] = useState(false);
    const [retryFailed, setRetryFailed] = useState(false);
    const [mascotUnavailable, setMascotUnavailable] = useState(false);
    const prefersReducedMotion = useReducedMotion();
    const retryButtonRef = useRef(null);
    const lastFocusedRef = useRef(null);

    const isOpen = offline || forceVisible;

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        if (typeof window.requestIdleCallback !== 'function') {
            const timer = setTimeout(warmMascot, 1200);
            return () => clearTimeout(timer);
        }
        const handle = window.requestIdleCallback(warmMascot, { timeout: 4000 });
        return () => window.cancelIdleCallback?.(handle);
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setOffline(false);
            setRetryFailed(false);
        };
        const handleOffline = () => setOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        // Sync once on mount: the link can drop between first render and effect.
        setOffline(!isBrowserOnline());

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Move focus into the dialog while it blocks the app, and hand it back to
    // whatever the user was on once the connection returns.
    useEffect(() => {
        if (!isOpen) return undefined;
        lastFocusedRef.current = document.activeElement;
        // preventScroll matters on short viewports: the overlay scrolls, and
        // focusing the button would otherwise scroll Brucey off the top.
        const focusTimer = setTimeout(() => retryButtonRef.current?.focus({ preventScroll: true }), 0);
        return () => {
            clearTimeout(focusTimer);
            const previous = lastFocusedRef.current;
            if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
        };
    }, [isOpen]);

    // The retry button is the only control, so Tab must not escape behind the
    // backdrop. Esc is deliberately inert: reconnecting is the way out.
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key !== 'Tab') return;
            event.preventDefault();
            retryButtonRef.current?.focus();
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [isOpen]);

    const handleRetry = useCallback(async () => {
        if (checking) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        setChecking(true);
        setRetryFailed(false);
        const reachable = await probeConnection();
        setChecking(false);
        if (!reachable) {
            setRetryFailed(true);
            return;
        }
        setOffline(false);
        onRetry?.();
    }, [checking, onRetry]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="network-error-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="fixed inset-0 z-[100000] flex justify-center overflow-y-auto overscroll-contain"
                    style={{
                        // 7rem clears Brucey's 6rem overhang with room to spare,
                        // and every side stays clear of notches, dynamic islands
                        // and home indicators.
                        paddingTop: 'max(7rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))',
                        paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))',
                        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
                        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
                    }}
                >
                    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md" aria-hidden="true" />

                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="network-error-title"
                        aria-describedby="network-error-body"
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
                        animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                        exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                        className="relative my-auto w-full max-w-sm"
                    >
                        {/* Brucey is anchored above the card edge so his ears and
                            muzzle break the silhouette instead of sitting inside it. */}
                        <div className="pointer-events-none absolute -top-24 left-1/2 z-10 -translate-x-1/2">
                            {mascotUnavailable ? (
                                // Cache miss: fall back to a glyph rather than a
                                // broken image dragging the card's layout around.
                                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 text-white shadow-[0_18px_28px_rgba(15,23,42,0.45)] ring-4 ring-white">
                                    <WifiOff size={34} strokeWidth={2.25} aria-hidden="true" />
                                </div>
                            ) : (
                                <motion.img
                                    src={MASCOT_SRC}
                                    alt="Brucey the Sunstay mascot"
                                    width={440}
                                    height={881}
                                    draggable={false}
                                    onError={() => setMascotUnavailable(true)}
                                    animate={prefersReducedMotion ? undefined : { y: [0, -6, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                    className="h-40 w-auto select-none drop-shadow-[0_18px_28px_rgba(15,23,42,0.45)] sm:h-52 [@media(max-height:560px)]:h-32"
                                />
                            )}
                        </div>

                        <div className="relative overflow-hidden rounded-3xl bg-white px-6 pb-7 pt-24 text-center shadow-[0_32px_80px_-24px_rgba(15,23,42,0.65)] ring-1 ring-slate-900/5 sm:px-7 sm:pt-32 [@media(max-height:560px)]:pt-20">
                            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                                <WifiOff size={13} strokeWidth={2.5} aria-hidden="true" />
                                Offline
                            </span>

                            <h2
                                id="network-error-title"
                                className="text-[22px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-2xl"
                            >
                                Oops! Brucey unplugged something.
                            </h2>

                            <p
                                id="network-error-body"
                                className="mx-auto mt-3 max-w-[19rem] text-[13.5px] leading-relaxed text-slate-500"
                            >
                                We’ve lost connection to the microclimate feed. Brucey got a bit
                                distracted, but he’s standing by while we plug things back in.
                            </p>

                            <button
                                type="button"
                                ref={retryButtonRef}
                                onClick={handleRetry}
                                disabled={checking}
                                aria-busy={checking}
                                className="mt-6 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-[13px] font-black uppercase tracking-[0.06em] text-slate-950 shadow-lg shadow-amber-500/30 transition-all duration-150 touch-manipulation hover:bg-amber-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/35"
                            >
                                <RefreshCw
                                    size={16}
                                    strokeWidth={2.75}
                                    aria-hidden="true"
                                    className={checking ? 'animate-spin' : undefined}
                                />
                                BRUCEY, TRY AGAIN?
                            </button>

                            <p
                                role="status"
                                aria-live="polite"
                                className="mt-3 min-h-[1.25rem] text-[12px] font-semibold text-slate-400"
                            >
                                {checking
                                    ? 'Checking the line…'
                                    : retryFailed
                                        ? 'Still no signal — Brucey’s keeping watch.'
                                        : 'We’ll reconnect automatically as soon as you’re back.'}
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default NetworkErrorModal;
