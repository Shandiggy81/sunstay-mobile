import { MELBOURNE_TZ } from './sunPosition.js';

/** Time-of-day slider scale: minutes past Melbourne midnight. */
export const TOD_DAY_START_MIN = 6 * 60;  // 6:00 AM
export const TOD_DAY_END_MIN = 20 * 60;   // 8:00 PM
export const TOD_SLIDER_STEP_MIN = 5;

function melbourneHoursMinutes(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MELBOURNE_TZ,
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute };
}

/**
 * Map a Date onto the TOD slider using Australia/Melbourne wall-clock time
 * (AEST/AEDT via the TZ), not the device's local hour and not UTC.
 * Clamps to [min, max] and snaps to `step` so the thumb sits on a tick.
 */
export function localTimeToSliderMinutes(date = new Date(), {
    min = TOD_DAY_START_MIN,
    max = TOD_DAY_END_MIN,
    step = TOD_SLIDER_STEP_MIN,
} = {}) {
    const safeDate = date instanceof Date && !Number.isNaN(date.getTime())
        ? date
        : new Date();
    const wall = melbourneHoursMinutes(safeDate);
    const raw = wall
        ? wall.hour * 60 + wall.minute
        : safeDate.getHours() * 60 + safeDate.getMinutes();
    const clamped = Math.min(max, Math.max(min, raw));
    if (!Number.isFinite(step) || step <= 1) return clamped;
    const snapped = Math.round(clamped / step) * step;
    return Math.min(max, Math.max(min, snapped));
}
