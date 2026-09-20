import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VENUE_DETAIL_BRANCH,
  resolveVenueDetailBranch,
  amenityChipsAllowed,
  tabPanelRemountKey,
} from './venueDetailTabs.js';

test('maps each venue detail tab to an exclusive render branch', () => {
  assert.equal(resolveVenueDetailBranch('Overview'), VENUE_DETAIL_BRANCH.OVERVIEW);
  assert.equal(resolveVenueDetailBranch('Sun Forecast'), VENUE_DETAIL_BRANCH.SUN_FORECAST);
  assert.equal(resolveVenueDetailBranch('Amenities'), VENUE_DETAIL_BRANCH.AMENITIES);
  assert.equal(resolveVenueDetailBranch('Rooms'), VENUE_DETAIL_BRANCH.ROOMS);
  assert.equal(resolveVenueDetailBranch('Happy Hour'), VENUE_DETAIL_BRANCH.HAPPY_HOUR);
  assert.equal(resolveVenueDetailBranch('Mystery'), VENUE_DETAIL_BRANCH.UNKNOWN);
});

test('amenity chips are allowed on Overview and Amenities only', () => {
  assert.equal(amenityChipsAllowed(VENUE_DETAIL_BRANCH.OVERVIEW), true);
  assert.equal(amenityChipsAllowed(VENUE_DETAIL_BRANCH.AMENITIES), true);
  assert.equal(amenityChipsAllowed(VENUE_DETAIL_BRANCH.SUN_FORECAST), false);
  assert.equal(amenityChipsAllowed(VENUE_DETAIL_BRANCH.ROOMS), false);
  assert.equal(amenityChipsAllowed(VENUE_DETAIL_BRANCH.HAPPY_HOUR), false);
});

test('tab panel remount key changes when the active tab changes', () => {
  const overview = tabPanelRemountKey('venue-1', 'Overview');
  const forecast = tabPanelRemountKey('venue-1', 'Sun Forecast');
  assert.notEqual(overview, forecast);
  assert.match(forecast, /Sun Forecast/);
});
