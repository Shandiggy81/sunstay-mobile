import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { useReducedMotion } from 'framer-motion';
import sunnyMascot from '../assets/sunny-mascot.jpg';
import { computePull } from '../utils/computePull';
import { shouldBeginPull } from '../utils/shouldBeginPull';
import { nextPullPhase, pullRefreshStatus } from '../utils/pullRefreshStatus';
import {
    MASCOT_INDICATOR_SLOT_PX,
    MASCOT_PX,
    pullTransformFromState,
    refreshingPullTransform,
    resolvePullTermination,
    schedulePullFrame,
} from '../utils/mascotPullTransform';
import {
    clearPullPointerSession,
    shouldAcceptPullPointerDown,
    shouldHandlePullPointer,
} from '../utils/pullPointerSession';

function findScroller(root) {
    if (!root) return null;
    return (
        root.querySelector('[data-virtuoso-scroller]')
        || root.querySelector('.overscroll-contain')
        || root
    );
}

function resolveRefreshResult(result) {
    if (result && result.ok === false && result.error) return 'error';
    return 'success';
}

function applyOwnedTransform(setDistance, setScale, transform) {
    setDistance(transform.distance);
    setScale(transform.scale);
}

/**
 * Gesture wrapper for the venue list. Activates only when the sheet is
 * expanded and the scroller is pinned at the top.
 *
 * Transform owner: React `distance`/`scale`/`phase` written to the actor's
 * DOM `style.transform` (and CSS vars for the breathe animation). Framer
 * Motion is not the owner — there is no Motion `y` to reset.
 */
const MascotPullRefresh = forwardRef(function MascotPullRefresh({
    children,
    enabled = false,
    showMascot = true,
    onRefresh,
    onStatusChange,
    className = '',
}, ref) {
    const rootRef = useRef(null);
    const phaseRef = useRef('idle');
    const sessionRef = useRef({
        tracking: false,
        confirmed: false,
        startX: 0,
        startY: 0,
        lastDy: 0,
        pointerId: null,
    });
    const successTimerRef = useRef(null);
    const frameRef = useRef(null);

    const [phase, setPhase] = useState('idle');
    const [distance, setDistance] = useState(0);
    const [scale, setScale] = useState(1);
    const distanceRef = useRef(0);
    const scaleRef = useRef(1);
    const terminateRef = useRef(() => {});
    const prefersReducedMotion = useReducedMotion();

    const applyPhase = useCallback((next) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    const endSession = useCallback(() => {
        clearPullPointerSession(sessionRef.current);
    }, []);

    const terminateGesture = useCallback((reason) => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
        frameRef.current?.cancel();
        const result = resolvePullTermination(reason, {
            phase: phaseRef.current,
            distance: distanceRef.current,
            scale: scaleRef.current,
        });
        applyPhase(result.phase);
        if (result.resetTransform) {
            distanceRef.current = result.transform.distance;
            scaleRef.current = result.transform.scale;
            applyOwnedTransform(setDistance, setScale, result.transform);
        }
        endSession();
        return result;
    }, [applyPhase, endSession]);

    terminateRef.current = terminateGesture;

    const runRefresh = useCallback(async () => {
        if (phaseRef.current === 'refreshing') return { ok: true, skipped: true };
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }

        applyPhase('refreshing');
        const refreshing = refreshingPullTransform();
        distanceRef.current = refreshing.distance;
        scaleRef.current = refreshing.scale;
        applyOwnedTransform(setDistance, setScale, refreshing);

        let outcome = 'success';
        try {
            const result = await onRefresh?.();
            outcome = resolveRefreshResult(result) === 'error' ? 'failure' : 'success';
            applyPhase(nextPullPhase('refreshing', {
                type: outcome === 'failure' ? 'refresh-error' : 'refresh-success',
            }));
            return result;
        } catch (error) {
            outcome = 'failure';
            applyPhase('error');
            return { ok: false, error };
        } finally {
            endSession();
            frameRef.current?.cancel();
            if (outcome === 'success' && phaseRef.current === 'success') {
                const parked = pullTransformFromState({
                    phase: 'success',
                    distance: 40,
                    scale: 1.12,
                });
                distanceRef.current = parked.distance;
                scaleRef.current = parked.scale;
                applyOwnedTransform(setDistance, setScale, parked);
                successTimerRef.current = window.setTimeout(() => {
                    terminateGesture('success');
                    successTimerRef.current = null;
                }, prefersReducedMotion ? 200 : 1400);
            } else {
                terminateGesture(outcome === 'failure' ? 'failure' : 'success');
            }
        }
    }, [applyPhase, endSession, onRefresh, prefersReducedMotion, terminateGesture]);

    useImperativeHandle(ref, () => ({
        refresh: () => runRefresh(),
        reset: () => terminateGesture('venue-change'),
    }), [runRefresh, terminateGesture]);

    useEffect(() => {
        onStatusChange?.(pullRefreshStatus(phase));
    }, [phase, onStatusChange]);

    useEffect(() => () => {
        terminateRef.current('unmount');
    }, []);

    useEffect(() => {
        if (!enabled) terminateRef.current('sheet-close');
    }, [enabled]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !enabled) return undefined;

        const session = sessionRef.current;
        const scrollTopOfList = () => findScroller(root)?.scrollTop || 0;

        const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? (cb) => window.requestAnimationFrame(cb)
            : (cb) => { cb(); return 0; };
        raf.cancel = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
            ? (id) => window.cancelAnimationFrame(id)
            : undefined;
        const scheduler = schedulePullFrame(raf, ({ pullDistance, pullScale, ready }) => {
            distanceRef.current = pullDistance;
            scaleRef.current = pullScale;
            setDistance(pullDistance);
            setScale(pullScale);
            applyPhase(nextPullPhase(phaseRef.current, { type: 'move', ready }));
        });
        frameRef.current = scheduler;

        const onPointerDown = (event) => {
            if (!event.isPrimary || session.tracking) return;
            if (!shouldAcceptPullPointerDown(event, session)) return;
            const current = phaseRef.current;
            if (current === 'refreshing' || current === 'success') return;
            if (scrollTopOfList() !== 0) return;
            session.tracking = true;
            session.confirmed = false;
            session.startX = event.clientX;
            session.startY = event.clientY;
            session.lastDy = 0;
            session.pointerId = event.pointerId;
        };

        const onPointerMove = (event) => {
            if (!session.tracking || event.pointerId !== session.pointerId) return;
            if (!shouldHandlePullPointer(event, session)) return;
            const deltaX = event.clientX - session.startX;
            const deltaY = event.clientY - session.startY;
            session.lastDy = deltaY;

            if (!session.confirmed) {
                const begin = shouldBeginPull({
                    sheetExpanded: enabled,
                    scrollTop: scrollTopOfList(),
                    deltaX,
                    deltaY,
                });
                if (!begin) {
                    if (Math.abs(deltaX) > 10 || deltaY < -8) endSession();
                    return;
                }
                session.confirmed = true;
                try {
                    root.setPointerCapture(event.pointerId);
                } catch {
                    // Capture is best-effort; the confirmed pull still owns the gesture.
                }
            }

            event.preventDefault();
            const pull = computePull(deltaY);
            scheduler.schedule({
                pullDistance: pull.distance,
                pullScale: pull.scale,
                ready: pull.ready,
            });
        };

        const onPointerUp = (event) => {
            if (!session.tracking || event.pointerId !== session.pointerId) return;
            if (!shouldHandlePullPointer(event, session)) return;
            const confirmed = session.confirmed;
            const pull = computePull(session.lastDy);
            endSession();
            if (!confirmed) return;

            const next = nextPullPhase(phaseRef.current, { type: 'release', ready: pull.ready });
            if (next === 'refreshing') {
                runRefresh();
                return;
            }
            terminateGesture('threshold-miss');
        };

        const onPointerCancel = (event) => {
            if (!session.tracking || event.pointerId !== session.pointerId) return;
            if (!shouldHandlePullPointer(event, session)) return;
            if (phaseRef.current === 'refreshing') {
                endSession();
                return;
            }
            terminateGesture('touchcancel');
        };

        const onLostPointerCapture = (event) => {
            if (!session.tracking || event.pointerId !== session.pointerId) return;
            if (!shouldHandlePullPointer(event, session)) return;
            if (phaseRef.current === 'refreshing') {
                endSession();
                return;
            }
            terminateGesture('touchcancel');
        };

        const onTouchMove = (event) => {
            if (session.confirmed) event.preventDefault();
        };

        root.addEventListener('pointerdown', onPointerDown, { passive: true });
        root.addEventListener('pointermove', onPointerMove, { passive: false });
        root.addEventListener('pointerup', onPointerUp);
        root.addEventListener('pointercancel', onPointerCancel);
        root.addEventListener('lostpointercapture', onLostPointerCapture);
        root.addEventListener('touchmove', onTouchMove, { passive: false });

        return () => {
            scheduler.cancel();
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('pointermove', onPointerMove);
            root.removeEventListener('pointerup', onPointerUp);
            root.removeEventListener('pointercancel', onPointerCancel);
            root.removeEventListener('lostpointercapture', onLostPointerCapture);
            root.removeEventListener('touchmove', onTouchMove);
        };
    }, [enabled, applyPhase, endSession, runRefresh, terminateGesture]);

    const visual = pullTransformFromState({ phase, distance, scale });
    const visible = showMascot && phase !== 'idle';
    const actorClass = [
        'ss-mascot-ptr__actor',
        `ss-mascot-ptr__actor--${phase}`,
        phase === 'error' ? 'ss-mascot-ptr__actor--interactive' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            ref={rootRef}
            className={`ss-mascot-ptr ${className}`.trim()}
            data-ptr-phase={phase}
            data-ptr-owner={visual.owner}
            style={{ overscrollBehaviorY: 'contain' }}
        >
            {showMascot ? (
                <div
                    className={`ss-mascot-ptr__indicator${phase === 'error' ? ' ss-mascot-ptr__indicator--interactive' : ''}`}
                    data-ptr-slot="indicator"
                    style={{ height: MASCOT_INDICATOR_SLOT_PX }}
                    aria-hidden={phase === 'error' ? undefined : true}
                >
                    <div
                        className={actorClass}
                        data-phase={phase}
                        style={{
                            ...visual.cssVars,
                            transform: visual.transform,
                            opacity: visible || phase === 'error' ? 1 : 0,
                        }}
                    >
                        <img
                            src={sunnyMascot}
                            alt=""
                            width={MASCOT_PX}
                            height={MASCOT_PX}
                            className="ss-mascot-ptr__img w-12 h-12"
                            draggable={false}
                        />
                        {phase === 'error' ? (
                            <button
                                type="button"
                                className="ss-mascot-ptr__retry"
                                onClick={() => {
                                    applyPhase(nextPullPhase('error', { type: 'retry' }));
                                    runRefresh();
                                }}
                            >
                                Retry
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <div className="ss-mascot-ptr__list">{children}</div>
        </div>
    );
});

MascotPullRefresh.displayName = 'MascotPullRefresh';

export default MascotPullRefresh;
