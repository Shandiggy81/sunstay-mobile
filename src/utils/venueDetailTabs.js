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
