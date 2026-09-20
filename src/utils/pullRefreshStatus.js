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

    return phase;
}
