import { pullTransformFromState, resolvePullTermination } from './mascotPullTransform.js';
import { pullRefreshStatus } from './pullRefreshStatus.js';

export function actorOpacityForPhase(phase, showMascot = true) {
    if (!showMascot || phase === 'idle') return 0;
    return 1;
}

export function isStaleRefresh(activeGeneration, capturedGeneration) {
    return activeGeneration !== capturedGeneration;
}

export function terminationDropsInFlight(reason) {
    return reason === 'unmount' || reason === 'sheet-close' || reason === 'venue-change';
}

/**
 * pointercancel and lostpointercapture share this effect.
 * An in-flight refresh keeps running until it settles or times out.
 * Every other phase resets the transform owner and opacity.
 */
export function pointerLossEffect(phase) {
    if (phase === 'refreshing') return 'release-only';
    return 'reset';
}

export function outcomeFromRefreshResult(result) {
    if (result?.timedOut) return 'timeout';
    if (result && result.ok === false && result.error) return 'failure';
    return 'success';
}

export function applyMascotTermination(state, reason) {
    const resolved = resolvePullTermination(reason, state);
    const phase = resolved.phase;
    const transform = resolved.transform;
    const dropInFlight = terminationDropsInFlight(reason);
    return {
        phase,
        distance: resolved.resetTransform ? transform.distance : state.distance,
        scale: resolved.resetTransform ? transform.scale : state.scale,
        generation: dropInFlight ? state.generation + 1 : state.generation,
        transform,
        opacity: actorOpacityForPhase(phase, state.showMascot !== false),
        dropInFlight,
        releasePointer: true,
        clearTimer: true,
        timedOut: phase === 'error' ? Boolean(state.timedOut) : false,
    };
}

export function settleRefreshResult(state, capturedGeneration, result) {
    if (isStaleRefresh(state.generation, capturedGeneration)) {
        return { ignored: true };
    }
    const outcome = outcomeFromRefreshResult(result);
    if (outcome === 'success') {
        const transform = pullTransformFromState({ phase: 'success', distance: 40, scale: 1.12 });
        return {
            ignored: false,
            outcome,
            phase: 'success',
            distance: transform.distance,
            scale: transform.scale,
            transform,
            opacity: actorOpacityForPhase('success', state.showMascot !== false),
            timedOut: false,
            hold: true,
            releasePointer: true,
            status: pullRefreshStatus('success'),
        };
    }
    const failed = resolvePullTermination('failure', state);
    const timedOut = outcome === 'timeout';
    return {
        ignored: false,
        outcome,
        phase: failed.phase,
        distance: failed.transform.distance,
        scale: failed.transform.scale,
        transform: failed.transform,
        opacity: actorOpacityForPhase(failed.phase, state.showMascot !== false),
        timedOut,
        hold: false,
        releasePointer: true,
        status: pullRefreshStatus('error', { timedOut }),
    };
}
