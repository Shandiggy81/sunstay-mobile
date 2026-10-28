import test from 'node:test';
import assert from 'node:assert/strict';
import { venueStatTiles } from './venueStatTiles.js';
import { windChip } from './venueConditionChips.js';
import { formatGuestDate } from './balconySunEngine.js';

const forecast = { sunriseHour: 6, sunsetHour: 19, nowHour: 12, now: { kind: 'sun' }, sunUntil: 15, hasHourly: true };

test('four tiles show forecast words, sheltered wind, temperature and score', () => {
  const venue = { tags: ['Rooftop'] };
  const weather = { wind: { speed: 7 } };
  const tiles = venueStatTiles({ venue, weather, forecast, feelsLike: 15.2, score: 82.6 });
  const wind = windChip(venue, weather);
  assert.deepEqual(tiles, [
    { label: 'Sun now', icon: 'sun', value: 'Sun until 3pm' },
    { label: 'Wind here', icon: 'windsock', value: wind.text, note: `${wind.kmh} km/h` },
    { label: 'Feels like', icon: 'jacket', value: '15°' },
    { label: 'Sun score', icon: 'sun', value: '83', note: 'out of 100' },
  ]);
});

test('shade and cloud icons follow the venue forecast, with warm thermometer', () => {
  for (const kind of ['shaded', 'cloud']) {
    const tiles = venueStatTiles({ forecast: { ...forecast, now: { kind } }, feelsLike: 20 });
    assert.equal(tiles[0].icon, kind);
    if (kind === 'shaded') assert.equal(tiles[0].value, 'Shaded now');
    assert.equal(tiles[2].icon, 'thermometer');
  }
});

test('missing data and loading scores never fabricate weather or numbers', () => {
  const tiles = venueStatTiles({ score: NaN, feelsLike: null });
  assert.equal(tiles[0].value, 'Sun times unavailable');
  assert.equal(tiles[1].value, 'Unavailable');
  assert.equal(tiles[1].note, null);
  assert.equal(tiles[2].value, '–');
  assert.equal(tiles[3].value, '–');
  assert.equal(venueStatTiles({ score: 0 })[3].value, '0');
  assert.equal(venueStatTiles({ scoreLoading: true })[3].value, '…');
});

test('comparison calendar dates retain their day regardless of room timezone', () => {
  assert.equal(formatGuestDate('2026-10-15T12:00:00Z', 'UTC'), 'Thu 15 Oct');
});

test('after dark the score tile says so instead of 0', () => {
  const tiles = venueStatTiles({ venue: {}, weather: null, forecast, feelsLike: 15, score: 0, isNight: true });
  assert.deepEqual(tiles[3], { label: 'Sun score', icon: 'night', value: 'After dark', note: 'back at sunrise' });
  const loading = venueStatTiles({ venue: {}, weather: null, forecast, feelsLike: 15, score: null, scoreLoading: true, isNight: true });
  assert.equal(loading[3].value, '…', 'loading wins over night');
});

test('rain and cloud are the sky, not the sun; rain hides the sun score', () => {
  const rain = venueStatTiles({ forecast: { ...forecast, now: { kind: 'rain' } }, feelsLike: 9, score: 22, skyKindAtScore: 'rain' });
  assert.deepEqual(rain[0], { label: 'Right now', icon: 'rain', value: 'Raining' });
  assert.deepEqual(rain[3], { label: 'Sun score', icon: 'rain', value: 'Raining', note: 'no direct sun' });
  const cloud = venueStatTiles({ forecast: { ...forecast, now: { kind: 'cloud' } }, score: 40, skyKindAtScore: 'cloud' });
  assert.deepEqual(cloud[0], { label: 'Right now', icon: 'cloud', value: 'Cloudy' });
  assert.equal(cloud[3].value, '40');
  // The building-shaded summary's own kind wins over the city forecast.
  const shadedSummary = venueStatTiles({ forecast: { ...forecast, now: { kind: 'rain' } }, sunNow: { kind: 'rain', statText: 'Rain now' } });
  assert.equal(shadedSummary[0].label, 'Right now');
  // Night still beats rain; loading shows the ellipsis.
  assert.equal(venueStatTiles({ forecast, isNight: true, skyKindAtScore: 'rain' })[3].value, 'After dark');
  assert.equal(venueStatTiles({ forecast, scoreLoading: true, skyKindAtScore: 'rain' })[3].value, '…');
});
