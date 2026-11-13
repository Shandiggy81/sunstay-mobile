import SunCalc from 'suncalc';

export const DEFAULT_TIME_ZONE = 'Australia/Melbourne';
// Original calculateBalconySun direction map, shared by both entry points.
export const DIRECTION_MAP = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};
const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, RAD = Math.PI / 180;
const normalise = n => ((n % 360) + 360) % 360;
// Bounded LRU shared across room mounts. Treat returned cached results as read-only.
const resultCache = new Map();
// Sized for every venue on the map (about 1,000 in the City of Melbourne) plus
// room views, so re-filtering on the same day reuses each venue's day.
export const SUN_DAY_CACHE_LIMIT = 2048;
const CACHE_LIMIT = SUN_DAY_CACHE_LIMIT;
function cacheKey(kind, room, timeZone, period) {
  return JSON.stringify([kind, room.lat, room.lng, room.facing, timeZone, room.horizon,
    room.overhang ? [room.overhang.depth, room.overhang.height, room.overhang.balconyDepth, room.overhang.minLitShare] : null,
    room.halfFov, room.minAltitude, period]);
}
function cachedResult(key) {
  const result = resultCache.get(key);
  if (result) { resultCache.delete(key); resultCache.set(key, result); }
  return result;
}
function rememberResult(key, result) {
  resultCache.set(key, result);
  if (resultCache.size > CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value);
  return result;
}

export function parseFacing(value) {
  if (value == null || String(value).trim() === '') return null;
  const key = String(value).trim().toUpperCase();
  if (Object.hasOwn(DIRECTION_MAP, key)) return DIRECTION_MAP[key];
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? normalise(number) : null;
}

export function angularDifference(a, b) {
  const difference = normalise(a - b);
  return Math.min(difference, 360 - difference);
}

export function facingLabel(value) {
  const bearing = parseFacing(value);
  if (bearing === null) return 'Unknown';
  return Object.keys(DIRECTION_MAP).reduce((best, label) =>
    angularDifference(bearing, DIRECTION_MAP[label]) < angularDifference(bearing, DIRECTION_MAP[best]) ? label : best, 'N');
}

// Intl formatters are expensive to build and were the main cost of a day
// calculation, so keep one per time zone.
const formatters = new Map();
function dateFormatter(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant, formatter) {
  const p = Object.fromEntries(formatter.formatToParts(new Date(instant))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

export function venueLocalDate(instant, timeZone = DEFAULT_TIME_ZONE) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date.');
  return localParts(date, dateFormatter(timeZone)).date;
}

function calendarDate(date, timeZone) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return venueLocalDate(date, timeZone);
  const instant = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== date) throw new RangeError('Invalid calendar date.');
  return date;
}

// First instant on or after a venue-local date. Handles DST, fractional UTC
// offsets, missing midnight and entire dates skipped by timezone changes.
function localBoundary(date, formatter) {
  const nominal = Date.parse(`${date}T00:00:00Z`);
  let lo = nominal - 36 * HOUR, hi = null;
  for (let t = lo + 30 * MINUTE; t <= nominal + 36 * HOUR; t += 30 * MINUTE) {
    if (localParts(t, formatter).date >= date) { hi = t; break; }
    lo = t;
  }
  if (hi === null) throw new RangeError('Could not resolve the venue-local date.');
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localParts(mid, formatter).date >= date) hi = mid;
    else lo = mid;
  }
  return hi;
}

// Day bounds depend only on the date and zone; every venue on the map shares them.
const boundsCache = new Map();
const BOUNDS_CACHE_LIMIT = 64;
export function venueDayBounds(date, timeZone = DEFAULT_TIME_ZONE) {
  const localDate = calendarDate(date, timeZone), key = `${timeZone}|${localDate}`;
  let bounds = boundsCache.get(key);
  if (!bounds) {
    bounds = computeDayBounds(localDate, timeZone);
    boundsCache.set(key, bounds);
    if (boundsCache.size > BOUNDS_CACHE_LIMIT) boundsCache.delete(boundsCache.keys().next().value);
  }
  return { date: bounds.date, start: new Date(bounds.start), end: new Date(bounds.end) };
}

function computeDayBounds(localDate, timeZone) {
  const formatter = dateFormatter(timeZone);
  const nextDate = new Date(Date.parse(`${localDate}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
  const start = localBoundary(localDate, formatter), end = localBoundary(nextDate, formatter);
  if (end <= start || localParts(start, formatter).date !== localDate) throw new RangeError('This date does not exist in the venue timezone.');
  return { date: localDate, start, end };
}

function geometry(options) {
  const { lat, lng, facing, obstructions = [], overhang = null, fovDeg = 180, minAltitude = 0 } = options;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)
    throw new RangeError('Invalid venue coordinates.');
  const bearing = parseFacing(facing);
  // Explicit null preserves the legacy open-rooftop case. Invalid strings are errors.
  if (bearing === null && facing !== null) throw new RangeError('Invalid balcony facing.');
  if (!Number.isFinite(fovDeg) || fovDeg <= 0 || fovDeg > 360 || !Number.isFinite(minAltitude) || minAltitude < 0 || minAltitude > 90)
    throw new RangeError('Invalid field of view or minimum altitude.');
  if (!Array.isArray(obstructions)) throw new RangeError('Obstructions must be an array.');
  const horizon = obstructions.map(o => {
    if (!o || ![o.start, o.end, o.minAltitude].every(Number.isFinite) || o.start < 0 || o.start > 360 ||
      o.end < 0 || o.end > 360 || o.minAltitude < 0 || o.minAltitude > 90)
      throw new RangeError('Each obstruction needs start/end bearings (0–360°) and minAltitude (0–90°).');
    const all = Math.abs(o.end - o.start) === 360;
    if (!all && normalise(o.start) === normalise(o.end)) throw new RangeError('Use distinct obstruction bearings, or 0–360° for a full circle.');
    return { start: normalise(o.start), end: normalise(o.end), minAltitude: o.minAltitude, all };
  });
  if (overhang && (!Number.isFinite(overhang.depth) || overhang.depth <= 0 || !Number.isFinite(overhang.height) || overhang.height <= 0))
    throw new RangeError('Overhang depth and floor-to-roof height must both be positive.');
  let roof = null;
  if (overhang) {
    // The balcony floor is as deep as its roof unless the room says otherwise.
    const balconyDepth = overhang.balconyDepth ?? overhang.depth;
    if (!Number.isFinite(balconyDepth) || balconyDepth <= 0) throw new RangeError('Balcony depth must be positive.');
    const minLitShare = overhang.minLitShare ?? Math.min(1, DEFAULT_MIN_LIT_DEPTH / balconyDepth);
    if (!Number.isFinite(minLitShare) || minLitShare <= 0 || minLitShare > 1) throw new RangeError('Minimum lit share must be above 0 and at most 1.');
    roof = { depth: overhang.depth, height: overhang.height, balconyDepth, minLitShare };
  }
  return { lat, lng, facing: bearing, horizon, overhang: roof, halfFov: Math.min(90, fovDeg / 2), minAltitude };
}

/**
 * A roofed balcony counts as in the sun while a strip at least this deep, in
 * metres from the railing, is lit: room for a chair. A shallower balcony needs
 * its whole floor lit. A fixed share would call a deep balcony shaded while
 * its railing side sat in full sun.
 */
export const DEFAULT_MIN_LIT_DEPTH = 0.6;

// Share of the balcony floor, wall to edge, that the roof leaves in the sun.
// The roof's shadow reaches `depth − height ÷ tan(profile)` out from the wall,
// so low sun lights the whole floor and high sun only the outer edge.
function roofLitShare(tanProfile, roof) {
  const shadow = roof.depth - roof.height / tanProfile;
  if (shadow <= 0) return 1;
  return Math.max(0, (roof.balconyDepth - shadow) / roof.balconyDepth);
}

// 0 when the sun is down, behind the building or blocked; otherwise the lit
// share of the balcony floor (always 1 without a roof).
function litShareAt(position, room) {
  const altitude = position.altitude / RAD, bearing = normalise(position.azimuth / RAD + 180);
  let minimum = room.minAltitude;
  for (const o of room.horizon) {
    const inRange = o.all || (o.start <= o.end ? bearing >= o.start && bearing <= o.end : bearing >= o.start || bearing <= o.end);
    if (inRange) minimum = Math.max(minimum, o.minAltitude);
  }
  if (!(altitude > minimum)) return 0;
  const difference = room.facing === null ? 0 : angularDifference(bearing, room.facing);
  if (room.facing !== null && !(difference < room.halfFov)) return 0;
  if (!room.overhang) return 1;
  return roofLitShare(Math.tan(position.altitude) / Math.cos(difference * RAD), room.overhang);
}

function directPosition(position, room) {
  const share = litShareAt(position, room);
  return share > 0 && share >= (room.overhang ? room.overhang.minLitShare : 1);
}

export function isDirectSun(instant, options) {
  const room = geometry(options), date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date.');
  return directPosition(SunCalc.getPosition(date, room.lat, room.lng), room);
}

/**
 * Share of the balcony floor in direct sun at an instant, 0 to 1. Without an
 * `overhang` it is 1 whenever the sun reaches the side. With one
 * (`{ depth, height, balconyDepth?, minLitShare? }`, metres) the roof shades
 * the floor from the wall outwards as the sun climbs.
 */
export function balconyLitShare(instant, options) {
  const room = geometry(options), date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date.');
  return litShareAt(SunCalc.getPosition(date, room.lat, room.lng), room);
}

function refine(lo, hi, previousState, predicate) {
  while (hi - lo > 500) {
    const mid = (lo + hi) / 2;
    if (predicate(mid) === previousState) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function sampleWindows(start, end, predicate) {
  const windows = [];
  let previous = start, state = predicate(start), opened = state ? start : null;
  while (previous < end) {
    const t = Math.min(previous + 5 * MINUTE, end), sample = t === end ? end - 1 : t;
    const next = predicate(sample);
    if (next !== state) {
      const edge = refine(previous, sample, state, predicate);
      if (next) opened = edge;
      else windows.push([opened, edge]);
      state = next;
    }
    previous = t;
  }
  if (state) windows.push([opened, end]);
  return windows;
}

const minutesIn = windows => windows.reduce((sum, [start, end]) => sum + (end - start) / MINUTE, 0);
const dateWindows = windows => windows.map(([start, end]) => ({ start: new Date(start), end: new Date(end) }));

function solarEvents(room, start, end) {
  const events = {};
  for (let offset = -2; offset <= 2; offset++) {
    const times = SunCalc.getTimes(new Date((start + end) / 2 + offset * DAY), room.lat, room.lng);
    for (const key of ['sunrise', 'sunset', 'goldenHourEnd', 'goldenHour']) {
      const instant = times[key]?.getTime();
      if (Number.isFinite(instant) && instant >= start && instant < end && !events[key]) events[key] = new Date(instant);
    }
  }
  return events;
}

/** Cached astronomical exposure; no weather, browser-local clock or input mutation.
 * date: venue-local YYYY-MM-DD or an absolute Date/instant. Detected edges are
 * refined below one second; formatSunTime displays the nearest minute. Five-minute
 * sampling can miss shorter sun/shade intervals occurring between samples.
 * With an `overhang`, a moment counts while a strip at least 0.6 m deep at the
 * railing is lit (or `minLitShare` of the floor, when given); `fullSunMinutes`
 * and `partSunMinutes` split the total into sun to the back wall and sun on
 * the front only. `minLitShare: 1` is the older rule: sun only while it
 * reaches the wall.
 */
export function calculateBalconySunDay(options) {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE, room = geometry(options);
  const date = calendarDate(options.date, timeZone);
  const key = cacheKey('day', room, timeZone, date), cached = cachedResult(key);
  if (cached) return cached;
  const bounds = venueDayBounds(date, timeZone);
  const start = bounds.start.getTime(), end = bounds.end.getTime(), formatter = dateFormatter(timeZone);
  const windows = sampleWindows(start, end, t => directPosition(SunCalc.getPosition(new Date(t), room.lat, room.lng), room));
  // With a balcony roof: how long the sun reaches right back to the wall, and
  // how long the roof shades the back of the floor while the front stays lit.
  const fullMinutes = room.overhang
    ? Math.round(minutesIn(sampleWindows(start, end, t => litShareAt(SunCalc.getPosition(new Date(t), room.lat, room.lng), room) >= 1)))
    : null;
  const events = solarEvents(room, start, end);
  // On a day with no clock change, local minutes are simply minutes since the
  // day began; only daylight-saving changeover days need the formatter.
  const steadyDay = end - start === DAY;
  const localMinutes = steadyDay
    ? t => Math.floor((t - start) / MINUTE)
    : t => { const local = localParts(t, formatter); return local.hour * 60 + local.minute; };
  const coffee = windows.flatMap(([a, b]) => sampleWindows(a, b, t => {
    const minutes = localMinutes(t);
    return minutes >= 360 && minutes < 600;
  }));
  const sunset = events.sunset?.getTime();
  const drinks = sunset === undefined ? [] : windows.map(([a, b]) => [Math.max(a, sunset - 90 * MINUTE), Math.min(b, sunset)]).filter(([a, b]) => b > a);
  const golden = (a, b) => a && b && a < b ? { start: a, end: b } : null;
  return rememberResult(key, {
    date: bounds.date, timeZone, dayStart: bounds.start, dayEnd: bounds.end,
    windows: dateWindows(windows), totalMinutes: Math.round(minutesIn(windows)),
    fullSunMinutes: fullMinutes === null ? Math.round(minutesIn(windows)) : Math.min(fullMinutes, Math.round(minutesIn(windows))),
    partSunMinutes: fullMinutes === null ? 0 : Math.max(0, Math.round(minutesIn(windows)) - fullMinutes),
    morningCoffee: { available: coffee.length > 0, windows: dateWindows(coffee) },
    sunsetDrinks: { available: sunset === undefined ? null : drinks.length > 0, windows: dateWindows(drinks) },
    sunrise: events.sunrise ?? null, sunset: events.sunset ?? null,
    // SunCalc definitions: sunrise (-0.833°) to 6°, and 6° to sunset.
    goldenHours: { morning: golden(events.sunrise, events.goldenHourEnd), evening: golden(events.goldenHour, events.sunset) },
  });
}

export function calculateMonthlySunSummary(options) {
  if (!Number.isInteger(options.year) || options.year < 1900 || options.year > 2100) throw new RangeError('Year must be an integer between 1900 and 2100.');
  const key = cacheKey('year', geometry(options), options.timeZone ?? DEFAULT_TIME_ZONE, options.year);
  const cached = cachedResult(key);
  if (cached) return cached;
  return rememberResult(key, Array.from({ length: 12 }, (_, index) => {
    const date = `${options.year}-${String(index + 1).padStart(2, '0')}-15`;
    const result = calculateBalconySunDay({ ...options, date });
    return { month: index + 1, date, totalMinutes: result.totalMinutes,
      morningCoffee: result.morningCoffee.available, sunsetDrinks: result.sunsetDrinks.available };
  }));
}

export function formatSunTime(instant, timeZone = DEFAULT_TIME_ZONE) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' })
    .format(new Date(Math.round(new Date(instant).getTime() / MINUTE) * MINUTE));
}

export function formatSunWindows(windows, timeZone = DEFAULT_TIME_ZONE) {
  return windows.map(({ start, end }) => {
    const nextDay = venueLocalDate(start, timeZone) !== venueLocalDate(end, timeZone) ? ' (next day)' : '';
    return `${formatSunTime(start, timeZone)}–${formatSunTime(end, timeZone)}${nextDay}`;
  }).join('; ');
}

export function formatGuestDate(instant, timeZone = DEFAULT_TIME_ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

export function formatGuestTime(instant, timeZone = DEFAULT_TIME_ZONE, viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const rounded = new Date(Math.round(new Date(instant).getTime() / MINUTE) * MINUTE);
  const canonical = zone => new Intl.DateTimeFormat('en-GB', { timeZone: zone }).resolvedOptions().timeZone;
  const differentZone = canonical(timeZone) !== canonical(viewerTimeZone);
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).formatToParts(rounded);
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  let abbreviation = '';
  if (differentZone) {
    // Localised short names vary: AEST in en-AU, EEST in en-GB, EDT in en-US.
    for (const locale of ['en-AU', 'en-GB', 'en-US', 'en-IN', 'ja-JP']) {
      const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
        .formatToParts(rounded).find(part => part.type === 'timeZoneName').value;
      if (/^[A-Z]{2,6}$/.test(name) && !/^(GMT|UTC)[+-]/.test(name)) { abbreviation = name; break; }
    }
    // Some zones have no short name in Intl. Keep their real name rather than inventing an abbreviation or showing GMT offsets.
    if (!abbreviation) abbreviation = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'long' })
      .formatToParts(rounded).find(part => part.type === 'timeZoneName').value;
  }
  return `${p.hour}:${p.minute}${p.dayPeriod.toLowerCase()}${differentZone ? ` ${abbreviation}` : ''}`;
}

export function formatGuestWindows(windows, timeZone = DEFAULT_TIME_ZONE, viewerTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return windows.map(({ start, end }) => {
    const nextDay = venueLocalDate(start, timeZone) !== venueLocalDate(end, timeZone) ? ' (next day)' : '';
    const startLabel = formatGuestTime(start, timeZone, viewerTimeZone), endLabel = formatGuestTime(end, timeZone, viewerTimeZone);
    const startZone = startLabel.slice(startLabel.indexOf(' ')), endZone = endLabel.slice(endLabel.indexOf(' '));
    const compactStart = startLabel.includes(' ') && startZone === endZone ? startLabel.split(' ')[0] : startLabel;
    return `${compactStart}–${endLabel}${nextDay}`;
  }).join('; ');
}
