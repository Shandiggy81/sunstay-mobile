/**
 * Events a venue enters itself: one-off gigs and weekly regulars ("Trivia,
 * every Tuesday, 7pm"). They become the same event shape as Ticketmaster's
 * (src/utils/afterDarkEvents.js), so eventsTonight, showtimeWeather and
 * warmPairings work on both. Pure; storage and sign-in come later.
 *
 * A venue entry:
 * { key, venueId, title, category, startTime: 'HH:MM',
 *   date?: 'YYYY-MM-DD' (one-off) | weekdays?: [0–6] (0 = Sunday, weekly),
 *   skipDates?: ['YYYY-MM-DD'], exposure?: 'indoor'|'outdoor'|null,
 *   isFree?: boolean|null, priceFrom?: number|null, adultsOnly?: boolean,
 *   sourceUrl?: https link to the venue's own page, status?: 'review'|'approved',
 *   updatedAt?: ISO string }
 * Times before 5am belong to that night: a 00:30 start on a Friday entry is
 * Saturday 12:30am.
 */
import { EVENT_CATEGORIES, tonightWindow } from './afterDarkEvents.js';
import { venueTimeAt, venueTimeParts } from './venueTime.js';

const MELBOURNE = 'Australia/Melbourne';
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
const validDate = value => DATE.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/**
 * Checks a venue's entry and returns it cleaned, or the reasons it can't be
 * saved, in plain words for the partner form.
 */
export function validateVenueEvent(input) {
    const errors = [];
    const title = typeof input?.title === 'string' ? input.title.trim().replace(/\s+/g, ' ') : '';
    if (title.length < 3 || title.length > 80) errors.push('Give the event a name (3–80 characters).');
    if (!EVENT_CATEGORIES[input?.category]) errors.push('Choose live music, comedy, theatre or family.');
    if (!TIME.test(input?.startTime ?? '')) errors.push('Add a start time like 19:30.');
    const hasDate = typeof input?.date === 'string' && input.date !== '';
    const days = Array.isArray(input?.weekdays) ? [...new Set(input.weekdays)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort() : [];
    if (hasDate && days.length) errors.push('Choose a date or weekly days, not both.');
    else if (hasDate && !validDate(input.date)) errors.push('Use a real date.');
    else if (!hasDate && !days.length) errors.push('Choose a date or the days it runs each week.');
    if (typeof input?.venueId !== 'string' || !input.venueId.trim()) errors.push('Missing venue.');
    const price = input?.priceFrom;
    if (price != null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) errors.push('Price must be a number from 0.');
    if (input?.sourceUrl && !/^https:\/\/\S+$/i.test(input.sourceUrl)) errors.push('Event links must start with https://.');
    if (errors.length) return { ok: false, errors };
    const isFree = input.isFree === true || price === 0 ? true : input.isFree === false || (price ?? 0) > 0 ? false : null;
    return {
        ok: true,
        errors: [],
        entry: {
            key: typeof input.key === 'string' && input.key.trim() ? input.key.trim() : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            venueId: input.venueId.trim(),
            title,
            category: input.category,
            startTime: input.startTime,
            ...(hasDate ? { date: input.date } : { weekdays: days }),
            skipDates: (Array.isArray(input.skipDates) ? input.skipDates : []).filter(validDate),
            exposure: input.exposure === 'indoor' || input.exposure === 'outdoor' ? input.exposure : null,
            isFree,
            priceFrom: isFree ? 0 : price ?? null,
            adultsOnly: input.adultsOnly === true,
            sourceUrl: input.sourceUrl ? input.sourceUrl.trim() : null,
            // A venue's own entry waits for review unless an approver says otherwise.
            status: input.status === 'approved' ? 'approved' : 'review',
            updatedAt: input.updatedAt ?? null,
        },
    };
}

/**
 * Tonight's occurrences of venue entries, in the shared event shape. Entries
 * whose venue is unknown or has no location are skipped. Status is kept, so
 * eventsTonight still shows only approved ones.
 */
export function venueEventsTonight(entries, venues, { now = new Date(), timeZone = MELBOURNE } = {}) {
    const byId = new Map((Array.isArray(venues) ? venues : []).map(v => [String(v?.id), v]));
    const { from, to } = tonightWindow(now, { timeZone, graceMinutes: 30 });
    const local = venueTimeParts(now, timeZone);
    // "Tonight" is the evening that started today, or yesterday if it's before 5am.
    const night = local.hour >= 5 ? local.date : addDays(local.date, -1);
    const out = [];
    for (const raw of Array.isArray(entries) ? entries : []) {
        const checked = validateVenueEvent(raw);
        if (!checked.ok) continue;
        const e = checked.entry;
        const venue = byId.get(e.venueId);
        const lat = Number(venue?.lat), lng = Number(venue?.lng);
        if (!venue || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const runs = e.date ? e.date === night : e.weekdays.includes(weekday(night));
        if (!runs || e.skipDates.includes(night)) continue;
        const [h, m] = e.startTime.split(':').map(Number);
        const calendarDate = h < 5 ? addDays(night, 1) : night;
        let start;
        try { start = venueTimeAt(calendarDate, h + m / 60, timeZone); } catch { continue; }
        if (start < from || start >= to) continue;
        out.push({
            id: `venue:${e.venueId}:${e.key}:${night}`,
            source: 'venue',
            sourceUrl: e.sourceUrl,
            capturedAt: e.updatedAt ?? null,
            status: e.status,
            title: e.title,
            category: e.category,
            start: start.toISOString(),
            venueId: e.venueId,
            venueName: venue.venueName ?? venue.name ?? '',
            lat,
            lng,
            priceFrom: e.priceFrom,
            isFree: e.isFree,
            ticketUrl: e.sourceUrl,
            exposure: e.exposure,
            adultsOnly: e.adultsOnly,
        });
    }
    return out;
}
