/**
 * Explicit Mapbox recovery after an owned WebGL context loss.
 *
 * `?mapbox=0` never enters this machine. The default Mapbox path is
 * ready → loading → live. paused and resume-failed leave that path only
 * after teardown, and only a user action may enter resuming.
 *
 * Camera is restored with public `jumpTo` when the saved center, zoom,
 * bearing, and pitch are all finite. Comfort, cloud, and radar toggles,
 * plus the time-of-day slider, live in React state and are reapplied by
 * the existing map effects. In-flight camera animations and the Xweather
 * controller instance are dropped with the torn-down map and created again
 * on the next successful load.
 */

import { MAP_CONTEXT_LOSS_COOLDOWN_MS } from './mapGpuGuard.js';

export const MAP_RECOVERY_COOLDOWN_MS = MAP_CONTEXT_LOSS_COOLDOWN_MS;

export const MAP_RECOVERY_PHASES = Object.freeze([
    'ready',
    'loading',
    'live',
    'paused',
    'resuming',
    'resume-failed',
]);

export function createMapRecoveryState() {
    return {
        phase: 'ready',
        generation: 0,
        initLock: false,
        cooldownUntil: null,
        removeCounts: {},
    };
}

function result(ok, reason, state, extra) {
    return { ok, reason, state, ...extra };
}

export function cooldownRemaining(state, now) {
    if (state?.cooldownUntil == null) return 0;
    return Math.max(0, state.cooldownUntil - now);
}

export function resumeAvailable(state, now) {
    if (!state) return false;
    if (state.phase !== 'paused' && state.phase !== 'resume-failed') return false;
    if (state.initLock) return false;
    return cooldownRemaining(state, now) === 0;
}

export function startMapLoad(state) {
    const current = state ?? createMapRecoveryState();
    if (current.initLock) return result(false, 'locked', current);
    if (current.phase !== 'ready') return result(false, 'invalid', current);
    return result(true, 'loading', {
        ...current,
        phase: 'loading',
        generation: current.generation + 1,
        initLock: true,
    });
}

export function noteMapLoaded(state, generation) {
    const current = state ?? createMapRecoveryState();
    if (generation !== current.generation) return result(false, 'stale', current);
    if (current.phase !== 'loading' && current.phase !== 'resuming') {
        return result(false, 'invalid', current);
    }
    return result(true, 'live', {
        ...current,
        phase: 'live',
        initLock: false,
        cooldownUntil: null,
    });
}

export function noteContextLost(state, generation, now) {
    const current = state ?? createMapRecoveryState();
    if (generation !== current.generation) return result(false, 'stale', current);
    if (current.phase !== 'live' && current.phase !== 'loading') {
        return result(false, 'invalid', current);
    }
    return result(true, 'paused', {
        ...current,
        phase: 'paused',
        initLock: false,
        cooldownUntil: now + MAP_RECOVERY_COOLDOWN_MS,
    });
}

export function requestMapResume(state, now) {
    const current = state ?? createMapRecoveryState();
    if (current.initLock) return result(false, 'locked', current);
    if (current.phase !== 'paused' && current.phase !== 'resume-failed') {
        return result(false, 'invalid', current);
    }
    if (cooldownRemaining(current, now) > 0) return result(false, 'cooldown', current);
    return result(true, 'resuming', {
        ...current,
        phase: 'resuming',
        generation: current.generation + 1,
        initLock: true,
    });
}

export function noteResumeFailed(state, generation, now) {
    const current = state ?? createMapRecoveryState();
    if (generation !== current.generation) return result(false, 'stale', current);
    if (current.phase !== 'resuming') return result(false, 'invalid', current);
    return result(true, 'resume-failed', {
        ...current,
        phase: 'resume-failed',
        initLock: false,
        cooldownUntil: now + MAP_RECOVERY_COOLDOWN_MS,
    });
}

/** Clears the init lock without starting another map. */
export function releaseInitLock(state, reason = 'abort') {
    const current = state ?? createMapRecoveryState();
    const replaced = reason === 'unmount' || reason === 'abort' || reason === 'failed-init';
    const phase = replaced && (current.phase === 'loading' || current.phase === 'resuming')
        ? 'ready'
        : current.phase;
    return result(true, reason, {
        ...current,
        phase,
        initLock: false,
    });
}

/** Records `map.remove()` for one generation. A second call does not remove again. */
export function noteMapRemoved(state, generation) {
    const current = state ?? createMapRecoveryState();
    const key = String(generation);
    const previous = current.removeCounts[key] || 0;
    if (previous >= 1) {
        return result(false, 'already-removed', current, { remove: false });
    }
    return result(true, 'removed', {
        ...current,
        removeCounts: { ...current.removeCounts, [key]: 1 },
    }, { remove: true });
}

/** React effects must not move paused or resume-failed into resuming. */
export function recoveryEffectTick(state) {
    const current = state ?? createMapRecoveryState();
    return result(false, 'no-auto-retry', current);
}

export function mapRecoveryControl(state, now, { mapboxEnabled = true } = {}) {
    const current = state ?? createMapRecoveryState();
    const hidden = {
        showResume: false,
        showProgress: false,
        disabled: true,
        label: 'Resume map',
        accessibleName: 'Resume map',
        element: 'button',
        minWidth: 44,
        minHeight: 44,
        status: '',
        mode: mapboxEnabled ? 'mapbox' : 'static-fallback',
    };
    if (!mapboxEnabled) return hidden;
    if (current.phase === 'ready' || current.phase === 'loading' || current.phase === 'live') {
        return hidden;
    }
    if (current.phase === 'resuming') {
        return {
            ...hidden,
            showProgress: true,
            status: 'Resuming map…',
        };
    }
    const failed = current.phase === 'resume-failed';
    return {
        ...hidden,
        showResume: true,
        disabled: !resumeAvailable(current, now),
        status: failed
            ? 'Map resume failed. Tap Resume map to try again.'
            : 'Map paused. Tap Resume map to try again.',
    };
}
