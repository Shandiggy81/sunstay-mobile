import { mapRecoveryControl } from './mapRecovery.js';

export function webglRecoveryView(phase = 'live', now = 0) {
    const lost = phase === true || phase === 'paused' || phase === 'resume-failed' || phase === 'resuming';
    if (!lost) {
        return {
            mounted: false,
            blocksInteraction: false,
            node: null,
            showResume: false,
        };
    }
    const control = mapRecoveryControl(
        {
            phase: phase === true ? 'paused' : phase,
            initLock: false,
            cooldownUntil: null,
            generation: 1,
            removeCounts: {},
        },
        now,
    );
    return {
        mounted: true,
        blocksInteraction: true,
        message: control.status,
        role: 'status',
        hasSpinner: control.showProgress,
        showResume: control.showResume,
        control,
        surfaceClass: 'border border-amber-200 bg-amber-50 text-slate-900',
    };
}
