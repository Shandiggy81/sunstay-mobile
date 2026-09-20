export function shouldAcceptPullPointerDown(event, session) {
    if (!event.isPrimary || session.tracking) return false;
    return true;
}

export function shouldHandlePullPointer(event, session) {
    return Boolean(session.tracking && event.pointerId === session.pointerId);
}

export function clearPullPointerSession(session) {
    session.tracking = false;
    session.confirmed = false;
    session.pointerId = null;
    session.lastDy = 0;
    return session;
}
