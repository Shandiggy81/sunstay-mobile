import { distanceMetres } from './afterDarkEvents.js';
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

const priceFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 });
export function formatAfterDarkPrice(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? `From $${priceFormat.format(value)}` : null;
}
