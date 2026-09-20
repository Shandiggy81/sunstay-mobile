/**
 * Venue detail sheet tab routing.
 *
 * Sun Forecast must render in its own remounted branch. Amenity chips
 * (`safeTags` such as "24h License") belong to Overview and Amenities only.
 */

export const VENUE_DETAIL_BRANCH = {
  OVERVIEW: 'overview',
  SUN_FORECAST: 'sun-forecast',
  ROOMS: 'rooms',
  HAPPY_HOUR: 'happy-hour',
  AMENITIES: 'amenities',
  UNKNOWN: 'unknown',
};

export function resolveVenueDetailBranch(activeTab) {
  switch (activeTab) {
    case 'Overview':
      return VENUE_DETAIL_BRANCH.OVERVIEW;
    case 'Sun Forecast':
      return VENUE_DETAIL_BRANCH.SUN_FORECAST;
    case 'Rooms':
      return VENUE_DETAIL_BRANCH.ROOMS;
    case 'Happy Hour':
      return VENUE_DETAIL_BRANCH.HAPPY_HOUR;
    case 'Amenities':
      return VENUE_DETAIL_BRANCH.AMENITIES;
    default:
      return VENUE_DETAIL_BRANCH.UNKNOWN;
  }
}

export function amenityChipsAllowed(branch) {
  return branch === VENUE_DETAIL_BRANCH.OVERVIEW
    || branch === VENUE_DETAIL_BRANCH.AMENITIES;
}

export function tabPanelRemountKey(venueId, activeTab) {
  return `${venueId ?? 'venue'}:${activeTab ?? 'Overview'}`;
}

/**
 * Tabpanel is a flex child of the sheet scroller. `min-h-0` + default
 * flex-shrink lets leftover column space crush it to a 0–~160px box so
 * Overview / Sun Forecast / Amenities look blank below the hero. Size to
 * content and let the scroller own overflow.
 */
export const VENUE_DETAIL_TABPANEL_CLASS =
  'flex w-full shrink-0 flex-col gap-4 pb-4';

export function venueDetailTabpanelClass() {
  return VENUE_DETAIL_TABPANEL_CLASS;
}

export function errorBoundaryRemountKey(venueId) {
  return `venue-detail-error:${venueId ?? 'none'}`;
}

export function venueOverlayPresenceKey(venueId) {
  return `venue-overlay:${venueId ?? 'none'}`;
}

export function venueDetailEmptyBranchCard(branch, { hasDeal = true } = {}) {
  if (branch === VENUE_DETAIL_BRANCH.UNKNOWN) {
    return {
      title: 'This section has no details',
      body: 'Try another tab, or close the venue and open it again.',
    };
  }
  if (branch === VENUE_DETAIL_BRANCH.HAPPY_HOUR && !hasDeal) {
    return {
      title: 'No happy hour listed',
      body: 'This venue does not have a happy hour deal right now.',
    };
  }
  return null;
}

/**
 * Entering a tab must start at the top of that tab's own content.
 * Overview's leftover scrollTop / scrollHeight must not carry over.
 */
export function resetVenueDetailScroller(scroller) {
  if (!scroller) return { scrollTop: null };
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo(0, 0);
  }
  scroller.scrollTop = 0;
  return { scrollTop: scroller.scrollTop };
}
