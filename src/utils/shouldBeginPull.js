/**
 * Confirm a mascot pull-to-refresh only when the venue sheet is fully
 * expanded, the list is pinned at the top, and the first movement is
 * predominantly downward. Otherwise the existing sheet / scroll gesture wins.
 */
export function shouldBeginPull({
    sheetExpanded,
    scrollTop,
    deltaX,
    deltaY,
} = {}) {
    if (!sheetExpanded) return false;
    if ((Number(scrollTop) || 0) !== 0) return false;

    const dx = Number(deltaX) || 0;
    const dy = Number(deltaY) || 0;
    if (!(dy > 0)) return false;
    return Math.abs(dy) > Math.abs(dx);
}
