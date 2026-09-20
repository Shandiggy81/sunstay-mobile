/**
 * DEV-only venue-detail layout probe.
 * Small strings only — never serialize API payloads into the log or DOM.
 */

function clip(value, max = 120) {
    if (value == null) return '';
    if (typeof value === 'object') return '[object]';
    const text = String(value);
    return text.length > max ? text.slice(0, max) : text;
}

function readComputedBox(tabpanel) {
    const view = tabpanel?.ownerDocument?.defaultView;
    if (!tabpanel || !view || typeof view.getComputedStyle !== 'function') {
        return { display: null, visibility: null, opacity: null, height: null };
    }
    const style = view.getComputedStyle(tabpanel);
    return {
        display: clip(style.display, 24) || null,
        visibility: clip(style.visibility, 24) || null,
        opacity: clip(style.opacity, 12) || null,
        height: clip(style.height, 24) || null,
    };
}

export function readVenueDetailLayoutProbe({
    venueId,
    activeTab,
    branch,
    tabpanel,
    errorCaught = false,
    errorMessage = '',
} = {}) {
    const mounted = !!(tabpanel && (tabpanel.isConnected !== false));
    return {
        venueId: clip(venueId, 80),
        activeTab: clip(activeTab, 40),
        branch: clip(branch, 40),
        tabpanelMounted: mounted,
        clientHeight: mounted && Number.isFinite(tabpanel.clientHeight) ? tabpanel.clientHeight : null,
        scrollHeight: mounted && Number.isFinite(tabpanel.scrollHeight) ? tabpanel.scrollHeight : null,
        errorCaught: Boolean(errorCaught),
        errorMessage: clip(errorMessage, 120),
        ...readComputedBox(mounted ? tabpanel : null),
    };
}

export function formatVenueDetailProbe(probe) {
    return [
        `venue:${probe.venueId || '—'}`,
        `tab:${probe.activeTab || '—'}`,
        `branch:${probe.branch || '—'}`,
        `mounted:${probe.tabpanelMounted ? 'yes' : 'no'}`,
        `clientH:${probe.clientHeight ?? '—'}`,
        `scrollH:${probe.scrollHeight ?? '—'}`,
        `error:${probe.errorCaught ? 'yes' : 'no'}`,
        `display:${probe.display || '—'}`,
        `vis:${probe.visibility || '—'}`,
        `opacity:${probe.opacity || '—'}`,
        `height:${probe.height || '—'}`,
    ].join(' · ');
}
