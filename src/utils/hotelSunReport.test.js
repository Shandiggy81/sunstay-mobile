import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHotelSunReport } from './hotelSunReport.js';
import { calculateBalconySunDay, calculateMonthlySunSummary } from './balconySunEngine.js';
import { roomsBySunToday, sunMomentsFromDay, SUN_MOMENTS } from './sunMoments.js';
import { formatSunDuration } from './formatSunDuration.js';

const LOCATION = { lat: -37.8136, lng: 144.9631, timeZone: 'Australia/Melbourne' };
const DATE = '2026-10-15';
const east = { id: 'east', name: 'East-facing rooms', orientation: 'E' };
const west = { id: 'west', name: 'West-facing rooms', orientation: 'W' };
const north = { id: 'north', name: 'North-facing rooms', orientation: 0 };
const hotel = (roomTypes, location = {}) => ({ ...LOCATION, ...location, roomTypes });
const options = (room, date = DATE) => ({ ...LOCATION, facing: room.orientation,
  obstructions: room.obstructions, overhang: room.overhang, date });
const overlapMinutes = (moment) => moment.windows.reduce((sum, { start, end }) => sum + (end - start) / 60000, 0);

describe('hotel Sun report engine integration', () => {
  it('uses the daily engine for totals and ranks the rooms by today’s sun', () => {
    const rooms = [west, north, east];
    const venue = hotel(rooms);
    const report = buildHotelSunReport(venue, { date: DATE });
    assert.deepEqual(report.rooms.map(({ id }) => id), roomsBySunToday(rooms, venue, DATE).map(({ id }) => id));
    for (const room of rooms) {
      const actual = report.rooms.find(({ id }) => id === room.id);
      const daily = calculateBalconySunDay(options(room));
      assert.equal(actual.totalMinutes, daily.totalMinutes);
      assert.equal(actual.durationText, formatSunDuration(daily.totalMinutes));
      assert.equal(actual.error, null);
    }
    assert.equal(report.date, DATE);
    assert.equal(report.timeZone, LOCATION.timeZone);
    assert.equal(report.year, 2026);
  });

  it('samples the real 15th-of-month engine totals and uses a common scale across room sides', () => {
    const report = buildHotelSunReport(hotel([east, north]), { date: DATE });
    const annualMaximum = Math.max(...[east, north].flatMap(room =>
      calculateMonthlySunSummary({ ...options(room), year: 2026 }).map(({ totalMinutes }) => totalMinutes)));
    for (const room of [east, north]) {
      const months = calculateMonthlySunSummary({ ...options(room), year: 2026 });
      const actual = report.rooms.find(({ id }) => id === room.id);
      assert.equal(actual.monthly.length, 12);
      actual.monthly.forEach((month, index) => {
        assert.equal(month.month, index + 1);
        assert.equal(month.date, `2026-${String(index + 1).padStart(2, '0')}-15`);
        assert.equal(month.totalMinutes, months[index].totalMinutes);
        assert.equal(month.hours, Number((months[index].totalMinutes / 60).toFixed(1)));
        assert.equal(month.barPercent, months[index].totalMinutes / annualMaximum * 100);
      });
    }
    assert.equal(Math.max(...report.rooms.flatMap(({ monthly }) => monthly.map(({ barPercent }) => barPercent))), 100);
    const januaryNorth = report.rooms.find(({ id }) => id === north.id).monthly[0];
    assert.ok(januaryNorth.barPercent < 100, 'a side’s local maximum must not determine its own scale');
  });

  it('reports the three sunniest positive months in calendar order, including winter sun', () => {
    const report = buildHotelSunReport(hotel([north]), { date: DATE });
    const room = report.rooms[0];
    assert.ok(room.monthly[6].totalMinutes > room.monthly[0].totalMinutes,
      'a Melbourne north-facing side has more direct sun in July than January');
    const ranked = [...room.monthly].filter(({ totalMinutes }) => totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes || a.month - b.month).slice(0, 3)
      .sort((a, b) => a.month - b.month).map(({ label }) => label);
    assert.deepEqual(room.sunniestMonths, ranked);
  });

  it('derives summer and winter chips from January 15 and July 15, without reusing today’s moments', () => {
    const room = buildHotelSunReport(hotel([north]), { date: DATE }).rooms[0];
    assert.deepEqual(room.seasons.map(({ key, label, date }) => [key, label, date]), [
      ['summer', 'Summer', '2026-01-15'], ['winter', 'Winter', '2026-07-15'],
    ]);
    for (const season of room.seasons) {
      const expected = sunMomentsFromDay({ daily: calculateBalconySunDay(options(north, season.date)), timeZone: LOCATION.timeZone }).moments;
      assert.deepEqual(season.moments.map(({ key, title, icon, available, minutes }) => ({ key, title, icon, available, minutes })),
        expected.map(moment => ({ key: moment.key, title: moment.title, icon: moment.icon,
          available: moment.available, minutes: overlapMinutes(moment) })));
    }
    assert.equal(room.seasons[0].moments.find(({ key }) => key === 'sunset').available, false);
    assert.equal(room.seasons[1].moments.find(({ key }) => key === 'sunset').available, true);
  });

  it('keeps measured obstructions and overhangs in every daily, annual and seasonal calculation', () => {
    const blocked = { ...north, id: 'blocked', obstructions: [{ start: 0, end: 360, minAltitude: 90 }] };
    const overhung = { ...north, id: 'roof', overhang: { depth: 1.2, height: 2.7 } };
    const report = buildHotelSunReport(hotel([north, blocked, overhung]), { date: DATE });
    const zero = report.rooms.find(({ id }) => id === 'blocked');
    assert.equal(zero.totalMinutes, 0);
    assert.equal(zero.durationText, '0m');
    assert.ok(zero.monthly.every(({ totalMinutes, barPercent }) => totalMinutes === 0 && barPercent === 0));
    assert.deepEqual(zero.sunniestMonths, []);
    assert.ok(zero.seasons.every(({ moments }) => moments.every(({ available, minutes }) => available === false && minutes === 0)));
    const roof = report.rooms.find(({ id }) => id === 'roof');
    assert.equal(roof.totalMinutes, calculateBalconySunDay(options(overhung)).totalMinutes);
    assert.ok(roof.totalMinutes < report.rooms.find(({ id }) => id === 'north').totalMinutes);
    assert.deepEqual(roof.monthly.map(({ totalMinutes }) => totalMinutes),
      calculateMonthlySunSummary({ ...options(overhung), year: 2026 }).map(({ totalMinutes }) => totalMinutes));
  });
});

describe('hotel Sun report recommendations', () => {
  it('selects each moment by today’s overlap minutes rather than total daily or seasonal sun', () => {
    const venue = hotel([west, north, east]);
    const report = buildHotelSunReport(venue, { date: DATE });
    assert.deepEqual(report.summary.map(({ key, title, icon }) => ({ key, title, icon })),
      SUN_MOMENTS.map(({ key, title, icon }) => ({ key, title, icon })));
    assert.equal(report.summary.find(({ key }) => key === 'coffee').roomName, east.name);
    assert.equal(report.summary.find(({ key }) => key === 'sunset').roomName, west.name);
    for (const recommendation of report.summary) {
      const overlaps = roomsBySunToday(venue.roomTypes, venue, DATE).map(room => {
        const moment = sunMomentsFromDay({ daily: calculateBalconySunDay(options(room)), timeZone: LOCATION.timeZone })
          .moments.find(({ key }) => key === recommendation.key);
        return { name: room.name, minutes: overlapMinutes(moment) };
      }).sort((a, b) => b.minutes - a.minutes);
      assert.equal(recommendation.minutes, overlaps[0].minutes);
      assert.equal(recommendation.roomName, overlaps[0].name);
    }
  });

  it('keeps a stable winner for tied moments and excludes zero-sun or invalid rooms', () => {
    const first = { ...north, id: 'first', name: 'First north-facing rooms' };
    const second = { ...north, id: 'second', name: 'Second north-facing rooms' };
    const broken = { name: 'Unknown rooftop', orientation: null };
    const blocked = { ...west, obstructions: [{ start: 0, end: 360, minAltitude: 90 }] };
    const report = buildHotelSunReport(hotel([broken, first, blocked, second]), { date: '2026-07-15' });
    assert.ok(report.summary.every(({ roomName }) => roomName === first.name));
    const unavailable = buildHotelSunReport(hotel([broken, blocked]), { date: DATE });
    assert.ok(unavailable.summary.every(({ roomName, minutes }) => roomName === null && minutes === 0));
    assert.ok(unavailable.rooms.find(({ id }) => id === west.id).monthly.every(({ barPercent }) => barPercent === 0));
  });
});

describe('hotel Sun report invalid data', () => {
  it('retains bad rooms as unavailable at the end without interpreting missing orientation as open roof', () => {
    const invalid = [null, {}, { orientation: null }, { orientation: '' }, { orientation: '  ' },
      { orientation: 'wrong' }, { orientation: 'N', obstructions: [{ start: 0, end: 90 }] },
      { orientation: 'N', obstructions: null }, { orientation: 'N', overhang: { depth: 2 } },
      { orientation: 'N', overhang: false }].map((room, index) => room && ({ ...room, id: `bad-${index}` }));
    const report = buildHotelSunReport(hotel([...invalid, north]), { date: DATE });
    assert.equal(report.rooms[0].id, north.id);
    assert.equal(report.rooms.length, invalid.length + 1);
    for (const room of report.rooms.slice(1)) {
      assert.equal(room.totalMinutes, null);
      assert.equal(room.durationText, 'Unavailable');
      assert.deepEqual(room.monthly, []);
      assert.deepEqual(room.seasons, []);
      assert.deepEqual(room.sunniestMonths, []);
      assert.equal(typeof room.error, 'string');
      assert.ok(room.error.length > 0);
    }
  });

  it('never coerces missing coordinates to zero, but accepts real zero and numeric strings', () => {
    for (const value of [null, undefined, '', '  ', false, [], NaN, Infinity, 181]) {
      const report = buildHotelSunReport(hotel([north], { lng: value }), { date: DATE });
      assert.equal(report.rooms[0].totalMinutes, null, `longitude ${String(value)}`);
    }
    assert.equal(buildHotelSunReport(hotel([north], { lat: 91 }), { date: DATE }).rooms[0].totalMinutes, null);
    const report = buildHotelSunReport(hotel([north], { lat: '0', lng: 0 }), { date: DATE });
    assert.equal(report.rooms[0].totalMinutes,
      calculateBalconySunDay({ lat: 0, lng: 0, facing: 0, timeZone: LOCATION.timeZone, date: DATE }).totalMinutes);
  });

  it('returns an empty report with honest missing recommendations when there are no room sides', () => {
    for (const roomTypes of [undefined, null, [], 'invalid']) {
      const report = buildHotelSunReport(hotel(roomTypes), { date: DATE });
      assert.deepEqual(report.rooms, []);
      assert.equal(report.summary.length, SUN_MOMENTS.length);
      assert.ok(report.summary.every(({ roomName, minutes }) => roomName === null && minutes === 0));
    }
  });

  it('does not mutate frozen input rooms or shading geometry', () => {
    const obstructions = Object.freeze([Object.freeze({ start: 350, end: 20, minAltitude: 30 })]);
    const room = Object.freeze({ ...north, source: 'estimated-buildings', floorLevel: 8, obstructions });
    const venue = Object.freeze(hotel(Object.freeze([room, Object.freeze({ ...east })])));
    const report = buildHotelSunReport(venue, { date: DATE });
    assert.equal(report.rooms.find(({ id }) => id === north.id).source, 'estimated-buildings');
    assert.equal(report.rooms.find(({ id }) => id === north.id).floorLevel, 8);
    assert.deepEqual(venue.roomTypes, [room, east]);
  });
});

describe('hotel Sun report venue-local dates', () => {
  it('uses the venue’s local date and year at midnight rather than the viewer’s date', () => {
    const now = new Date('2026-12-31T13:30:00Z');
    const melbourne = buildHotelSunReport(hotel([north]), { now });
    const losAngeles = buildHotelSunReport(hotel([], { timeZone: 'America/Los_Angeles' }), { now });
    assert.equal(melbourne.date, '2027-01-01');
    assert.equal(melbourne.year, 2027);
    assert.ok(melbourne.rooms[0].monthly.every(({ date }) => date.startsWith('2027-')));
    assert.equal(losAngeles.date, '2026-12-31');
    assert.equal(losAngeles.year, 2026);
    assert.equal(buildHotelSunReport(hotel([]), { now, date: '2026-06-15' }).date, '2026-06-15');
    assert.equal(buildHotelSunReport(hotel([]), { date: now }).date, '2027-01-01');
  });

  it('supports timezone aliases and the engine’s Melbourne default', () => {
    const now = new Date('2026-10-14T13:05:00Z');
    assert.equal(buildHotelSunReport({ roomTypes: [] }, { now }).timeZone, 'Australia/Melbourne');
    assert.equal(buildHotelSunReport({ roomTypes: [], timezone: 'America/Los_Angeles' }, { now }).date, '2026-10-14');
  });

  it('rejects invalid dates, impossible local dates and timezone errors even without rooms', () => {
    for (const date of ['2026-02-30', 'not-a-date', '', null, new Date(NaN), '1899-10-15', '2101-10-15'])
      assert.throws(() => buildHotelSunReport(hotel([]), { date }), RangeError, String(date));
    assert.throws(() => buildHotelSunReport(hotel([], { timeZone: 'Invalid/Zone' }), { date: DATE }), RangeError);
    assert.throws(() => buildHotelSunReport(hotel([], { timeZone: 'Pacific/Apia' }), { date: '2011-12-30' }), RangeError);
    assert.throws(() => buildHotelSunReport(hotel([]), { now: null }), RangeError);
  });

  it('is independent of the process timezone', () => {
    const previous = process.env.TZ;
    try {
      const reports = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(zone => {
        process.env.TZ = zone;
        return buildHotelSunReport(hotel([east]), { now: new Date('2026-10-14T13:05:00Z') });
      });
      assert.deepEqual(reports[0], reports[1]);
      assert.deepEqual(reports[1], reports[2]);
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
