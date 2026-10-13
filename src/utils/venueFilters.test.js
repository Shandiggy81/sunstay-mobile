import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readMicroclimate } from './microclimate.js';
import { forecastKindAt, isVenueInDirectSun, matchesTagFilters } from './venueFilters.js';

const curve = (fn) => Array.from({ length: 24 }, (_, h) => fn(h));
// Melbourne minutes past midnight for the slider.
const at = (hour) => hour * 60;

const sunnyCourtyard = { sun_hour_fraction: curve((h) => (h >= 7 && h <= 17 ? 0.9 : 0)) };
const shadedLaneway = { sun_hour_fraction: curve(() => 0.1) };
const forecastAll = (kind) => ({ nowHour: 12, hours: curve((hour) => ({ hour, kind })) });

describe('isVenueInDirectSun', () => {
  it('keeps a sunny venue on a low-UV morning (UV is not an input)', () => {
    const reading = readMicroclimate(sunnyCourtyard, at(9));
    const forecastKind = forecastKindAt(forecastAll('sun'), at(9));
    assert.equal(isVenueInDirectSun({ reading, forecastKind }), true);
  });

  it('drops a shaded venue on a high-UV clear day', () => {
    const reading = readMicroclimate(shadedLaneway, at(12));
    assert.equal(isVenueInDirectSun({ reading, forecastKind: forecastKindAt(forecastAll('sun'), at(12)) }), false);
  });

  it('drops every venue when the forecast hour is cloud, rain or night, or the roof is shut', () => {
    const reading = readMicroclimate(sunnyCourtyard, at(13));
    for (const kind of ['cloud', 'rain', 'night']) {
      assert.equal(isVenueInDirectSun({ reading, forecastKind: kind }), false, kind);
    }
    assert.equal(isVenueInDirectSun({ reading, forecastKind: 'sun', roofClosed: true }), false);
  });

  it('follows the slider time, not the clock', () => {
    const evening = readMicroclimate(sunnyCourtyard, at(19));
    assert.equal(isVenueInDirectSun({ reading: evening, forecastKind: 'sun' }), false);
  });

  it('without a venue reading, trusts the forecast and keeps venues when nothing is known', () => {
    assert.equal(isVenueInDirectSun({ reading: readMicroclimate(null, at(12)), forecastKind: 'sun' }), true);
    assert.equal(isVenueInDirectSun({ reading: null, forecastKind: 'cloud' }), false);
    assert.equal(isVenueInDirectSun({ reading: null, forecastKind: null }), true);
  });
});

describe('forecastKindAt', () => {
  it('reads the slider hour, or the current hour when the slider is live', () => {
    const forecast = { nowHour: 15.5, hours: curve((hour) => ({ hour, kind: hour < 12 ? 'sun' : 'cloud' })) };
    assert.equal(forecastKindAt(forecast, at(9) + 30), 'sun');
    assert.equal(forecastKindAt(forecast, null), 'cloud');
    assert.equal(forecastKindAt(null, at(9)), null);
  });
});

describe('matchesTagFilters', () => {
  const tagsOf = (venue, id) => venue.tags.includes(id);
  const dogPub = { tags: ['Beer Garden', 'Pet Friendly'] };
  const accessibleRooftop = { tags: ['Rooftop', 'Wheelchair Accessible'] };
  const everything = { tags: ['Rooftop', 'Pet Friendly', 'Wheelchair Accessible'] };

  it('needs every practical need selected', () => {
    const needs = ['Pet Friendly', 'Wheelchair Accessible'];
    assert.equal(matchesTagFilters(dogPub, needs, tagsOf), false);
    assert.equal(matchesTagFilters(accessibleRooftop, needs, tagsOf), false);
    assert.equal(matchesTagFilters(everything, needs, tagsOf), true);
  });

  it('matches venue types and vibes any-of', () => {
    const types = ['Rooftop', 'Beer Garden'];
    assert.equal(matchesTagFilters(dogPub, types, tagsOf), true);
    assert.equal(matchesTagFilters(accessibleRooftop, types, tagsOf), true);
  });

  it('combines both: all needs, plus any one type', () => {
    const filters = ['Rooftop', 'Beer Garden', 'Pet Friendly'];
    assert.equal(matchesTagFilters(dogPub, filters, tagsOf), true);
    assert.equal(matchesTagFilters(accessibleRooftop, filters, tagsOf), false);
    assert.equal(matchesTagFilters(everything, filters, tagsOf), true);
  });

  it('keeps everything with no filters and ignores case for needs', () => {
    assert.equal(matchesTagFilters(dogPub, [], tagsOf), true);
    const lower = (venue, id) => venue.tags.some((t) => t.toLowerCase() === id.toLowerCase());
    assert.equal(matchesTagFilters(accessibleRooftop, ['pet friendly', 'Rooftop'], lower), false);
  });
});
