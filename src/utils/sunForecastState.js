/**
 * One read of the sun forecast for a venue, shared by the "Sun right now"
 * card, the timeline headline and its bar, so they cannot disagree.
 *
 * Everything is in the forecast's wall-clock time (Australia/Melbourne for
 * weatherService), using the payload's own UTC offset. Open-Meteo hourly
 * `time` strings are timezone-naive wall clock, so an hour is read from the
 * string itself rather than through the device clock.
 *
 * An hour counts as direct sun only when the sun is up for it and the
 * forecast for that hour is neither rainy nor cloudy. Rain comes from the
 * hourly forecast, not the 15-minute `current.precipitation` reading, so it
 * holds steady for the hour instead of flickering with passing showers.
 */

import { SUNNY_CLEARNESS } from './skyClearness.js';
import { venueHour, venueTimeParts, venueUtcOffsetSeconds } from './venueTime.js';

export const CLOUDY_PCT = 60;
export const RAIN_CHANCE_PCT = 50;
const RAIN_CODE_MIN_CHANCE_PCT = 30;
const RAIN_MM = 0.5;

// Rain, freezing rain, showers and thunder. Drizzle (51–57) is left out: the
// hourly weather_code is the worst case for the hour, and drizzle codes come
// and go at single-digit rain chances, which is what made rain flicker on.
function isRainCode(code) {
  return (code >= 61 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

function isRainyHour({ rainChance, code, rainMm }) {
  const chance = rainChance ?? 0;
  if (chance >= RAIN_CHANCE_PCT) return true;
  if ((rainMm ?? 0) >= RAIN_MM) return true;
  return code != null && isRainCode(code) && (rainChance == null || chance >= RAIN_CODE_MIN_CHANCE_PCT);
}

// Sunlight reaching the ground (sky_clearness, see skyClearness.js) decides
// when it is known: thin high cloud pushes cloud_cover past 60% while the sun
// still shines. Cloud cover is the fallback near sunrise and sunset.
function isCloudyHour({ cloud, clearness }) {
  if (clearness != null) return clearness < SUNNY_CLEARNESS;
  return (cloud ?? 0) >= CLOUDY_PCT;
}

function finite(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function wallClock(date, offsetSeconds) {
  const shifted = new Date(date.getTime() + offsetSeconds * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return {
    dayKey: `${y}-${m}-${d}`,
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
  };
}

/** A Date as a decimal wall-clock hour at the given offset; numbers pass through. */
export function toWallHour(value, offsetSeconds) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return wallClock(value, offsetSeconds).hour;
  return finite(value);
}

export function formatHour(decimal) {
  if (!Number.isFinite(decimal)) return '';
  let h = Math.floor(decimal);
  let m = Math.round((decimal - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  const period = h % 24 < 12 ? 'am' : 'pm';
  const dh = h % 12 === 0 ? 12 : h % 12;
  return m > 0 ? `${dh}:${String(m).padStart(2, '0')}${period}` : `${dh}${period}`;
}

export function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function minutesOfSun(hours, from, to) {
  let total = 0;
  for (const slot of hours) {
    if (slot.kind !== 'sun') continue;
    const start = Math.max(slot.hour, from);
    const end = Math.min(slot.hour + 1, to);
    if (end > start) total += (end - start) * 60;
  }
  return Math.round(total);
}

/**
 * @param {object} input
 * @param {object|null} input.hourly Open-Meteo hourly block: time[] plus
 *   cloud_cover/cloudcover[], precipitation_probability[], weather_code[],
 *   precipitation[] (any may be missing).
 * @param {number} [input.utcOffsetSeconds] Forecast offset; defaults to
 *   hourly._tzOffsetSeconds, then Melbourne's offset on this date.
 * @param {string} [input.timeZone] Explicit venue zone; converts instants with
 *   the offset at each instant, including a daylight-saving changeover.
 * @param {Date} [input.now]
 * @param {Date|number} input.sunrise Sunrise instant, or a wall-clock decimal hour.
 * @param {Date|number} input.sunset Sunset instant, or a wall-clock decimal hour.
 * @param {boolean} [input.shaded] The venue's surroundings block the sun now.
 * @param {{ cloudCover?: number, isRaining?: boolean }} [input.current]
 *   Used only when there is no hourly data for this hour.
 */
export function deriveSunForecast({
  hourly = null,
  utcOffsetSeconds,
  timeZone,
  now = new Date(),
  sunrise,
  sunset,
  shaded = false,
  current = {},
} = {}) {
  const offset = finite(utcOffsetSeconds)
    ?? finite(hourly?._tzOffsetSeconds)
    ?? venueUtcOffsetSeconds(now, timeZone);
  const local = timeZone ? venueTimeParts(now, timeZone) : null;
  const { dayKey, hour: nowHour } = local
    ? { dayKey: local.date, hour: local.hour + local.minute / 60 }
    : wallClock(now, offset);
  const sunHour = value => timeZone && value instanceof Date && Number.isFinite(value.getTime())
    ? venueHour(value, timeZone) : toWallHour(value, offset);
  const sunriseHour = sunHour(sunrise);
  const sunsetHour = sunHour(sunset);
  const hasDaylight = sunriseHour != null && sunsetHour != null && sunriseHour < sunsetHour;

  // Today's forecast, keyed by wall-clock hour.
  const byHour = new Map();
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const cloudSeries = hourly?.cloud_cover ?? hourly?.cloudcover;
  times.forEach((iso, i) => {
    if (typeof iso !== 'string' || !iso.startsWith(dayKey)) return;
    const hour = Number(iso.slice(11, 13));
    if (!Number.isInteger(hour)) return;
    byHour.set(hour, {
      cloud: finite(cloudSeries?.[i]),
      rainChance: finite(hourly.precipitation_probability?.[i]),
      code: finite(hourly.weather_code?.[i] ?? hourly.weathercode?.[i]),
      rainMm: finite(hourly.precipitation?.[i]),
      clearness: finite(hourly.sky_clearness?.[i]),
    });
  });
  const hasHourly = byHour.size > 0;

  const hours = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const f = byHour.get(hour) ?? {};
    const daylight = hasDaylight && hour + 1 > sunriseHour && hour < sunsetHour;
    let kind = 'night';
    if (daylight) {
      if (!byHour.has(hour)) kind = 'day';
      else if (isRainyHour(f)) kind = 'rain';
      else if (isCloudyHour(f)) kind = 'cloud';
      else kind = 'sun';
    }
    hours.push({ hour, kind, cloud: f.cloud ?? null, rainChance: f.rainChance ?? null });
  }

  const isSunUp = hasDaylight && nowHour >= sunriseHour && nowHour < sunsetHour;
  const slotNow = hours[Math.min(23, Math.floor(nowHour))];
  let nowKind;
  if (!isSunUp) nowKind = 'night';
  else if (shaded) nowKind = 'shaded';
  else if (slotNow.kind !== 'day') nowKind = slotNow.kind;
  else if (current?.isRaining) nowKind = 'rain';
  else if (finite(current?.clearness) != null) nowKind = current.clearness < SUNNY_CLEARNESS ? 'cloud' : 'sun';
  else if ((finite(current?.cloudCover) ?? 0) > 75) nowKind = 'cloud';
  else nowKind = 'unknown';

  const dayEnd = hasDaylight ? sunsetHour : 0;
  const sunMinutesToday = hasHourly && hasDaylight ? minutesOfSun(hours, sunriseHour, sunsetHour) : null;
  const sunMinutesLeft = hasHourly && hasDaylight
    ? minutesOfSun(hours, Math.max(nowHour, sunriseHour), sunsetHour)
    : null;

  // End of the sunny run we're in, and the start of the next one.
  let sunUntil = null;
  if (nowKind === 'sun') {
    let h = Math.floor(nowHour);
    while (h + 1 < 24 && hours[h + 1].kind === 'sun') h += 1;
    sunUntil = Math.min(h + 1, dayEnd);
  }
  let nextSunHour = null;
  if (nowKind !== 'sun' && hasDaylight) {
    for (let h = Math.floor(Math.max(nowHour, sunriseHour)) + 1; h < 24; h += 1) {
      if (hours[h].kind === 'sun') { nextSunHour = Math.max(h, sunriseHour); break; }
    }
  }

  return {
    utcOffsetSeconds: offset,
    hasHourly,
    nowHour,
    sunriseHour,
    sunsetHour,
    isSunUp,
    hours,
    now: { kind: nowKind, cloud: slotNow.cloud, rainChance: slotNow.rainChance },
    sunMinutesToday,
    sunMinutesLeft,
    sunUntil,
    nextSunHour,
    headline: buildHeadline({ nowKind, nowHour, sunriseHour, sunsetHour, hasDaylight, hasHourly, sunMinutesLeft, nextSunHour }),
  };
}

function buildHeadline({ nowKind, nowHour, sunriseHour, sunsetHour, hasDaylight, hasHourly, sunMinutesLeft, nextSunHour }) {
  if (!hasDaylight) return { text: 'Sun times unavailable', emoji: '🌤️', tone: 'muted' };
  if (nowHour >= sunsetHour) return { text: 'Sun has set for the day', emoji: '🌙', tone: 'night' };
  if (nowHour < sunriseHour) return { text: `Sun's up at ${formatHour(sunriseHour)}`, emoji: '🌅', tone: 'muted' };

  if (!hasHourly) {
    return { text: `${formatDuration((sunsetHour - nowHour) * 60)} of daylight left`, emoji: '🌤️', tone: 'muted' };
  }

  const left = sunMinutesLeft ?? 0;
  if (nowKind === 'sun') {
    return { text: `${formatDuration(left)} of direct sun left today`, emoji: '☀️', tone: 'sun' };
  }
  // When the venue is shaded the forecast can't say when the buildings stop
  // blocking the sun, so don't promise a time.
  const later = nowKind !== 'shaded' && nextSunHour != null && left > 0
    ? ` · sun from ${formatHour(nextSunHour)}`
    : '';
  if (nowKind === 'rain') {
    return { text: left > 0 ? `Rain now${later}` : 'Rain about · no direct sun left today', emoji: '🌧️', tone: 'muted' };
  }
  if (left > 0) {
    return { text: `${formatDuration(left)} of direct sun left today${later}`, emoji: '🌤️', tone: 'muted' };
  }
  return { text: 'No direct sun left today', emoji: '☁️', tone: 'muted' };
}

/**
 * The venue card's hero chips from the same forecast as the Sun Forecast tab:
 * today's direct-sun hours (the tab badge's number) and the longest stretch
 * of direct sun as "7am – 11am". Null when there is no hourly forecast, so the
 * caller keeps its geometry-only fallback.
 */
export function heroSunChip(forecast) {
  if (!forecast?.hasHourly || forecast.sunMinutesToday == null) return null;

  let best = null;
  let start = null;
  for (let h = 0; h <= 24; h += 1) {
    const sunny = h < 24 && forecast.hours[h]?.kind === 'sun';
    if (sunny && start == null) start = h;
    if (!sunny && start != null) {
      if (!best || h - start > best[1] - best[0]) best = [start, h];
      start = null;
    }
  }

  let window = null;
  if (best) {
    const from = Math.max(best[0], forecast.sunriseHour);
    const to = Math.min(best[1], forecast.sunsetHour);
    if (to > from) window = `${formatHour(from)} – ${formatHour(to)}`;
  }
  return { hours: forecast.sunMinutesToday / 60, window };
}
