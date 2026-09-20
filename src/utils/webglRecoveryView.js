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
        message: 'Reconnecting map...',
        role: 'status',
        hasSpinner: true,
        surfaceClass: 'border border-amber-200 bg-amber-50 text-slate-900',
    };
}
