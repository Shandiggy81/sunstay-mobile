/**
 * Opening hours and happy hours are shown only after the venue has confirmed
 * them. A venue row opts in with `hoursVerifiedAt` / `happyHourVerifiedAt`
 * (an ISO date or timestamp of the confirmation). No venue is verified yet,
 * so the card points people to the venue's website instead of stating hours.
 */

export const HOURS_UNCONFIRMED_NOTE =
    'Hours not yet confirmed by the venue. Check their website before you go.';

/** True for a parseable date (string, number or Date). */
export function isVerifiedAt(value) {
    if (value == null || value === '' || typeof value === 'boolean') return false;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time);
}

function openingHoursText(venue) {
    const raw = venue?.opening_hours ?? venue?.openingHours ?? venue?.hours;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * @param {object} venue
 * @returns {{ verified: true, text: string } | { verified: false, note: string }}
 */
export function venueHoursView(venue) {
    const text = openingHoursText(venue);
    if (text && isVerifiedAt(venue?.hoursVerifiedAt)) return { verified: true, text };
    return { verified: false, note: HOURS_UNCONFIRMED_NOTE };
}

/**
 * The venue's happy hour when it has been confirmed, else null.
 *
 * @param {object} venue
 * @param {object|null} [happyHour] overrides `venue.happyHour`
 */
export function verifiedHappyHour(venue, happyHour = venue?.happyHour) {
    if (!happyHour || typeof happyHour !== 'object') return null;
    return isVerifiedAt(venue?.happyHourVerifiedAt) ? happyHour : null;
}
