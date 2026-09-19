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
import { computePull, PULL_MAX_DISTANCE } from '../utils/computePull';
import { shouldBeginPull } from '../utils/shouldBeginPull';
import { nextPullPhase, pullRefreshStatus } from '../utils/pullRefreshStatus';

const MASCOT_PX = 48;
const HIDDEN_Y = -(MASCOT_PX + 24);

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

/**
 * Gesture wrapper for the venue list. Activates only when the sheet is
 * expanded and the scroller is pinned at the top. Uses CSS transforms so the
 * clay Sunny asset never gets pixel-stretched.
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

    const [phase, setPhase] = useState('idle');
    const [distance, setDistance] = useState(0);
    const [scale, setScale] = useState(1);
    const prefersReducedMotion = useReducedMotion();

    const applyPhase = useCallback((next) => {
        phaseRef.current = next;
        setPhase(next);
    }, []);

    const resetPull = useCallback(() => {
        setDistance(0);
        setScale(1);
    }, []);

    const runRefresh = useCallback(async () => {
        if (phaseRef.current === 'refreshing') return { ok: true, skipped: true };
        if (successTimerRef.current) {
            clearTimeout(successTimerRef.current);
            successTimerRef.current = null;
        }

        applyPhase('refreshing');
        setDistance(PULL_MAX_DISTANCE);
        setScale(1.12);

        try {
            const result = await onRefresh?.();
            const outcome = resolveRefreshResult(result);
            applyPhase(nextPullPhase('refreshing', {
                type: outcome === 'error' ? 'refresh-error' : 'refresh-success',
            }));
            if (outcome === 'success') {
                setScale(1.2);
                successTimerRef.current = window.setTimeout(() => {
                    applyPhase('idle');
                    resetPull();
                    successTimerRef.current = null;
                }, prefersReducedMotion ? 200 : 720);
            }
            return result;
        } catch (error) {
            applyPhase('error');
            return { ok: false, error };
        }
    }, [applyPhase, onRefresh, prefersReducedMotion, resetPull]);

    useImperativeHandle(ref, () => ({
        refresh: () => runRefresh(),
    }), [runRefresh]);

    useEffect(() => {
        onStatusChange?.(pullRefreshStatus(phase));
    }, [phase, onStatusChange]);

    useEffect(() => () => {
        if (successTimerRef.current) clearTimeout(successTimerRef.current);
    }, []);

    useEffect(() => {
        if (!enabled && (phaseRef.current === 'pulling' || phaseRef.current === 'ready')) {
            applyPhase('idle');
            resetPull();
        }
    }, [enabled, applyPhase, resetPull]);

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !enabled) return undefined;

        const session = sessionRef.current;

        const scrollTopOfList = () => findScroller(root)?.scrollTop || 0;

        const endSession = () => {
            session.tracking = false;
            session.confirmed = false;
            session.pointerId = null;
        };

        const onPointerDown = (event) => {
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
            if (!session.tracking) return;
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
            setDistance(pull.distance);
            setScale(pull.scale);
            applyPhase(nextPullPhase(phaseRef.current, { type: 'move', ready: pull.ready }));
        };

        const onPointerUp = () => {
            if (!session.tracking) return;
            const confirmed = session.confirmed;
            const pull = computePull(session.lastDy);
            endSession();
            if (!confirmed) return;

            const next = nextPullPhase(phaseRef.current, { type: 'release', ready: pull.ready });
            if (next === 'refreshing') {
                runRefresh();
                return;
            }
            applyPhase('idle');
            resetPull();
        };

        const onTouchMove = (event) => {
            if (session.confirmed) event.preventDefault();
        };

        root.addEventListener('pointerdown', onPointerDown, { passive: true });
        root.addEventListener('pointermove', onPointerMove, { passive: false });
        root.addEventListener('pointerup', onPointerUp);
        root.addEventListener('pointercancel', onPointerUp);
        root.addEventListener('touchmove', onTouchMove, { passive: false });

        return () => {
            root.removeEventListener('pointerdown', onPointerDown);
            root.removeEventListener('pointermove', onPointerMove);
            root.removeEventListener('pointerup', onPointerUp);
            root.removeEventListener('pointercancel', onPointerUp);
            root.removeEventListener('touchmove', onTouchMove);
        };
    }, [enabled, applyPhase, resetPull, runRefresh]);

    const translateY = phase === 'idle' ? HIDDEN_Y : HIDDEN_Y + distance;
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
            style={{ overscrollBehaviorY: 'contain' }}
        >
            {showMascot ? (
                <div
                    className={actorClass}
                    data-phase={phase}
                    style={{
                        '--ss-ptr-y': `${translateY}px`,
                        '--ss-ptr-scale': String(scale),
                        transform: `translate(-50%, ${translateY}px) scale(${scale})`,
                        opacity: visible || phase === 'error' ? 1 : 0,
                    }}
                    aria-hidden={phase === 'error' ? undefined : true}
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
            ) : null}
            <div className="ss-mascot-ptr__list">{children}</div>
        </div>
    );
});

MascotPullRefresh.displayName = 'MascotPullRefresh';

export default MascotPullRefresh;
