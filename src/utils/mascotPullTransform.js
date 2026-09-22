import { PULL_MAX_DISTANCE } from './computePull.js';

export const MASCOT_PX = 48;
export const HIDDEN_Y = -(MASCOT_PX + 24);
export const MASCOT_INDICATOR_SLOT_PX = MASCOT_PX + 24;
export const MASCOT_LAYER_Z = 2;
export const LIST_LAYER_Z = 1;

const TERMINATION_REASONS = new Set([
    'threshold-miss',
    'success',
    'failure',
    'touchcancel',
    'unmount',
    'venue-change',
    'sheet-close',
]);

/**
 * The mascot pull transform is owned by React state (`distance`, `scale`,
 * `phase`) written onto the actor's DOM `style.transform` and CSS variables.
 * Framer Motion is not the owner — there is no Motion `y` value to reset.
 */
export function pullTransformFromState({ phase = 'idle', distance = 0, scale = 1 } = {}) {
    const dist = phase === 'idle' ? 0 : Math.max(0, Number(distance) || 0);
    const sc = phase === 'idle' ? 1 : Number(scale) || 1;
    const translateY = phase === 'idle' ? HIDDEN_Y : HIDDEN_Y + dist;
    return {
        owner: 'react-state-dom-style',
        distance: dist,
        scale: sc,
        translateY,
        transform: `translate(-50%, ${translateY}px) scale(${sc})`,
        cssVars: {
            '--ss-ptr-y': `${translateY}px`,
            '--ss-ptr-scale': String(sc),
        },
    };
}

export function idlePullTransform() {
    return pullTransformFromState({ phase: 'idle', distance: 0, scale: 1 });
}

/**
 * Write the React-owned transform onto the actor node immediately.
 * The breathe animation overrides `transform` until it is cleared, so
 * termination also sets `animation` to none.
 */
export function applyActorDomOwner(node, visual, { opacity = 0, refreshing = false } = {}) {
    if (!node?.style || !visual) return;
    node.style.transform = visual.transform;
    node.style.opacity = String(opacity);
    node.style.animation = refreshing ? '' : 'none';
    const vars = visual.cssVars || {};
    if (vars['--ss-ptr-y'] != null && typeof node.style.setProperty === 'function') {
        node.style.setProperty('--ss-ptr-y', vars['--ss-ptr-y']);
    }
    if (vars['--ss-ptr-scale'] != null && typeof node.style.setProperty === 'function') {
        node.style.setProperty('--ss-ptr-scale', vars['--ss-ptr-scale']);
    }
}

export function refreshingPullTransform() {
    return pullTransformFromState({
        phase: 'refreshing',
        distance: PULL_MAX_DISTANCE,
        scale: 1.12,
    });
}

export function mascotPullSurface() {
    return {
        root: { overflow: 'hidden' },
        indicator: {
            overflow: 'hidden',
            zIndex: MASCOT_LAYER_Z,
            height: MASCOT_INDICATOR_SLOT_PX,
        },
        list: { overflow: 'hidden', zIndex: LIST_LAYER_Z },
    };
}

export function resolvePullTermination(reason, { phase = 'idle', distance = 0, scale = 1 } = {}) {
    if (reason === 'failure') {
        return {
            phase: 'error',
            resetTransform: true,
            transform: pullTransformFromState({ phase: 'error', distance: 40, scale: 1 }),
        };
    }
    if (!TERMINATION_REASONS.has(reason)) {
        return {
            phase,
            resetTransform: false,
            transform: pullTransformFromState({ phase, distance, scale }),
        };
    }
    return {
        phase: 'idle',
        resetTransform: true,
        transform: idlePullTransform(),
    };
}

/**
 * Coalesce pointer-move transform writes onto one rAF so React state does not
 * flush on every touch sample.
 */
export function schedulePullFrame(raf, onFrame) {
    let pending = null;
    let id = null;
    const run = () => {
        id = null;
        const payload = pending;
        pending = null;
        if (payload) onFrame(payload);
    };
    return {
        schedule(payload) {
            pending = payload;
            if (id != null) return;
            id = raf(run);
        },
        cancel() {
            pending = null;
            if (id != null && typeof raf.cancel === 'function') {
                raf.cancel(id);
            }
            id = null;
        },
    };
}
