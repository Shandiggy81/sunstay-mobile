/**
 * Venue-detail error-boundary view.
 * A caught render error must resolve to a visible card, never null.
 */

export const VENUE_DETAIL_ERROR_TITLE = 'Venue details could not be displayed';

export function resolveVenueDetailErrorView({ hasError = false, children = null } = {}) {
    if (!hasError) {
        return {
            kind: 'children',
            isNull: false,
            node: children ?? null,
        };
    }
    return {
        kind: 'fallback',
        isNull: false,
        role: 'alert',
        title: VENUE_DETAIL_ERROR_TITLE,
        body: 'Something went wrong while rendering this venue. Retry or close the sheet.',
        retryLabel: 'Retry',
        closeLabel: 'Close',
    };
}

export function venueDetailErrorFallbackIsNull(view) {
    if (view == null) return true;
    if (view.isNull === true) return true;
    if (view.kind === 'fallback') return false;
    return view.kind !== 'children';
}
