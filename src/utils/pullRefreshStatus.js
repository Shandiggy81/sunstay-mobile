export const PTR_SUCCESS_HOLD_MS = 1000;
export const PTR_SUCCESS_HOLD_REDUCED_MS = 200;

export function resolveRefreshHoldMs(reducedMotion = false) {
    return reducedMotion ? PTR_SUCCESS_HOLD_REDUCED_MS : PTR_SUCCESS_HOLD_MS;
}

export function keepRefreshingUntilSettled(phase, { settled = false, outcome = 'success' } = {}) {
    if (phase === 'refreshing' && !settled) return 'refreshing';
    if (phase === 'refreshing' && settled) {
        return outcome === 'failure' || outcome === 'error' ? 'error' : 'success';
    }
    return phase;
}

export function venueRefreshBusy({ userRefresh = false } = {}) {
    return Boolean(userRefresh);
}

const STATUS = {
    idle: '',
    pulling: 'Pull to refresh venues',
    ready: 'Release to refresh venues',
    refreshing: 'Refreshing venues',
    success: 'Venues updated',
    error: 'Venue refresh failed. Retry available.',
};

export function pullRefreshStatus(phase) {
    return STATUS[phase] ?? '';
}

export function nextPullPhase(phase, event = {}) {
    const { type, ready = false } = event;

    if (type === 'move') {
        if (phase === 'idle' || phase === 'pulling' || phase === 'ready') {
            return ready ? 'ready' : 'pulling';
        }
        return phase;
    }

    if (type === 'release') {
        if (phase === 'pulling' || phase === 'ready') {
            return ready ? 'refreshing' : 'idle';
        }
        return phase;
    }

    if (type === 'refresh-start') {
        if (phase === 'idle' || phase === 'error' || phase === 'pulling' || phase === 'ready') {
            return 'refreshing';
        }
        return phase;
    }

    if (type === 'refresh-success' && phase === 'refreshing') return 'success';
    if (type === 'refresh-error' && phase === 'refreshing') return 'error';
    if (type === 'retry' && phase === 'error') return 'refreshing';
    if (type === 'dismiss' && (phase === 'success' || phase === 'error')) return 'idle';
    if (
        type === 'cancel'
        || type === 'unmount'
        || type === 'sheet-close'
        || type === 'venue-change'
        || type === 'threshold-miss'
        || type === 'reset'
    ) {
        return 'idle';
    }

    return phase;
}
