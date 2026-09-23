export function webglRecoveryView(lost = false) {
    if (!lost) {
        return {
            mounted: false,
            blocksInteraction: false,
            node: null,
        };
    }
    return {
        mounted: true,
        blocksInteraction: true,
        message: 'Map paused',
        role: 'status',
        hasSpinner: false,
        surfaceClass: 'border border-amber-200 bg-amber-50 text-slate-900',
    };
}
