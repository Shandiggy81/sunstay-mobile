import { EVENT_DAYS_AHEAD } from './partnerTools.js';

/** Date inputs use calendar days, independent of the browser's zone or DST. */
export function partnerEventMaxDate(today) {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + EVENT_DAYS_AHEAD);
    return date.toISOString().slice(0, 10);
}

/** Explain incomplete schedules before the data sanitiser would discard them. */
export function partnerHappyHourError({ days, start, end, deal }) {
    const hasSchedule = days.length > 0 || start || end;
    if (hasSchedule && (!days.length || !start || !end)) {
        return 'Choose at least one day and both times, or clear the days and times to save a deal only.';
    }
    if (hasSchedule && end <= start) return 'The end time must be later than the start time.';
    if (!hasSchedule && !deal.trim()) return 'Add a deal or choose days and times.';
    return null;
}
