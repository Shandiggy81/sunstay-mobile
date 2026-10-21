import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaySunReport, EVIDENCE, FACADE_SIDES_HEADLINE, FACADE_TRUST_LINE, MODELLED_ROOM_TRUST_LINE,
  stayRoomDisplay, stayRoomTypeMode, stayRoomTypesDisplay, STAY_SUN_MODES,
} from './stayRoomTypes.js';
import { buildHotelSunReport } from './hotelSunReport.js';

const NOW = new Date('2026-10-21T00:00:00Z');
const LOCATION = { lat: -37.8136, lng: 144.9631, timeZone: 'Australia/Melbourne', typeCategory: 'Hotel' };
// Shaped like production: modelled facade sides at one floor.
const north = { id: 'h-facade-0', name: 'North-facing rooms · Level 19', orientation: 340, floorLevel: 19, floorHeight: 60.8,
  source: 'estimated-buildings', wallMetres: 42, obstructions: [{ start: 100, end: 160, minAltitude: 30 }] };
const west = { id: 'h-facade-1', name: 'West-facing rooms · Level 19', orientation: 265, floorLevel: 19, source: 'estimated-buildings', obstructions: [] };
const street = { id: 'q-0', name: 'City side · Northeast-facing', orientation: 55, floorLevel: 2, source: 'estimated' };
const stay = (roomTypes, extra = {}) => ({ ...LOCATION, roomTypes, ...extra });

const kingNorth = { id: 'king', kind: 'room_type', name: 'King Harbour View', orientation: 0, facadeId: 'f-north',
  floorMin: 10, floorMax: 20, outdoorSpace: 'balcony' };
const twinWest = { id: 'twin', kind: 'room_type', name: 'Twin City', orientation: 270, facadeId: 'f-west',
  floorMin: 5, floorMax: 12, outdoorSpace: 'balcony' };
const confirmed = (date, expires = null) => ({ state: 'hotel_confirmed', confirmedAt: date, expiresAt: expires });

const allText = display => JSON.stringify({ ...display, entries: display.entries.map(({ evidenceDate, ...rest }) => rest) });

describe('§5 row 1: facade sides only', () => {
  const display = stayRoomTypesDisplay(stay([north, west, street]), { now: NOW });

  it('shows sun by side of the building, modelled, with no room picker', () => {
    assert.equal(display.mode, STAY_SUN_MODES.FACADE_SIDES);
    assert.equal(display.headline, FACADE_SIDES_HEADLINE);
    assert.equal(display.headline, 'Sun by side of the building');
    assert.equal(display.trustLine, 'Modelled from building footprint and neighbours');
    assert.equal(display.showRoomPicker, false);
    assert.equal(display.bestLabel, 'Sunniest side');
  });

  it('names each side and its floor, never a room', () => {
    assert.deepEqual(display.entries.map(e => e.displayName), ['North side · Level 19', 'West side · Level 19', 'North-east side · Level 2']);
    assert.deepEqual(display.entries.map(e => e.title), ['North side', 'West side', 'North-east side']);
    for (const entry of display.entries) {
      assert.equal(entry.evidence, EVIDENCE.MODELLED);
      assert.equal(entry.trustLine, FACADE_TRUST_LINE);
      assert.equal(entry.evidenceLabel, 'Modelled · not yet confirmed by the hotel');
      assert.equal(entry.chip, null);
    }
    assert.doesNotMatch(allText(display), /\broom/i);
  });

  it('treats estimated entries as facade sides even if they claim to be room types', () => {
    const claimed = { ...north, kind: 'room_type' };
    assert.equal(stayRoomTypeMode([claimed]), STAY_SUN_MODES.FACADE_SIDES);
    assert.doesNotMatch(allText(stayRoomTypesDisplay(stay([claimed]), { now: NOW })), /\broom/i);
  });

  it('keeps facade mode when only some entries are hotel room types', () => {
    const display = stayRoomTypesDisplay(stay([kingNorth, north]), { now: NOW });
    assert.equal(display.mode, STAY_SUN_MODES.FACADE_SIDES);
    assert.equal(display.showRoomPicker, false);
    assert.equal(display.entries[0].displayName, 'North side');
  });

  it('falls back to the name when the bearing is missing, and never repeats "rooms"', () => {
    const [named, unnamed] = stayRoomTypesDisplay(stay([{ name: 'South-west-facing rooms · Level 4', floorLevel: 4 },
      { name: 'Deluxe rooms', floorLevel: 3 }]), { now: NOW }).entries;
    assert.equal(named.displayName, 'South-west side · Level 4');
    assert.equal(unnamed.displayName, 'Building side 2 · Level 3');
  });

  it('says owner, not hotel, for a residential property', () => {
    const [entry] = stayRoomTypesDisplay(stay([north], { typeCategory: 'Residential' }), { now: NOW }).entries;
    assert.equal(entry.evidenceLabel, 'Modelled · not yet confirmed by the owner');
  });
});

describe('§5 row 2: room types, all facts modelled', () => {
  it('shows balcony sun, the evidence ladder and a room picker for two facades', () => {
    const display = stayRoomTypesDisplay(stay([kingNorth, twinWest]), { now: NOW });
    assert.equal(display.mode, STAY_SUN_MODES.ROOM_TYPES);
    assert.equal(display.headline, 'Balcony sun');
    assert.equal(display.trustLine, MODELLED_ROOM_TRUST_LINE);
    assert.equal(display.showRoomPicker, true);
    assert.deepEqual(display.entries.map(e => [e.displayName, e.evidence, e.chip]),
      [['King Harbour View', 'modelled', null], ['Twin City', 'modelled', null]]);
  });

  it('shows window sun for window-only rooms', () => {
    const windows = [{ ...kingNorth, outdoorSpace: 'window_only' }, { ...twinWest, outdoorSpace: undefined, outdoor_space: 'none' }];
    const display = stayRoomTypesDisplay(stay(windows), { now: NOW });
    assert.equal(display.headline, 'Window sun');
    assert.deepEqual(display.entries.map(e => e.sunLabel), ['Window sun', 'Window sun']);
    assert.equal(stayRoomTypesDisplay(stay([kingNorth, windows[1]]), { now: NOW }).headline, 'Balcony and window sun');
  });

  it('hides the room picker for one room type or two on the same facade', () => {
    assert.equal(stayRoomTypesDisplay(stay([kingNorth]), { now: NOW }).showRoomPicker, false);
    const sameSide = { ...twinWest, orientation: 5, facadeId: 'f-north' };
    assert.equal(stayRoomTypesDisplay(stay([kingNorth, sameSide]), { now: NOW }).showRoomPicker, false);
  });
});

describe('§5 row 3: room facade and floor range hotel-confirmed', () => {
  const facts = { room_facade: confirmed('2026-09-01T00:00:00Z'), floor_range: confirmed('2026-09-10T00:00:00Z') };

  it('shows hotel-confirmed with the older confirmation date and the chip', () => {
    const [entry] = stayRoomTypesDisplay(stay([{ ...kingNorth, facts }, twinWest]), { now: NOW }).entries;
    assert.equal(entry.evidence, EVIDENCE.HOTEL_CONFIRMED);
    assert.equal(entry.trustLine, 'Hotel-confirmed · 1 Sept 2026');
    assert.equal(entry.chip, 'Confirmed by the hotel');
  });

  it('needs both facts confirmed', () => {
    const [entry] = stayRoomTypesDisplay(stay([{ ...kingNorth, facts: { room_facade: facts.room_facade } }]), { now: NOW }).entries;
    assert.equal(entry.evidence, EVIDENCE.MODELLED);
  });

  it('falls back to modelled once a fact expires', () => {
    const expired = { ...facts, floor_range: confirmed('2026-01-01T00:00:00Z', '2026-10-01T00:00:00Z') };
    const [entry] = stayRoomTypesDisplay(stay([{ ...kingNorth, facts: expired }]), { now: NOW }).entries;
    assert.equal(entry.evidence, EVIDENCE.MODELLED);
    assert.equal(entry.trustLine, MODELLED_ROOM_TRUST_LINE);
  });
});

describe('§5 row 4: on-site checked', () => {
  it('outranks hotel confirmation and shows the date', () => {
    const room = { ...kingNorth, facts: { room_facade: confirmed('2026-09-01'), floor_range: confirmed('2026-09-01') },
      onSiteCheck: { confirmedAt: '2026-10-02T00:00:00Z' } };
    const [entry] = stayRoomTypesDisplay(stay([room]), { now: NOW }).entries;
    assert.equal(entry.evidence, EVIDENCE.ON_SITE_CHECKED);
    assert.equal(entry.trustLine, 'On-site checked · 2 Oct 2026');
    assert.equal(entry.chip, 'On-site checked');
  });

  it('ignores a check dated in the future or past its expiry', () => {
    for (const onSiteCheck of [{ confirmedAt: '2026-12-01' }, { confirmedAt: '2025-01-01', expiresAt: '2026-01-01' }, { confirmedAt: 'nope' }]) {
      assert.equal(stayRoomTypesDisplay(stay([{ ...kingNorth, onSiteCheck }]), { now: NOW }).entries[0].evidence, EVIDENCE.MODELLED);
    }
  });
});

describe('missing and bad data', () => {
  for (const [label, venue] of [['no venue', null], ['no roomTypes', LOCATION], ['empty roomTypes', stay([])], ['non-array roomTypes', stay('north')]]) {
    it(`handles ${label}`, () => {
      const display = stayRoomTypesDisplay(venue, { now: NOW });
      assert.equal(display.mode, STAY_SUN_MODES.FACADE_SIDES);
      assert.equal(display.headline, FACADE_SIDES_HEADLINE);
      assert.deepEqual(display.entries, []);
      assert.equal(display.showRoomPicker, false);
    });
  }

  it('keeps a bad entry as a named side without hiding the others', () => {
    const display = stayRoomTypesDisplay(stay([null, north, 'oops', { orientation: 'sideways' }]), { now: NOW });
    assert.deepEqual(display.entries.map(e => e.displayName), ['Building side 1', 'North side · Level 19', 'Building side 3', 'Building side 4']);
    assert.doesNotMatch(allText(display), /\broom/i);
  });

  it('finds the display for a room by identity or id', () => {
    const venue = stay([north, west]);
    assert.equal(stayRoomDisplay(venue, west, { now: NOW }).displayName, 'West side · Level 19');
    assert.equal(stayRoomDisplay(venue, { ...west }, { now: NOW }).displayName, 'West side · Level 19');
    assert.equal(stayRoomDisplay(venue, street, { now: NOW }).displayName, 'North-east side · Level 2');
  });
});

describe('buildStaySunReport', () => {
  const DATE = '2026-10-15';

  it('keeps every sun number from buildHotelSunReport and only renames', () => {
    const venue = stay([north, west, street]);
    const original = buildHotelSunReport(venue, { date: DATE });
    const report = buildStaySunReport(venue, { date: DATE, now: NOW });
    const strip = room => { const { name, display, ...rest } = room; return rest; };
    assert.deepEqual(report.rooms.map(strip), original.rooms.map(strip));
    assert.deepEqual(report.summary.map(({ roomName, ...rest }) => rest), original.summary.map(({ roomName, ...rest }) => rest));
    assert.deepEqual(report.rooms.map(r => r.name), report.rooms.map(r => r.display.displayName));
    assert.ok(report.rooms.some(r => r.totalMinutes > 0));
    assert.equal(report.display.headline, FACADE_SIDES_HEADLINE);
    assert.doesNotMatch(JSON.stringify(report.rooms.map(r => r.name).concat(report.summary.map(s => s.roomName))), /\broom/i);
  });

  it('keeps a bad entry unavailable with a side name', () => {
    const report = buildStaySunReport(stay([null, north]), { date: DATE, now: NOW });
    const bad = report.rooms.find(r => r.error);
    assert.equal(bad.name, 'Building side 1');
    assert.equal(bad.totalMinutes, null);
    assert.equal(report.rooms.filter(r => !r.error).length, 1);
  });
});
