import { finiteOrNull } from './finiteOrNull.js';
import { DEFAULT_TIME_ZONE, formatGuestWindows } from './balconySunEngine.js';

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const NOISE_STEPS = Object.freeze(['Quiet', 'Conversational', 'Busy', 'Loud']);

export function compassPoint(degrees) {
    const value = finiteOrNull(degrees);
    return value === null ? null : COMPASS_POINTS[Math.round(((value % 360 + 360) % 360) / 22.5) % 16];
}

export function noiseStepIndex(label) {
    const index = NOISE_STEPS.indexOf(label);
    return index === -1 ? null : index;
}

export function formatNoiseSource(source) {
    const value = typeof source === 'string' ? source.trim() : '';
    return value ? value[0].toUpperCase() + value.slice(1) : '';
}

/** Share an am/pm suffix within a window, preserving timezone/day annotations. */
export function formatCompactGuestWindows(windows, timeZone, viewerTimeZone) {
    return formatGuestWindows(windows, timeZone, viewerTimeZone)
        .replace(/(\d{1,2}:\d{2})(am|pm)–(\d{1,2}:\d{2})\2/g, '$1–$3$2');
}

const timestamp = value => value == null ? NaN : new Date(value).getTime();
const percentage = (value, start, end) => 100 * (value - start) / (end - start);

/** Project instants onto the actual venue day, including 23/25-hour DST days. */
export function timelineSegments(windows, dayStart, dayEnd) {
    const start = timestamp(dayStart), end = timestamp(dayEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return (windows ?? []).flatMap(window => {
        const left = Math.max(start, timestamp(window.start)), right = Math.min(end, timestamp(window.end));
        return Number.isFinite(left) && Number.isFinite(right) && right > left
            ? [{ left: percentage(left, start, end), width: 100 * (right - left) / (end - start) }] : [];
    });
}

export function timelineMarker(instant, dayStart, dayEnd) {
    const now = timestamp(instant), start = timestamp(dayStart), end = timestamp(dayEnd);
    return Number.isFinite(now) && Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end ? percentage(now, start, end) : null;
}

/** Clock labels use the venue timezone; equal quarters would mislabel DST days. */
export function timelineTicks(dayStart, dayEnd, timeZone = DEFAULT_TIME_ZONE) {
    const start = timestamp(dayStart), end = timestamp(dayEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const minutes = instant => {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
        return Number(parts.hour) * 60 + Number(parts.minute);
    };
    const ticks = [6, 12, 18].map(hour => {
        let low = start, high = end - 1;
        while (high - low > 1000) {
            const mid = Math.floor((low + high) / 2);
            if (minutes(mid) < hour * 60) low = mid; else high = mid;
        }
        return { label: hour === 6 ? '6am' : hour === 12 ? '12pm' : '6pm', left: percentage(high, start, end) };
    });
    return [{ label: '12am', left: 0 }, ...ticks, { label: '12am', left: 100 }];
}
