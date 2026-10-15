import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import SunCalc from 'suncalc';
import {
  calculateBalconySunDay, calculateMonthlySunSummary, formatSunTime, formatSunWindows,
  isDirectSun, parseFacing, SUN_DAY_CACHE_LIMIT, venueDayBounds, venueLocalDate,
  formatGuestDate, formatGuestTime, formatGuestWindows,
} from './balconySunEngine.js';
import { calculateBalconySun } from './calculateBalconySun.js';

const MELBOURNE = { lat: -37.8136, lng: 144.9631, facing: 'N', timeZone: 'Australia/Melbourne' };
const LISBON = { lat: 38.7223, lng: -9.1393, facing: 100, timeZone: 'Europe/Lisbon', date: '2027-06-21' };
const near = (actual, expected, tolerance = 3) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} (±${tolerance})`);
const localMinutes = (instant, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
};
function checkWindow(result, start, end) {
  assert.equal(result.windows.length, 1);
  near(localMinutes(result.windows[0].start, result.timeZone), start);
  near(localMinutes(result.windows[0].end, result.timeZone), end);
}

// All fixtures use real SunCalc 1.9, not mocked position data.
describe('balcony reference fixtures', () => {
  it('Melbourne winter: north balcony receives morning and sunset sun', () => {
    const result = calculateBalconySunDay({ ...MELBOURNE, date: '2027-06-21' });
    checkWindow(result, 7 * 60 + 41, 17 * 60 + 3);
    near(result.totalMinutes, 562);
    assert.equal(result.morningCoffee.available, true);
    assert.equal(result.sunsetDrinks.available, true);
    near(localMinutes(result.morningCoffee.windows[0].end, result.timeZone), 600, 0.02);
    const sunset = result.sunset.getTime();
    assert.ok(result.sunsetDrinks.windows.every(w => w.start.getTime() >= sunset - 90 * 60000 && w.end.getTime() <= sunset));
    assert.ok(result.goldenHours.morning.start < result.goldenHours.morning.end);
    assert.ok(result.goldenHours.evening.start < result.goldenHours.evening.end);
  });
  it('Melbourne summer: north-facing sun ends before sunset drinks', () => {
    const result = calculateBalconySunDay({ ...MELBOURNE, date: '2026-12-21' });
    checkWindow(result, 9 * 60 + 34, 17 * 60 + 2);
    assert.equal(result.morningCoffee.available, true);
    assert.equal(result.sunsetDrinks.available, false);
    assert.deepEqual(result.sunsetDrinks.windows, []);
  });
  it('Santorini west terrace: afternoon sun, no morning coffee', () => {
    const result = calculateBalconySunDay({ lat: 36.4618, lng: 25.3753, facing: 'W', timeZone: 'Europe/Athens', date: '2027-07-15' });
    checkWindow(result, 13 * 60 + 25, 20 * 60 + 33);
    assert.equal(result.morningCoffee.available, false);
    assert.equal(result.sunsetDrinks.available, true);
  });
  it('Lisbon overhang reduces 7h33m to 5h46m', () => {
    const open = calculateBalconySunDay(LISBON);
    const roof = calculateBalconySunDay({ ...LISBON, overhang: { depth: 1.2, height: 2.7 } });
    near(open.totalMinutes, 453);
    near(roof.totalMinutes, 346);
    assert.ok(roof.totalMinutes < open.totalMinutes);
  });
});

describe('balcony calculation cache', () => {
  it('returns the same cached daily and monthly results for equivalent inputs', () => {
    const options = { ...LISBON, year: 2028, obstructions: [{ start: 350, end: 20, minAltitude: 10 }], overhang: { depth: 1.2, height: 2.7 } };
    const equivalent = { ...options, obstructions: [{ minAltitude: 10, end: 20, start: 350 }], overhang: { height: 2.7, depth: 1.2 } };
    assert.strictEqual(calculateBalconySunDay(options), calculateBalconySunDay(equivalent));
    assert.strictEqual(calculateMonthlySunSummary(options), calculateMonthlySunSummary(equivalent));
    assert.strictEqual(calculateBalconySunDay({ ...options, facing: 'E' }), calculateBalconySunDay({ ...options, facing: 90 }));
  });
  it('keys every geometry and period field, including legacy calculation parameters', () => {
    const options = { ...MELBOURNE, date: '2028-06-21', year: 2028 };
    const daily = calculateBalconySunDay(options), monthly = calculateMonthlySunSummary(options);
    for (const change of [{ lat: -37.8 }, { lng: 144.9 }, { facing: 'W' }, { timeZone: 'Europe/Athens' },
      { obstructions: [{ start: 350, end: 20, minAltitude: 25 }] }, { overhang: { depth: 1.2, height: 2.7 } },
      { fovDeg: 90 }, { minAltitude: 5 }]) {
      assert.notStrictEqual(calculateBalconySunDay({ ...options, ...change }), daily);
      assert.notStrictEqual(calculateMonthlySunSummary({ ...options, ...change }), monthly);
    }
    assert.notStrictEqual(calculateBalconySunDay({ ...options, date: '2028-06-22' }), daily);
    assert.notStrictEqual(calculateMonthlySunSummary({ ...options, year: 2029 }), monthly);
    assert.throws(() => calculateBalconySunDay({ ...options, lat: NaN }), RangeError);
  });
  it('bounds memory by evicting the oldest calculation results', () => {
    const options = { ...MELBOURNE, lat: -37.7, date: '2028-01-01' };
    const first = calculateBalconySunDay(options);
    for (let i = 1; i <= SUN_DAY_CACHE_LIMIT; i++) calculateBalconySunDay({ ...options, date: new Date(Date.UTC(2028, 0, 1 + i)) });
    assert.notStrictEqual(calculateBalconySunDay(options), first);
    assert.deepEqual(calculateBalconySunDay(options), first);
  });
});

describe('guest-friendly venue-local times', () => {
  it('shows the friendly venue date, even when the UTC/viewer date is the day before', () => {
    assert.equal(formatGuestDate(new Date('2026-10-13T13:00Z'), 'Australia/Melbourne'), 'Wed 14 Oct');
    assert.equal(formatGuestDate(new Date('2026-10-13T13:00Z'), 'America/Los_Angeles'), 'Tue 13 Oct');
  });
  const start = new Date('2026-12-20T19:42:00Z'), end = new Date('2026-12-21T02:07:00Z');
  const windows = [{ start, end }];
  it('uses compact am/pm and hides the zone for a viewer in the venue timezone', () => {
    assert.equal(formatGuestTime(start, 'Australia/Melbourne', 'Australia/Melbourne'), '6:42am');
    assert.equal(formatGuestWindows(windows, 'Australia/Melbourne', 'Australia/Melbourne'), '6:42am–1:07pm');
    assert.equal(formatGuestTime(new Date('2026-12-21T02:07:40Z'), 'Australia/Melbourne', 'Australia/Melbourne'), '1:08pm');
    assert.match(formatSunTime(start, 'Australia/Melbourne'), /^06:42 GMT\+11$/, 'existing formatter is unchanged');
  });
  it('appends an abbreviation only for a different viewer timezone, once per window', () => {
    assert.equal(formatGuestTime(start, 'Australia/Melbourne', 'America/Los_Angeles'), '6:42am AEDT');
    assert.equal(formatGuestWindows(windows, 'Australia/Melbourne', 'America/Los_Angeles'), '6:42am–1:07pm AEDT');
    assert.equal(formatGuestTime(new Date('2027-06-21T08:00Z'), 'Europe/Athens', 'UTC'), '11:00am EEST');
    assert.equal(formatGuestTime(new Date('2027-06-21T08:00Z'), 'America/New_York', 'UTC'), '4:00am EDT');
    assert.equal(formatGuestTime(new Date('2027-06-21T08:00Z'), 'Asia/Tokyo', 'UTC'), '5:00pm JST');
  });
  it('uses the runtime viewer timezone by default and recognises timezone aliases', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Australia/Melbourne';assert.equal(formatGuestWindows(windows), '6:42am–1:07pm');
      process.env.TZ = 'America/Los_Angeles';assert.equal(formatGuestWindows(windows), '6:42am–1:07pm AEDT');
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
    assert.equal(formatGuestTime(new Date('2027-06-21T08:00Z'), 'US/Eastern', 'America/New_York'), '4:00am');
  });
  it('preserves midnight/next-day markers, separate windows and a DST abbreviation change', () => {
    const midnight = { start: new Date('2026-12-21T12:00Z'), end: new Date('2026-12-21T13:00Z') };
    assert.equal(formatGuestWindows([midnight], 'Australia/Melbourne', 'Australia/Melbourne'), '11:00pm–12:00am (next day)');
    assert.equal(formatGuestWindows([...windows, midnight], 'Australia/Melbourne', 'Australia/Melbourne'), '6:42am–1:07pm; 11:00pm–12:00am (next day)');
    const dst = { start: new Date('2026-11-01T04:30Z'), end: new Date('2026-11-01T07:30Z') };
    assert.equal(formatGuestWindows([dst], 'America/New_York', 'UTC'), '12:30am EDT–2:30am EST');
  });
});

describe('venue-local dates', () => {
  it('samples all 23 hours of Melbourne DST start and 25 hours of DST end', () => {
    for (const [date, hours] of [['2026-10-04', 23], ['2026-04-05', 25]]) {
      const result = calculateBalconySunDay({ ...MELBOURNE, date });
      assert.equal((result.dayEnd - result.dayStart) / 3600000, hours);
      assert.equal(venueLocalDate(result.dayStart, MELBOURNE.timeZone), date);
      assert.ok(result.windows.length > 0);
      assert.ok(result.windows.every(w => w.start >= result.dayStart && w.end <= result.dayEnd));
    }
  });
  it('is identical across process timezones, including Date input, formatting and wrapper', () => {
    const original = process.env.TZ;
    try {
      const results = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(zone => {
        process.env.TZ = zone;
        const options = { ...MELBOURNE, date: new Date('2026-10-03T17:00:00Z') };
        const result = calculateBalconySunDay(options);
        return { result, formatted: formatSunWindows(result.windows, result.timeZone),
          months: calculateMonthlySunSummary({ ...options, year: 2027 }),
          wrapper: calculateBalconySun(MELBOURNE.lat, MELBOURNE.lng, options.date, 'N') };
      });
      assert.deepEqual(results[0], results[1]);assert.deepEqual(results[1], results[2]);
    } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
  });
  it('handles fractional offsets and rejects an entirely skipped local date', () => {
    const day = venueDayBounds('2027-06-21', 'Asia/Kathmandu');
    assert.equal(day.start.toISOString(), '2027-06-20T18:15:00.000Z');
    assert.throws(() => venueDayBounds('2011-12-30', 'Pacific/Apia'), /does not exist/);
  });
});

describe('sun geometry and transitions', () => {
  it('accepts all compass points, numeric strings, zero and wraparound', () => {
    assert.equal(parseFacing(' ssw '), 202.5);assert.equal(parseFacing('NNE'), 22.5);
    assert.equal(parseFacing('100'), 100);assert.equal(parseFacing(0), 0);
    assert.equal(parseFacing(360), 0);assert.equal(parseFacing(-10), 350);
    assert.equal(parseFacing('100junk'), null);assert.equal(parseFacing(Infinity), null);
  });
  it('obstruction crossing north blocks 350°–20° but leaves other bearings open', () => {
    const room = { lat: 36.4618, lng: 25.3753, facing: 'N' };
    const obstruction = { start: 350, end: 20, minAltitude: 90 };
    const day = venueDayBounds('2027-06-21', 'Europe/Athens');
    let inside = 0, outside = 0;
    for (let t = day.start.getTime(); t < day.end.getTime(); t += 5 * 60000) {
      if (!isDirectSun(t, room)) continue;
      const bearing = (SunCalc.getPosition(new Date(t), room.lat, room.lng).azimuth * 180 / Math.PI + 180) % 360;
      const blocked = isDirectSun(t, { ...room, obstructions: [obstruction] });
      if (bearing >= 350 || bearing <= 20) { assert.equal(blocked, false);inside++; }
      else { assert.equal(blocked, true);outside++; }
    }
    // At this latitude the sun does not enter the narrow due-north sector.
    // Use a polar summer day where it circles through north above the horizon.
    const polar = { lat: 78.2232, lng: 15.6469, facing: 'N' };
    const polarDay = venueDayBounds('2027-06-21', 'Arctic/Longyearbyen');
    for (let t = polarDay.start.getTime(); t < polarDay.end.getTime(); t += 5 * 60000) {
      if (!isDirectSun(t, polar)) continue;
      const bearing = (SunCalc.getPosition(new Date(t), polar.lat, polar.lng).azimuth * 180 / Math.PI + 180) % 360;
      if (bearing >= 350 || bearing <= 20) { assert.equal(isDirectSun(t, { ...polar, obstructions: [obstruction] }), false);inside++; }
    }
    assert.ok(inside > 0);assert.ok(outside > 0);
  });
  it('uses strict facing <90° and altitude above the obstruction', () => {
    const instant = new Date('2027-06-21T02:00:00Z');
    const position = SunCalc.getPosition(instant, MELBOURNE.lat, MELBOURNE.lng);
    const bearing = (position.azimuth * 180 / Math.PI + 180) % 360;
    assert.equal(isDirectSun(instant, { ...MELBOURNE, facing: bearing + 90 }), false);
    assert.equal(isDirectSun(instant, { ...MELBOURNE, facing: bearing + 89.9 }), true);
    assert.equal(isDirectSun(instant, { ...MELBOURNE, obstructions: [{ start: 0, end: 360, minAltitude: position.altitude * 180 / Math.PI }] }), false);
  });
  it('refines every detected edge below one minute', () => {
    const options = { ...MELBOURNE, date: '2026-12-21' };
    const result = calculateBalconySunDay(options);
    for (const w of result.windows) {
      assert.equal(isDirectSun(w.start.getTime() - 1000, options), false);
      assert.equal(isDirectSun(w.start.getTime() + 1000, options), true);
      assert.equal(isDirectSun(w.end.getTime() - 1000, options), true);
      assert.equal(isDirectSun(w.end.getTime() + 1000, options), false);
    }
    assert.match(formatSunTime(new Date('2027-06-20T21:41:40Z')), /^07:42/);
  });
  it('splits windows for measured daytime obstructions and takes the largest overlapping horizon', () => {
    const options = { ...MELBOURNE, date: '2027-06-21', obstructions: [{ start: 350, end: 20, minAltitude: 90 }] };
    const split = calculateBalconySunDay(options);
    assert.equal(split.windows.length, 2);
    const overlapped = calculateBalconySunDay({ ...options, obstructions: [...options.obstructions, { start: 350, end: 20, minAltitude: 5 }] });
    assert.deepEqual(split, overlapped);
  });
  it('handles polar day and polar night without invalid dates or invented sunset drinks', () => {
    const polar = { lat: 78.2232, lng: 15.6469, facing: 'N', timeZone: 'Arctic/Longyearbyen' };
    for (const date of ['2027-06-21', '2027-12-21']) {
      const result = calculateBalconySunDay({ ...polar, date });
      assert.equal(result.sunrise, null);assert.equal(result.sunset, null);
      assert.equal(result.sunsetDrinks.available, null);
      if (date.includes('12-')) { assert.equal(result.totalMinutes, 0);assert.deepEqual(result.windows, []); }
      else assert.ok(result.totalMinutes > 0);
    }
  });
});

describe('summary, validation and legacy compatibility', () => {
  it('returns 12 representative days using the requested year and geometry without mutating it', () => {
    const options = { ...LISBON, year: 2027, overhang: Object.freeze({ depth: 1.2, height: 2.7 }) };
    Object.freeze(options);
    const months = calculateMonthlySunSummary(options);
    assert.equal(months.length, 12);
    months.forEach((month, i) => {
      assert.equal(month.month, i + 1);assert.match(month.date, /^2027-\d{2}-15$/);
      const daily = calculateBalconySunDay({ ...options, date: month.date });
      assert.equal(month.totalMinutes, daily.totalMinutes);
      assert.equal(month.morningCoffee, daily.morningCoffee.available);
      assert.equal(month.sunsetDrinks, daily.sunsetDrinks.available);
    });
  });
  it('rejects invalid coordinates, timezone, dates, facing and incomplete geometry', () => {
    const valid = { ...MELBOURNE, date: '2027-06-21' };
    for (const invalid of [{ lat: 91 }, { lng: NaN }, { timeZone: 'Invalid/Zone' }, { date: '2027-02-30' },
      { facing: 'wrong' }, { overhang: { depth: 1 } }, { overhang: { depth: 0, height: 2 } },
      { obstructions: [{ start: 350, end: 20 }] }, { obstructions: [{ start: 0, end: 0, minAltitude: 20 }] }])
      assert.throws(() => calculateBalconySunDay({ ...valid, ...invalid }), RangeError);
    assert.throws(() => calculateMonthlySunSummary({ ...valid, year: 2027.5 }), RangeError);
  });
  it('keeps the legacy shape and delegates duration and longest window to the engine', () => {
    const result = calculateBalconySun(MELBOURNE.lat, MELBOURNE.lng, '2027-06-21', 'N');
    assert.deepEqual(Object.keys(result).sort(), ['balconyFacingDeg', 'balconyFacingLabel', 'peakWindow', 'sunnyHours', 'totalSunHours']);
    assert.equal(result.balconyFacingDeg, 0);assert.equal(result.balconyFacingLabel, 'N');
    near(result.totalSunHours * 60, 562);
    assert.match(result.peakWindow, /07:41.*17:03/);
    assert.ok(result.sunnyHours.includes(7));assert.ok(result.sunnyHours.includes(17));
    assert.equal(calculateBalconySun(NaN, 0).peakWindow, null);
    assert.ok(calculateBalconySun(MELBOURNE.lat, MELBOURNE.lng, '2027-06-21').totalSunHours > 0);
    assert.ok(calculateBalconySun(MELBOURNE.lat, MELBOURNE.lng, '2027-06-21', 'N', 90, 5).totalSunHours < result.totalSunHours);
  });
});

describe('shared per-day work (caching for large venue lists)', () => {
  it('returns fresh Date objects, so a caller mutating them cannot corrupt the cached bounds', () => {
    const first = venueDayBounds('2026-10-15', 'Australia/Melbourne');
    const expected = first.start.getTime();
    first.start.setTime(0);
    first.end.setTime(0);
    const again = venueDayBounds('2026-10-15', 'Australia/Melbourne');
    assert.equal(again.start.getTime(), expected);
    assert.notStrictEqual(again.start, first.start);
    assert.equal(again.end.getTime() - again.start.getTime(), 24 * 3600000);
  });

  it('keeps a clock-change day at its real length (23 h and 25 h in Melbourne)', () => {
    const springForward = venueDayBounds('2026-10-04', 'Australia/Melbourne');
    const fallBack = venueDayBounds('2026-04-05', 'Australia/Melbourne');
    assert.equal(springForward.end - springForward.start, 23 * 3600000);
    assert.equal(fallBack.end - fallBack.start, 25 * 3600000);
  });

  it('still rejects a date that does not exist, every time it is asked', () => {
    assert.throws(() => venueDayBounds('2011-12-30', 'Pacific/Apia'), /does not exist/);
    assert.throws(() => venueDayBounds('2011-12-30', 'Pacific/Apia'), /does not exist/);
  });

  it('morning-coffee windows stay on local 6–10 am on normal and clock-change days', () => {
    for (const date of ['2026-10-15', '2026-10-04', '2026-04-05']) {
      const day = calculateBalconySunDay({ ...MELBOURNE, facing: null, date });
      for (const w of day.morningCoffee.windows) {
        const from = localMinutes(w.start, 'Australia/Melbourne');
        const to = localMinutes(w.end, 'Australia/Melbourne');
        assert.ok(from >= 360 - 0.02 && to <= 600 + 0.02, `${date}: ${from}–${to}`);
      }
      assert.equal(day.morningCoffee.available, day.morningCoffee.windows.length > 0);
    }
  });

  it('gives the same day twice in a row from the cache, identical in content', () => {
    const options = { ...MELBOURNE, date: '2026-12-21' };
    const a = calculateBalconySunDay(options);
    const b = calculateBalconySunDay(options);
    assert.deepEqual(b, a);
  });
});
