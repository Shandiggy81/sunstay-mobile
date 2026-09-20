import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    resolveVenueDetailErrorView,
    venueDetailErrorFallbackIsNull,
} from './venueDetailErrorFallback.js';
import {
    errorBoundaryRemountKey,
    venueDetailEmptyBranchCard,
    venueDetailTabpanelClass,
    venueOverlayPresenceKey,
    VENUE_DETAIL_BRANCH,
} from './venueDetailTabs.js';

describe('venue detail error fallback', () => {
    it('never resolves a caught render error to null and exposes retry/close', () => {
        const view = resolveVenueDetailErrorView({ hasError: true });
        assert.equal(view.kind, 'fallback');
        assert.equal(view.role, 'alert');
        assert.equal(view.isNull, false);
        assert.equal(venueDetailErrorFallbackIsNull(view), false);
        assert.equal(view.title, 'Venue details could not be displayed');
        assert.equal(view.retryLabel, 'Retry');
        assert.equal(view.closeLabel, 'Close');
        assert.ok(view.body);
    });

    it('keeps children when there is no error and still refuses a null fallback', () => {
        const child = { type: 'div' };
        const view = resolveVenueDetailErrorView({ hasError: false, children: child });
        assert.equal(view.kind, 'children');
        assert.equal(view.node, child);
        assert.equal(venueDetailErrorFallbackIsNull(null), true);
    });
});

describe('venue detail tabpanel layout and presence keys', () => {
    it('sizes the tabpanel to its content instead of collapsing as a flex child', () => {
        const cls = venueDetailTabpanelClass();
        assert.match(cls, /\bshrink-0\b/);
        assert.doesNotMatch(cls, /\bmin-h-0\b/);
        assert.doesNotMatch(cls, /\bflex-1\b/);
    });

    it('renders a visible card when the branch is unknown or happy hour has no deal', () => {
        const unknown = venueDetailEmptyBranchCard(VENUE_DETAIL_BRANCH.UNKNOWN);
        assert.ok(unknown?.title);
        assert.ok(unknown?.body);
        const noDeal = venueDetailEmptyBranchCard(VENUE_DETAIL_BRANCH.HAPPY_HOUR, { hasDeal: false });
        assert.ok(noDeal?.title);
        assert.equal(
            venueDetailEmptyBranchCard(VENUE_DETAIL_BRANCH.OVERVIEW),
            null,
        );
    });

    it('remounts the error boundary and overlay when the venue id changes', () => {
        assert.notEqual(errorBoundaryRemountKey('dv-12'), errorBoundaryRemountKey('dv-13'));
        assert.notEqual(venueOverlayPresenceKey('dv-12'), venueOverlayPresenceKey('dv-13'));
    });
});
