import { DEFAULT_TIME_ZONE, formatGuestDate, venueDayBounds } from './balconySunEngine.js';
import { venueTimeAt, venueTimeParts, venueUtcOffsetSeconds } from './venueTime.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WIDTH = 360;
const BASELINE = 104;
const BOTTOM = 116;
const ZONED_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/i;

// A date-only or unzoned wall clock is not an unambiguous window endpoint.
function instant(value) {
  if (value instanceof Date || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value !== 'string') return null;
  const match = ZONED_ISO.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days[Number(month) - 1]
    || Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return null;
  if (zone.toUpperCase() !== 'Z') {
    const [h, m] = zone.slice(1).split(':').map(Number);
    if (h > 23 || m > 59) return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function duration(milliseconds, spoken = false) {
  const hours = Math.floor(milliseconds / HOUR);
  const minutes = Math.floor((milliseconds % HOUR) / MINUTE);
  const seconds = (milliseconds % MINUTE) / 1000;
  const parts = [[hours, 'hour', 'h'], [minutes, 'minute', 'm'], [seconds, 'second', 's']]
    .filter(([amount]) => amount > 0)
    .map(([amount, unit, short]) => spoken ? `${amount} ${unit}${amount === 1 ? '' : 's'}` : `${amount}${short}`);
  return parts.join(' ') || (spoken ? '0 minutes' : '0m');
}

function offsetLabel(offset) {
  const sign = offset < 0 ? '−' : '+';
  const absolute = Math.abs(offset);
  const h = Math.floor(absolute / 3600);
  const m = Math.floor((absolute % 3600) / 60);
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

function clockFormatter(timezone) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  });
}

function clockLabel(ms, formatter, compact, offset = null) {
  const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  const fraction = ((ms % 1000) + 1000) % 1000;
  const seconds = Number(p.second);
  const showSeconds = seconds > 0 || fraction > 0;
  const secondLabel = showSeconds ? `:${p.second}${fraction ? `.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : ''}` : '';
  const minuteLabel = compact && p.minute === '00' && !showSeconds ? '' : `:${p.minute}`;
  return `${p.hour}${minuteLabel}${secondLabel}${p.dayPeriod.toLowerCase()}${offset === null ? '' : ` (${offsetLabel(offset)})`}`;
}

function wholeHours(bounds, timezone, offsets) {
  const nominal = Date.parse(`${bounds.date}T00:00:00Z`);
  const values = new Set([+bounds.start, +bounds.end]);
  for (let hour = 0; hour < 24; hour++) {
    for (const offset of offsets) {
      const ms = nominal + hour * HOUR - offset * 1000;
      if (ms < +bounds.start || ms >= +bounds.end) continue;
      const p = venueTimeParts(ms, timezone);
      if (p.date === bounds.date && p.hour === hour && p.minute === 0 && p.second === 0) values.add(ms);
    }
  }
  return [...values].sort((a, b) => a - b);
}

function merge(windows) {
  const merged = [];
  for (const window of windows.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}

const coordinate = number => Number(number.toFixed(6));
function hillPath(start, end, height) {
  const mid = (start + end) / 2;
  const shoulder = (end - start) * 0.2;
  const n = coordinate;
  return `M ${n(start)} ${BASELINE} C ${n(start + shoulder)} ${BASELINE} ${n(mid - shoulder)} ${n(BASELINE - height)} ${n(mid)} ${n(BASELINE - height)} C ${n(mid + shoulder)} ${n(BASELINE - height)} ${n(end - shoulder)} ${BASELINE} ${n(end)} ${BASELINE} L ${n(end)} ${BOTTOM} L ${n(start)} ${BOTTOM} Z`;
}

/**
 * Layout only: supplied engine windows are never recalculated or weather-adjusted.
 * Endpoints and returned times are instants (epoch ms); `date` is a venue date or
 * a zoned instant/Date. Totals cover exactly the windows displayed after clipping.
 * Millisecond durations retain seconds instead of independently rounding minutes.
 */
export function layoutSunWindows({ windows = [], date, timezone = DEFAULT_TIME_ZONE, now, axisStart, axisEnd } = {}) {
  if (!Array.isArray(windows)) throw new RangeError('Sun windows must be an array.');
  if (typeof timezone !== 'string' || !timezone) throw new RangeError('Invalid venue timezone.');
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : instant(date);
  if (day === null || day === undefined) throw new RangeError('Invalid venue date.');
  const bounds = venueDayBounds(day, timezone);
  const startOfDay = +bounds.start;
  const endOfDay = +bounds.end;
  const offsets = new Set([startOfDay, Math.floor((startOfDay + endOfDay) / 2), endOfDay - 1]
    .map(ms => venueUtcOffsetSeconds(ms, timezone)));
  const hours = wholeHours(bounds, timezone, offsets);
  const formatter = clockFormatter(timezone);
  const ambiguous = ms => {
    const offset = venueUtcOffsetSeconds(ms, timezone);
    const p = venueTimeParts(ms, timezone);
    return [...offsets].some(other => {
      if (other === offset) return false;
      const q = venueTimeParts(ms + (offset - other) * 1000, timezone);
      return p.date === q.date && p.hour === q.hour && p.minute === q.minute && p.second === q.second;
    });
  };
  let invalidWindowCount = 0;
  const normalised = [];
  for (const window of windows) {
    const start = instant(window?.start);
    const end = instant(window?.end);
    if (start === null || end === null) { invalidWindowCount++; continue; }
    if (end <= start) continue;
    const clippedStart = Math.max(startOfDay, start);
    const clippedEnd = Math.min(endOfDay, end);
    if (clippedEnd > clippedStart) normalised.push({ start: clippedStart, end: clippedEnd });
  }
  const dailyWindows = merge(normalised);
  const first = dailyWindows[0];
  const last = dailyWindows.at(-1);
  const paddedStart = first ? Math.max(startOfDay, first.start - 45 * MINUTE) : +venueTimeAt(bounds.date, 6, timezone);
  const paddedEnd = last ? Math.min(endOfDay, last.end + 45 * MINUTE) : +venueTimeAt(bounds.date, 18, timezone);
  const defaultStart = hours.filter(ms => ms <= paddedStart).at(-1) ?? startOfDay;
  const defaultEnd = hours.find(ms => ms >= paddedEnd) ?? endOfDay;
  const suppliedStart = axisStart === undefined ? defaultStart : instant(axisStart);
  const suppliedEnd = axisEnd === undefined ? defaultEnd : instant(axisEnd);
  if (suppliedStart === null || suppliedEnd === null) throw new RangeError('Invalid sun graph axis timestamp.');
  const start = Math.max(startOfDay, suppliedStart);
  const end = Math.min(endOfDay, suppliedEnd);
  if (end <= start) throw new RangeError('The sun graph axis must span part of the venue date.');
  const x = ms => (ms - start) / (end - start) * WIDTH;
  const clippedByAxis = dailyWindows.some(window => window.start < start || window.end > end);
  const displayed = dailyWindows.flatMap(window => {
    const clippedStart = Math.max(start, window.start);
    const clippedEnd = Math.min(end, window.end);
    return clippedEnd > clippedStart ? [{ start: clippedStart, end: clippedEnd }] : [];
  });
  const laidOut = displayed.map(window => {
    const milliseconds = window.end - window.start;
    const minutes = milliseconds / MINUTE;
    const xStart = x(window.start);
    const xEnd = x(window.end);
    const height = 32 + Math.min(1, Math.sqrt(minutes / 240)) * 32;
    const offsetStart = venueUtcOffsetSeconds(window.start, timezone);
    const offsetEnd = venueUtcOffsetSeconds(window.end, timezone);
    const showOffsets = offsetStart !== offsetEnd || ambiguous(window.start) || ambiguous(window.end);
    const startLabel = clockLabel(window.start, formatter, false, showOffsets ? offsetStart : null);
    const endLabel = clockLabel(window.end, formatter, false, showOffsets ? offsetEnd : null);
    return { ...window, minutes, startLabel, endLabel, rangeLabel: `${startLabel} – ${endLabel}`,
      durationLabel: duration(milliseconds), xStart, xEnd, height,
      sun: { x: x((window.start + window.end) / 2), y: BASELINE - height,
        radius: Math.min(9 + Math.min(1, minutes / 240) * 6, Math.max(3, (xEnd - xStart) * 0.35)) },
      path: hillPath(xStart, xEnd, height) };
  });
  const gaps = [];
  let cursor = 0;
  for (const window of laidOut) {
    if (window.xStart > cursor) gaps.push({ xStart: cursor, xEnd: window.xStart, path: hillPath(cursor, window.xStart, 8) });
    cursor = window.xEnd;
  }
  if (cursor < WIDTH) gaps.push({ xStart: cursor, xEnd: WIDTH, path: hillPath(cursor, WIDTH, 8) });

  const tickLabel = ms => clockLabel(ms, formatter, true, ambiguous(ms) ? venueUtcOffsetSeconds(ms, timezone) : null);
  const labelBounds = ms => {
    // The SVG anchors endpoints at the edge, while interior labels are centred.
    // Leave room for long fractional/offset labels at a conservative 12px font.
    const width = tickLabel(ms).length * 6.5;
    const position = x(ms);
    if (ms === start) return [position, position + width];
    if (ms === end) return [position - width, position];
    return [position - width / 2, position + width / 2];
  };
  const candidates = hours.filter(ms => ms > start && ms < end);
  const selected = new Set([start, end]);
  for (const fraction of [0.25, 0.5, 0.75]) {
    const target = start + (end - start) * fraction;
    const candidate = candidates.reduce((best, ms) => best === null || Math.abs(ms - target) < Math.abs(best - target) ? ms : best, null);
    if (candidate !== null && [...selected].every(other => {
      const a = labelBounds(candidate);
      const b = labelBounds(other);
      return Math.abs(x(candidate) - x(other)) >= 66 && (a[1] + 12 <= b[0] || b[1] + 12 <= a[0]);
    })) selected.add(candidate);
  }
  const ticks = [...selected].sort((a, b) => a - b).map(time => ({ time, x: x(time), label: tickLabel(time) }));
  const totalMilliseconds = laidOut.reduce((sum, window) => sum + window.end - window.start, 0);
  // Sum the returned minute values too, without any per-window display rounding.
  const totalMinutes = laidOut.reduce((sum, window) => sum + window.minutes, 0);
  const ranges = laidOut.map(window => `${window.startLabel} to ${window.endLabel}`);
  let accessibleSummary = ranges.length
    ? `Sun ${ranges.length < 3 ? ranges.join(' and ') : `${ranges.slice(0, -1).join(', ')} and ${ranges.at(-1)}`}, ${duration(totalMilliseconds, true)} total.`
    : invalidWindowCount ? 'Sun times unavailable for this date.'
      : clippedByAxis ? 'No direct sun in the shown hours' : 'No direct sun on this date';
  if (clippedByAxis && ranges.length) accessibleSummary += ' Shown hours only.';
  if (invalidWindowCount && ranges.length) accessibleSummary += ' Some invalid sun windows were omitted.';
  const nowMs = instant(now);
  const current = nowMs !== null && nowMs >= startOfDay && nowMs < endOfDay ? {
    time: nowMs, x: Math.max(0, Math.min(WIDTH, x(nowMs))),
    labelX: Math.max(22, Math.min(WIDTH - 22, x(nowMs))),
    withinAxis: nowMs >= start && nowMs <= end,
    inWindow: dailyWindows.some(window => nowMs >= window.start && nowMs < window.end),
  } : null;
  return { date: bounds.date, dateLabel: formatGuestDate(bounds.start, timezone), timezone,
    timezoneLabel: timezone === 'UTC' ? 'UTC' : `${timezone.split('/').at(-1).replaceAll('_', ' ')} time`,
    axis: { start, end }, ticks, windows: laidOut, gaps, totalMinutes, totalMilliseconds,
    totalLabel: duration(totalMilliseconds), windowCount: laidOut.length, accessibleSummary,
    now: current, invalidWindowCount, clippedByAxis };
}
