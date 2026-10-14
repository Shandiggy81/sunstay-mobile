import { calculateBalconySunDay, DEFAULT_TIME_ZONE, formatGuestWindows, venueLocalDate, facingLabel } from './balconySunEngine.js';
import { isStayVenue } from './propertyTypes.js';

export const SUN_MOMENTS = Object.freeze({ coffee: 'Morning coffee', sunset: 'Sunset drinks', most: 'Most sun' });
export function roomSunOptions(venue, room) {
  return { lat: Number(venue.lat), lng: Number(venue.lng), facing: room.orientation,
    timeZone: venue.timeZone ?? venue.timezone ?? DEFAULT_TIME_ZONE,
    obstructions: room.obstructions, overhang: room.overhang };
}
export function momentWindows(daily, moment) {
  return moment === 'coffee' ? daily.morningCoffee.windows : moment === 'sunset' ? daily.sunsetDrinks.windows : daily.windows;
}
const duration = window => (window.end - window.start) / 60000;
const compare = (a, b) => b.minutes - a.minutes || b.totalMinutes - a.totalMinutes || a.name.localeCompare(b.name);

/** Calendar strings are venue-local; absolute instants are resolved by the sun engine per venue. */
export function rankStays(venues, { moment = 'coffee', date = new Date() } = {}) {
  if (!Object.hasOwn(SUN_MOMENTS, moment)) throw new RangeError('Unknown sun moment');
  // Validate date even when no rooms exist. Geometry failures remain honest zero-sun results.
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    if (!Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new RangeError('Invalid calendar date');
  } else venueLocalDate(date);
  return venues.filter(isStayVenue).map(venue => {
    const rooms = (Array.isArray(venue.roomTypes) ? venue.roomTypes : []).flatMap(room => {
      if (!room || room.orientation == null || String(room.orientation).trim() === '' || venue.lat == null || venue.lng == null || venue.lat === '' || venue.lng === '') return [];
      try {
        const daily = calculateBalconySunDay({ ...roomSunOptions(venue, room), date });
        const windows = momentWindows(daily, moment);
        const longest = windows.reduce((best, window) => !best || duration(window) > duration(best) ? window : best, null);
        return [{ bestRoom: room, daily, minutes: moment === 'most' ? daily.totalMinutes : longest ? duration(longest) : 0,
          totalMinutes: daily.totalMinutes, name: room.name ?? '',
          windowsText: formatGuestWindows(moment === 'most' ? windows : longest ? [longest] : [], daily.timeZone, daily.timeZone) }];
      } catch { return []; }
    }).sort(compare);
    const best = rooms[0];
    return { ...venue, bestRoom: best?.minutes > 0 ? best.bestRoom : null, minutes: best?.minutes ?? 0,
      totalMinutes: best?.totalMinutes ?? 0, daily: best?.minutes > 0 ? best.daily : null,
      windowsText: best?.minutes > 0 ? best.windowsText : '' };
  }).sort(compareStayRank);
}

/** Add calendar days, never 24 hours to an instant (DST days can have 23 hours). */
export function quickStayDate(option, now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const today = venueLocalDate(now, timeZone);
  const calendar = new Date(`${today}T12:00:00Z`);
  const offset = option === 'tomorrow' ? 1 : option === 'saturday' ? (6 - calendar.getUTCDay() + 7) % 7 : 0;
  calendar.setUTCDate(calendar.getUTCDate() + offset);
  return calendar.toISOString().slice(0, 10);
}
export function stayMomentBadge(venue, moment) {
  const label = moment === 'sunset' ? 'Sunset' : moment === 'coffee' ? 'Morning' : 'Sun';
  if (!venue.bestRoom) return `No ${moment === 'sunset' ? 'sunset' : moment === 'coffee' ? 'morning' : 'direct'} sun this day`;
  const room = venue.bestRoom;
  return `${moment === 'sunset' ? '🥂' : moment === 'coffee' ? '☕' : '☀️'} ${label} ${venue.windowsText} · ${({ W: 'West', E: 'East', N: 'North', S: 'South' })[facingLabel(room.orientation)] ?? facingLabel(room.orientation)}-facing, Level ${room.floorLevel ?? room.floorHeight ?? 'unknown'}${room.source === 'estimated' ? ' · Estimated' : ''}`;
}

export function compareStayRank(a, b) { return compare({ ...a, name: a.venueName ?? '' }, { ...b, name: b.venueName ?? '' }); }
