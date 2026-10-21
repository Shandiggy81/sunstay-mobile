import { venueLocalDate } from './balconySunEngine.js';
import {
    TOD_DAY_START_MIN, TOD_DAY_END_MIN, TOD_SLIDER_STEP_MIN,
    localTimeToSliderMinutes, melbourneMinutesNow,
} from './todMinutes.js';

const snap = minutes => Math.min(TOD_DAY_END_MIN, Math.max(TOD_DAY_START_MIN,
    Math.round(minutes / TOD_SLIDER_STEP_MIN) * TOD_SLIDER_STEP_MIN));

/** Today's shortcuts use the existing Melbourne minute scale, never a new date. */
export function mapTimePresets({ now = new Date(), weather = null } = {}) {
    const timestamp = weather?.sys?.sunset;
    const sunset = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp * 1000) : null;
    const liveSunset = weather?.source !== 'demo' && !weather?.unavailable
        && sunset && Number.isFinite(sunset.getTime())
        && venueLocalDate(sunset) === venueLocalDate(now);
    const goldenMinutes = liveSunset ? snap(melbourneMinutesNow(sunset) - 60) : null;
    return [
        { id: 'now', label: 'Now', minutes: localTimeToSliderMinutes(now) },
        { id: 'lunch', label: 'Lunch', minutes: 12 * 60 },
        { id: 'arvo', label: 'Arvo', minutes: 15 * 60 },
        { id: 'golden', label: 'Golden hour', minutes: goldenMinutes },
        // The current preview has no date dimension: never label today's data tomorrow.
        { id: 'tomorrow', label: 'Tomorrow', minutes: null },
    ];
}

/** Active shortcuts follow the actual slider value, including Sunny's updates. */
export function selectedMapTimePreset(minutes, presets, atNow = false) {
    if (atNow) return 'now';
    return presets.find(item => item.id !== 'now' && item.minutes != null
        && Math.abs(minutes - item.minutes) < TOD_SLIDER_STEP_MIN)?.id ?? null;
}
