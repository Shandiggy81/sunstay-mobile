import {
  calculateBalconySunDay, calculateMonthlySunSummary, DEFAULT_TIME_ZONE,
  parseFacing, venueDayBounds,
} from './balconySunEngine.js';
import { formatSunDuration } from './formatSunDuration.js';
import { roomsBySunToday, sunMomentsFromDay, SUN_MOMENTS } from './sunMoments.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = [
  { key: 'summer', label: 'Summer', month: '01' },
  { key: 'winter', label: 'Winter', month: '07' },
];

// Number(null), Number('') and Number(false) would invent a location at 0°.
function coordinate(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return NaN;
  return Number(value);
}

function momentsFor(daily, timeZone) {
  return sunMomentsFromDay({ daily, timeZone }).moments.map(({ key, title, icon, available, windows }) => ({
    key, title, icon, available,
    minutes: windows.reduce((sum, { start, end }) => sum + (end - start) / 60000, 0),
  }));
}

function roomOptions(room, location) {
  // The engine deliberately supports facing:null for open rooftops. A hotel
  // room without a bearing is unknown, so must never take that shortcut.
  if (!room || parseFacing(room.orientation) === null) throw new RangeError('Room orientation is missing or invalid.');
  if (room.overhang != null && (typeof room.overhang !== 'object' || Array.isArray(room.overhang)))
    throw new RangeError('Room overhang geometry is invalid.');
  return { ...location, facing: room.orientation, obstructions: room.obstructions, overhang: room.overhang };
}

/**
 * Astronomical room-side exposure for a hotel, without weather or browser state.
 * `date` is a venue-local YYYY-MM-DD or an absolute Date/instant, as in the
 * balcony engine. Monthly samples use the 15th and share one report-wide scale.
 * A bad room stays in the report as unavailable, without hiding usable rooms.
 */
export function buildHotelSunReport(venue, { now = new Date(), date } = {}) {
  const timeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE;
  const requestedDate = date === undefined ? now : date;
  if (requestedDate == null || requestedDate === '') throw new RangeError('Invalid report date.');
  // Validate the date and timezone even if the venue has no rooms.
  const localDate = venueDayBounds(requestedDate, timeZone).date;
  const year = Number(localDate.slice(0, 4));
  if (year < 1900 || year > 2100) throw new RangeError('Report year must be between 1900 and 2100.');
  const location = { lat: coordinate(venue?.lat), lng: coordinate(venue?.lng), timeZone };
  const inputRooms = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  const records = inputRooms.map((room, index) => {
    const result = {
      id: room?.id ?? `room-side-${index + 1}`,
      name: typeof room?.name === 'string' && room.name.trim() ? room.name.trim() : `Room side ${index + 1}`,
      source: room?.source ?? null,
      floorLevel: room?.floorLevel ?? null,
      totalMinutes: null, durationText: 'Unavailable', monthly: [], sunniestMonths: [], seasons: [], error: null,
    };
    try {
      const options = roomOptions(room, location);
      const daily = calculateBalconySunDay({ ...options, date: localDate });
      return { index, room, result, options, daily, moments: momentsFor(daily, timeZone) };
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Room sun geometry is unavailable.';
      return { index, room, result };
    }
  });

  // Sort only validated rooms: roomsBySunToday's open-rooftop compatibility
  // would otherwise give a null-facing room a plausible, incorrect ranking.
  const validRecords = records.filter(({ daily }) => daily);
  const ordered = roomsBySunToday(validRecords.map(({ room, index }) => ({ ...room, reportIndex: index })),
    location, localDate).map(({ reportIndex }) => records[reportIndex]);
  ordered.push(...records.filter(({ daily }) => !daily));

  for (const record of ordered) {
    if (!record.daily) continue;
    const { result, options, daily } = record;
    const monthly = calculateMonthlySunSummary({ ...options, year });
    result.totalMinutes = daily.totalMinutes;
    result.durationText = formatSunDuration(daily.totalMinutes);
    result.monthly = monthly.map(({ month, date: sampleDate, totalMinutes }) => ({
      month, label: MONTHS[month - 1], date: sampleDate, totalMinutes,
      hours: Number((totalMinutes / 60).toFixed(1)), barPercent: 0,
    }));
    result.sunniestMonths = monthly.filter(({ totalMinutes }) => totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes || a.month - b.month).slice(0, 3)
      .sort((a, b) => a.month - b.month).map(({ month }) => MONTHS[month - 1]);
    result.seasons = SEASONS.map(({ key, label, month }) => {
      const seasonDate = `${year}-${month}-15`;
      return { key, label, date: seasonDate,
        moments: momentsFor(calculateBalconySunDay({ ...options, date: seasonDate }), timeZone) };
    });
  }

  const rooms = ordered.map(({ result }) => result);
  const maximum = Math.max(0, ...rooms.flatMap(({ monthly }) => monthly.map(({ totalMinutes }) => totalMinutes)));
  for (const room of rooms) {
    for (const month of room.monthly) month.barPercent = maximum > 0 ? month.totalMinutes / maximum * 100 : 0;
  }
  const summary = SUN_MOMENTS.map(({ key, title, icon }) => {
    let roomName = null, minutes = 0;
    for (const record of ordered) {
      if (!record.daily || record.daily.totalMinutes <= 0) continue;
      const moment = record.moments.find((item) => item.key === key);
      // Strictly greater preserves the display order for equal overlap.
      if (moment.available && moment.minutes > minutes) {
        roomName = record.result.name;
        minutes = moment.minutes;
      }
    }
    return { key, title, icon, roomName, minutes };
  });
  return { date: localDate, timeZone, year, rooms, summary };
}
