import test from 'node:test';
import assert from 'node:assert/strict';
import { canShowHotelSunReport, findHotelSunReportVenue, hotelSunReportUrl, readHotelSunReportId } from './hotelSunReportRoute.js';

test('report IDs round trip through shared links including numeric and escaped IDs', () => {
  for (const id of ['dv-17', 0, 'hotel/a & b']) {
    const url = new URL(hotelSunReportUrl('https://sunstay.example/?view=stays#rooms', id));
    assert.equal(readHotelSunReportId(url.search), String(id));
    assert.equal(url.searchParams.get('view'), 'stays');
    assert.equal(url.hash, '#rooms');
  }
});

test('closing removes only the report parameter; empty parameters do not open reports', () => {
  const url = new URL(hotelSunReportUrl('https://sunstay.example/?report=old&view=stays', null));
  assert.equal(url.searchParams.has('report'), false);
  assert.equal(url.searchParams.get('view'), 'stays');
  for (const search of ['', '?view=stays', '?report=', '?report=%20']) assert.equal(readHotelSunReportId(search), null);
  assert.equal(new URL(hotelSunReportUrl('https://sunstay.example/?report=old&report=older', 'new')).searchParams.getAll('report').length, 1);
});

test('URL reports resolve the complete venue list, independent of list filters', () => {
  const hotel = { id: 'hotel', typeCategory: 'Hotel' };
  const legacyHotel = { id: 42, type: 'hotel' };
  const venues = [{ id: 'bar', typeCategory: 'Bar', venueName: 'The Hotel Bar' }, hotel, legacyHotel];
  assert.equal(findHotelSunReportVenue(venues, 'hotel'), hotel);
  assert.equal(findHotelSunReportVenue(venues, '42'), legacyHotel);
  assert.equal(findHotelSunReportVenue(venues, 'bar'), null);
  assert.equal(findHotelSunReportVenue(venues, 'missing'), null);
  assert.equal(findHotelSunReportVenue(venues, null), null);
  assert.equal(canShowHotelSunReport({ typeCategory: 'Residential' }), false);
});
