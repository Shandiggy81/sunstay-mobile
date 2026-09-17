/** Time-of-day slider scale: minutes past local midnight. */
export const TOD_DAY_START_MIN = 6 * 60;  // 6:00 AM
export const TOD_DAY_END_MIN = 20 * 60;   // 8:00 PM
export const TOD_SLIDER_STEP_MIN = 5;

/**
 * Map a Date's local wall-clock time onto the TOD slider scale.
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
    const raw = safeDate.getHours() * 60 + safeDate.getMinutes();
    const clamped = Math.min(max, Math.max(min, raw));
    if (!Number.isFinite(step) || step <= 1) return clamped;
    const snapped = Math.round(clamped / step) * step;
    return Math.min(max, Math.max(min, snapped));
}
