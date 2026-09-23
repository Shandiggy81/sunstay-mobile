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
import { nextPullPhase, pullRefreshStatus, resolveRefreshHoldMs } from '../utils/pullRefreshStatus';
import {
    MASCOT_INDICATOR_SLOT_PX,
    MASCOT_PX,
    applyActorDomOwner,
    pullTransformFromState,
    refreshingPullTransform,
    schedulePullFrame,
} from '../utils/mascotPullTransform';
import {
    actorOpacityForPhase,
    applyMascotTermination,
    isStaleRefresh,
    pointerLossEffect,
    settleRefreshResult,
} from '../utils/mascotRefreshLifecycle';
import {
    clearPullPointerSession,
    releasePullPointerCapture,
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
    const actorRef = useRef(null);
    const phaseRef = useRef('idle');
    const refreshGenRef = useRef(0);
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
    const [statusDetail, setStatusDetail] = useState({ timedOut: false });
    const distanceRef = useRef(0);
    const scaleRef = useRef(1);
    const terminateRef = useRef(() => {});
    const prefersReducedMotion = useReducedMotion();

    const applyPhase = useCallback((next) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    const refreshFlightRef = useRef(false);

    const endSession = useCallback(() => {
        const root = rootRef.current;
        const pointerId = sessionRef.current.pointerId;
        clearPullPointerSession(sessionRef.current);
        releasePullPointerCapture(root, { pointerId });
    }, []);

    const paintActor = useCallback((visual, nextPhase, opacity) => {
        applyActorDomOwner(actorRef.current, visual, {
            opacity,
            refreshing: nextPhase === 'refreshing',
        });
    }, []);

    const terminateGesture = useCallback((reason) => {
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }
        frameRef.current?.cancel();
        const next = applyMascotTermination({
            phase: phaseRef.current,
            distance: distanceRef.current,
            scale: scaleRef.current,
            generation: refreshGenRef.current,
            showMascot,
            timedOut: false,
        }, reason);
        refreshGenRef.current = next.generation;
        phaseRef.current = next.phase;
        distanceRef.current = next.distance;
        scaleRef.current = next.scale;
        setPhase(next.phase);
        setDistance(next.distance);
        setScale(next.scale);
        if (next.phase !== 'error') setStatusDetail({ timedOut: false });
        paintActor(next.transform, next.phase, next.opacity);
        endSession();
        return next;
    }, [endSession, paintActor, showMascot]);

    terminateRef.current = terminateGesture;

    const commitSettlement = useCallback((settled) => {
        phaseRef.current = settled.phase;
        distanceRef.current = settled.distance;
        scaleRef.current = settled.scale;
        setPhase(settled.phase);
        setDistance(settled.distance);
        setScale(settled.scale);
        setStatusDetail({ timedOut: Boolean(settled.timedOut) });
        paintActor(settled.transform, settled.phase, settled.opacity);
    }, [paintActor]);

    const runRefresh = useCallback(async () => {
        if (refreshFlightRef.current) return { ok: true, skipped: true };
        refreshFlightRef.current = true;
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }

        const gen = refreshGenRef.current;
        applyPhase('refreshing');
        setStatusDetail({ timedOut: false });
        const refreshing = refreshingPullTransform();
        distanceRef.current = refreshing.distance;
        scaleRef.current = refreshing.scale;
        applyOwnedTransform(setDistance, setScale, refreshing);
        paintActor(refreshing, 'refreshing', actorOpacityForPhase('refreshing', showMascot));

        let outcome = 'success';
        try {
            const result = await onRefresh?.();
            const settled = settleRefreshResult({
                phase: phaseRef.current,
                distance: distanceRef.current,
                scale: scaleRef.current,
                generation: refreshGenRef.current,
                showMascot,
            }, gen, result);
            if (settled.ignored || isStaleRefresh(refreshGenRef.current, gen)) {
                return { ok: false, stale: true, ignored: true };
            }
            outcome = settled.outcome;
            commitSettlement(settled);
            return result;
        } catch (error) {
            const settled = settleRefreshResult({
                phase: phaseRef.current,
                distance: distanceRef.current,
                scale: scaleRef.current,
                generation: refreshGenRef.current,
                showMascot,
            }, gen, { ok: false, error });
            if (settled.ignored || isStaleRefresh(refreshGenRef.current, gen)) {
                return { ok: false, stale: true, ignored: true, error };
            }
            outcome = settled.outcome;
            commitSettlement(settled);
            return { ok: false, error, timedOut: Boolean(settled.timedOut) };
        } finally {
            refreshFlightRef.current = false;
            endSession();
            frameRef.current?.cancel();
            if (!isStaleRefresh(refreshGenRef.current, gen) && outcome === 'success' && phaseRef.current === 'success') {
                const parked = pullTransformFromState({
                    phase: 'success',
                    distance: 40,
                    scale: 1.12,
                });
                distanceRef.current = parked.distance;
                scaleRef.current = parked.scale;
                applyOwnedTransform(setDistance, setScale, parked);
                paintActor(parked, 'success', actorOpacityForPhase('success', showMascot));
                successTimerRef.current = window.setTimeout(() => {
                    terminateGesture('success');
                    successTimerRef.current = null;
                }, resolveRefreshHoldMs(prefersReducedMotion));
            }
        }
    }, [applyPhase, commitSettlement, endSession, onRefresh, paintActor, prefersReducedMotion, showMascot, terminateGesture]);

    useImperativeHandle(ref, () => ({
        refresh: () => runRefresh(),
        reset: () => terminateGesture('venue-change'),
    }), [runRefresh, terminateGesture]);

    useEffect(() => {
        onStatusChange?.(pullRefreshStatus(phase, statusDetail));
    }, [phase, statusDetail, onStatusChange]);

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

        const onPointerLoss = (event) => {
            if (!session.tracking || event.pointerId !== session.pointerId) return;
            if (!shouldHandlePullPointer(event, session)) return;
            if (pointerLossEffect(phaseRef.current) === 'release-only') {
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
        root.addEventListener('pointercancel', onPointerLoss);
        root.addEventListener('lostpointercapture', onPointerLoss);
        root.addEventListener('touchmove', onTouchMove, { passive: false });

        return () => {
            scheduler.cancel();
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('pointermove', onPointerMove);
            root.removeEventListener('pointerup', onPointerUp);
            root.removeEventListener('pointercancel', onPointerLoss);
            root.removeEventListener('lostpointercapture', onPointerLoss);
            root.removeEventListener('touchmove', onTouchMove);
        };
    }, [enabled, applyPhase, endSession, runRefresh, terminateGesture]);

    const visual = pullTransformFromState({ phase, distance, scale });
    const opacity = actorOpacityForPhase(phase, showMascot);
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
                        ref={actorRef}
                        className={actorClass}
                        data-phase={phase}
                        data-ptr-opacity={opacity}
                        style={{
                            ...visual.cssVars,
                            transform: visual.transform,
                            opacity,
                            animation: phase === 'refreshing' ? undefined : 'none',
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
