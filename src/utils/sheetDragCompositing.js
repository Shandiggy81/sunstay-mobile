export function sheetDragCompositing({ dragging = false } = {}) {
    return {
        transformOwner: 'framer-motion-y',
        inlineTransform: null,
        transformOrigin: 'bottom',
        willChange: dragging ? 'transform' : 'auto',
        backdropFilter: dragging ? 'none' : 'blur(20px)',
        className: dragging ? 'ss-mobile-sheet--dragging' : '',
    };
}
