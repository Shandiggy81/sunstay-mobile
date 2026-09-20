export function resetSheetDragOffset(dragY) {
    dragY.set(0);
}

export function sheetDragResetDependencyList(state, dragY) {
    return [state, dragY];
}
