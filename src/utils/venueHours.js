/**
 * Opening hours and happy hours are shown only once they have been checked
 * against a source. A venue row opts in with `hoursVerifiedAt` +
 * `hoursSourceUrl`, or `happyHourVerifiedAt` + `happyHourSourceUrl` (the
 * date it was checked and the page it was checked on). Anything else, the
 * card points people to the venue's website instead of stating hours.
 */

export const HOURS_UNCONFIRMED_NOTE =
    'Hours not yet confirmed by the venue. Check their website before you go.';

/** True for a parseable date (string, number or Date). */
export function isVerifiedAt(value) {
    if (value == null || value === '' || typeof value === 'boolean') return false;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time);
}

/** True for an absolute http(s) URL. */
export function isSourceUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function openingHoursText(venue) {
    const raw = venue?.opening_hours ?? venue?.openingHours ?? venue?.hours;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * @param {object} venue
 * @returns {{ verified: true, text: string, sourceUrl: string } | { verified: false, note: string }}
 */
export function venueHoursView(venue) {
    const text = openingHoursText(venue);
    if (text && isVerifiedAt(venue?.hoursVerifiedAt) && isSourceUrl(venue?.hoursSourceUrl)) {
        return { verified: true, text, sourceUrl: venue.hoursSourceUrl.trim() };
    }
    return { verified: false, note: HOURS_UNCONFIRMED_NOTE };
}

/**
 * The venue's own happy hour when it has been checked against a source, else
 * null. Only the venue row's `happyHour` counts; happy hours from other data
 * files are never borrowed.
 *
 * @param {object} venue
 */
export function verifiedHappyHour(venue) {
    const happyHour = venue?.happyHour;
    if (!happyHour || typeof happyHour !== 'object') return null;
    return isVerifiedAt(venue?.happyHourVerifiedAt) && isSourceUrl(venue?.happyHourSourceUrl) ? happyHour : null;
}
