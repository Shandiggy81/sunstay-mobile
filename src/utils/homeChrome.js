import { mapTimePresets, selectedMapTimePreset } from './mapTimePresets.js';
import { describeSliderTime, melbourneMinutesNow } from './todMinutes.js';

/** The existing minute preview, described in Melbourne time without adding a date mode. */
export function homePreviewLabel({ minutes, now, weather }) {
    if (minutes == null) return 'Now';
    const presets = mapTimePresets({ now, weather });
    const selected = selectedMapTimePreset(minutes, presets, describeSliderTime(minutes, melbourneMinutesNow(now)).atNow);
    if (selected) return presets.find(item => item.id === selected).label;
    const hour = Math.floor(minutes / 60), minute = minutes % 60;
    return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

export function showHomeSunny({ chatOpen, venueOpen, sheetExpanded, filtersOpen, isMobile = true }) {
    return !chatOpen && !venueOpen && !(isMobile && sheetExpanded) && !filtersOpen;
}
