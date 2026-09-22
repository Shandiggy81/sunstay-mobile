export function shouldAcceptPullPointerDown(event, session) {
    if (!event.isPrimary || session.tracking) return false;
    return true;
}

export function shouldHandlePullPointer(event, session) {
    return Boolean(session.tracking && event.pointerId === session.pointerId);
}

export function releasePullPointerCapture(root, session) {
    const pointerId = session?.pointerId;
    if (!root || pointerId == null || typeof root.releasePointerCapture !== 'function') return false;
    try {
        if (typeof root.hasPointerCapture === 'function' && !root.hasPointerCapture(pointerId)) {
            return false;
        }
        root.releasePointerCapture(pointerId);
        return true;
    } catch {
        return false;
    }
}

export function clearPullPointerSession(session) {
    session.tracking = false;
    session.confirmed = false;
    session.pointerId = null;
    session.lastDy = 0;
    return session;
}
