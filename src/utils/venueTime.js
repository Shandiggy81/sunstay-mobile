import { DEFAULT_TIME_ZONE, venueDayBounds } from './balconySunEngine.js';

// The viewer's clock is never a venue clock. Cache Intl formatters because
// these helpers also run for every visible venue in the list.
const formatters = new Map();
export function venueTimeParts(instant, timeZone = DEFAULT_TIME_ZONE) {
    let formatter = formatters.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
        });
        formatters.set(timeZone, formatter);
    }
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}

export function venueHour(instant, timeZone = DEFAULT_TIME_ZONE) {
    const p = venueTimeParts(instant, timeZone);
    return p.hour + p.minute / 60;
}

export function venueUtcOffsetSeconds(instant, timeZone = DEFAULT_TIME_ZONE) {
    const p = venueTimeParts(instant, timeZone);
    const [y, m, d] = p.date.split('-').map(Number);
    return (Date.UTC(y, m - 1, d, p.hour, p.minute, p.second) - Math.floor(new Date(instant).getTime() / 1000) * 1000) / 1000;
}

/** A venue-local calendar date + decimal hour, not elapsed hours from midnight.
 * Uses both offsets on a DST day. Repeated times choose the first occurrence;
 * nonexistent clock times are rejected instead of silently changing the hour.
 */
export function venueTimeAt(date, hour, timeZone = DEFAULT_TIME_ZONE) {
    if (!Number.isFinite(hour) || hour < 0 || hour >= 24) throw new RangeError('Invalid venue hour');
    const bounds = venueDayBounds(date, timeZone);
    const minutes = Math.round(hour * 60);
    if (bounds.end - bounds.start === 86400000) return new Date(bounds.start.getTime() + minutes * 60000);
    const nominal = Date.parse(`${bounds.date}T00:00:00Z`) + minutes * 60000;
    const offsets = new Set([venueUtcOffsetSeconds(bounds.start, timeZone), venueUtcOffsetSeconds(new Date(bounds.end - 1), timeZone)]);
    const candidates = [...offsets].map(offset => new Date(nominal - offset * 1000)).filter(instant => {
        const p = venueTimeParts(instant, timeZone);
        return p.date === bounds.date && p.hour * 60 + p.minute === minutes;
    }).sort((a, b) => a - b);
    if (!candidates.length) throw new RangeError('This time does not exist in the venue timezone');
    return candidates[0];
}

/** Provider wall-clock ISO strings have no browser timezone attached. */
export function parseVenueDateTime(value, timeZone = DEFAULT_TIME_ZONE) {
    if (typeof value !== 'string') return null;
    if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) {
        const instant = new Date(value);
        return Number.isFinite(instant.getTime()) ? instant : null;
    }
    const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!parts || Number(parts[3]) > 59 || Number(parts[4] ?? 0) > 59) return null;
    try {
        const instant = venueTimeAt(parts[1], Number(parts[2]) + Number(parts[3]) / 60, timeZone);
        return new Date(instant.getTime() + Number(parts[4] ?? 0) * 1000);
    } catch { return null; }
}
