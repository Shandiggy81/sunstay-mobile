import { dedupeEvents, distanceMetres, eventsTonight } from './afterDarkEvents.js';
import { parseVenueDateTime, venueTimeParts } from './venueTime.js';

const MELBOURNE = 'Australia/Melbourne';

export function resolveAfterDarkMode(choice, isNight) {
    return choice === 'sun' || choice === 'after-dark' ? choice : isNight ? 'after-dark' : 'sun';
}

function validOrigin(origin) {
    return typeof origin?.lat === 'number' && Number.isFinite(origin.lat) && Math.abs(origin.lat) <= 90
        && typeof origin?.lng === 'number' && Number.isFinite(origin.lng) && Math.abs(origin.lng) <= 180;
}

/** Prefer the map's reported centre, with its existing viewport as a fallback. */
export function afterDarkOrigin(bbox, fallback, center = null) {
    if (validOrigin(center)) return { lat: center.lat, lng: center.lng };
    if (bbox && [bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng].every(value => typeof value === 'number' && Number.isFinite(value))
        && bbox.minLat < bbox.maxLat && bbox.minLng < bbox.maxLng
        && Math.abs(bbox.minLat) <= 90 && Math.abs(bbox.maxLat) <= 90
        && Math.abs(bbox.minLng) <= 180 && Math.abs(bbox.maxLng) <= 180) {
        return { lat: (bbox.minLat + bbox.maxLat) / 2, lng: (bbox.minLng + bbox.maxLng) / 2 };
    }
    return validOrigin(fallback) ? { lat: fallback.lat, lng: fallback.lng } : null;
}

/** A cached result or in-flight request is reused until the centre moves over 1km. */
export function shouldFetchAfterDark({ open, origin, previousOrigin = null, retry = false } = {}) {
    if (!open || !validOrigin(origin)) return false;
    return retry || !validOrigin(previousOrigin) || distanceMetres(previousOrigin, origin) > 1000;
}

/** Event and update timestamps always use Melbourne, never the device timezone. */
export function formatAfterDarkTime(value) {
    if (!(value instanceof Date) && (typeof value !== 'string' || !value.trim())) return '';
    const instant = value instanceof Date ? value : parseVenueDateTime(value, MELBOURNE);
    if (!instant || !Number.isFinite(instant.getTime())) return '';
    const { hour, minute } = venueTimeParts(instant, MELBOURNE);
    return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/** Tonight's list: one row per show (the same gig listed twice collapses), then the usual filters. */
export function tonightsEvents(events, options = {}) {
    return eventsTonight(dedupeEvents(events), options);
}

const dollars = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const dollarsAndCents = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "From $45" or "From $45.50". A $0 floor alone does not make a show free, so it gets no label. */
export function formatAfterDarkPrice(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    return `From ${(Number.isInteger(value) ? dollars : dollarsAndCents).format(value)}`;
}

/** "Free" only when the source says the show is free; otherwise the known starting price, or nothing. */
export function afterDarkPriceLabel(event) {
    return event?.isFree === true ? 'Free' : formatAfterDarkPrice(event?.priceFrom);
}

/** The 18+ badge already says it, so a trailing "(18+ Event)" is dropped from the shown title. */
export function afterDarkTitle(event) {
    const title = typeof event?.title === 'string' ? event.title : '';
    if (event?.adultsOnly !== true) return title;
    return title.replace(/\s*[([]\s*18\s*\+[^)\]]*[)\]]\s*$/, '').trim() || title;
}
