/**
 * Temporary drag styling for the live sheet (Framer Motion `y` stays the
 * transform owner). Defaults match the previous combined dragging rule:
 * `will-change: transform` and `backdrop-filter: none` only while dragging.
 *
 * `willChange`: 'while-dragging' | 'off'
 * `backdrop`: 'none-while-dragging' | 'always'
 */
export function sheetDragCompositing({
    dragging = false,
    willChange = 'while-dragging',
    backdrop = 'none-while-dragging',
} = {}) {
    const promote = Boolean(dragging) && willChange !== 'off';
    const dropBackdrop = Boolean(dragging) && backdrop !== 'always';
    const classes = [];
    if (promote) classes.push('ss-mobile-sheet--will-change');
    if (dropBackdrop) classes.push('ss-mobile-sheet--backdrop-off');
    return {
        transformOwner: 'framer-motion-y',
        inlineTransform: null,
        transformOrigin: 'bottom',
        willChange: promote ? 'transform' : 'auto',
        backdropFilter: dropBackdrop ? 'none' : 'blur(20px)',
        className: classes.join(' '),
    };
}
