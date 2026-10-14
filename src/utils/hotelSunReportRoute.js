import { checkIsAccommodation } from './accommodation.js';
import { propertyTypeCategory } from './propertyTypes.js';

export function readHotelSunReportId(search) {
  return new URLSearchParams(search).get('report')?.trim() || null;
}

/** Preserve the app's other URL state when opening, closing or sharing a report. */
export function hotelSunReportUrl(href, venueId) {
  const url = new URL(href);
  const id = venueId == null ? '' : String(venueId).trim();
  if (id) url.searchParams.set('report', id);
  else url.searchParams.delete('report');
  return url.toString();
}

export function canShowHotelSunReport(venue) {
  return checkIsAccommodation(venue) && propertyTypeCategory(venue?.typeCategory) !== 'Residential';
}

export function findHotelSunReportVenue(venues, id) {
  if (id == null) return null;
  return venues.find(venue => String(venue.id) === id && canShowHotelSunReport(venue)) ?? null;
}
