import { dedupeEvents, distanceMetres, eventsTonight, showtimeWeather } from './afterDarkEvents.js';
import { parseVenueDateTime, venueTimeParts } from './venueTime.js';
import { MAX_BOUNDS } from '../config/mapBounds.js';

const MELBOURNE = 'Australia/Melbourne';
export const AFTER_DARK_DEFAULT_ORIGIN = Object.freeze({ lat: -37.8183, lng: 144.9671 });
export const AFTER_DARK_MIN_CAMERA_ZOOM = 14;
export const AFTER_DARK_LOCATION_RADIUS_METRES = 150;

export function resolveAfterDarkMode(choice, isNight) {
    return choice === 'sun' || choice === 'after-dark' ? choice : isNight ? 'after-dark' : 'sun';
}

function validOrigin(origin) {
    return typeof origin?.lat === 'number' && Number.isFinite(origin.lat) && Math.abs(origin.lat) <= 90
        && typeof origin?.lng === 'number' && Number.isFinite(origin.lng) && Math.abs(origin.lng) <= 180;
}

/** A citywide or unavailable camera uses Flinders St, never a pitched viewport's midpoint. */
export function afterDarkOrigin(camera = null, locatedPoint = null) {
    const [[minLng, minLat], [maxLng, maxLat]] = MAX_BOUNDS;
    if (!validOrigin(camera) || !Number.isFinite(camera.zoom) || camera.zoom < AFTER_DARK_MIN_CAMERA_ZOOM
        || camera.lat < minLat || camera.lat > maxLat || camera.lng < minLng || camera.lng > maxLng) {
        return { ...AFTER_DARK_DEFAULT_ORIGIN, kind: 'default', label: 'Walk times from Flinders St Station' };
    }
    const fromLocation = validOrigin(locatedPoint)
        && distanceMetres(camera, locatedPoint) <= AFTER_DARK_LOCATION_RADIUS_METRES;
    return { lat: camera.lat, lng: camera.lng, kind: fromLocation ? 'location' : 'map',
        label: fromLocation ? 'Walk times from your location' : 'Walk times from the map centre' };
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

/** The evening's day comes from Melbourne, including when the device is overseas. */
export function afterDarkNightLabel(now) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return '';
    return `${new Intl.DateTimeFormat('en-AU', { timeZone: MELBOURNE, weekday: 'long' }).format(now)} night`;
}

/**
 * The city forecast, said once above tonight's list, for the hour of the earliest
 * show listed: "City forecast at 7pm: 15°, dry, light wind". Null with no shows,
 * or with no forecast for that hour (never a guess).
 * @returns {{ line: string, start: string, forecast: object } | null}
 */
export function eveningForecast(events, weather) {
    const first = (Array.isArray(events) ? events : [])
        .filter(event => Number.isFinite(new Date(event?.start).getTime()))
        .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
    const forecast = first ? showtimeWeather(first, weather) : null;
    if (!forecast) return null;
    return { line: `City forecast at ${formatAfterDarkTime(first.start)}: ${forecastWords(forecast)}`, start: first.start, forecast };
}

/**
 * A show's own forecast, only where it adds to the evening line above the list:
 * a different rain or wind word, or 3° or more apart ("At 9pm: 13°, 60% chance
 * of rain, breezy"). Advice for an outdoor show ("bring a jacket") always shows.
 * Null when the show would repeat the evening line and has no advice.
 * @returns {{ line: string | null, advice: string | null } | null}
 */
export function showtimeNote(event, weather, evening) {
    const forecast = showtimeWeather(event, weather);
    if (!forecast) return null;
    const [, rain, wind] = forecast.line.split(' · ');
    const base = evening?.forecast;
    const [, baseRain, baseWind] = base ? base.line.split(' · ') : [];
    const differs = !base || rain !== baseRain || wind !== baseWind
        || Math.abs(Math.round(forecast.temp) - Math.round(base.temp)) >= 3;
    const line = differs ? `At ${formatAfterDarkTime(event.start)}: ${forecastWords(forecast)}` : null;
    return line || forecast.advice ? { line, advice: forecast.advice } : null;
}

/** "15° · dry · light wind" as words in a sentence: "15°, dry, light wind". */
function forecastWords(forecast) {
    return forecast.line.split(' · ').join(', ');
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

const TITLE_ACRONYMS = new Set(['DJ', 'NYE', 'AFL', 'UK', 'USA', 'MC', 'RNB', 'EDM', 'VIP']);

/** Display-only: soften overwhelmingly uppercase feed titles without rewriting mixed-case branding. */
export function displayAfterDarkTitle(title) {
    if (typeof title !== 'string') return '';
    const letters = [...title].filter(letter => letter.toUpperCase() !== letter.toLowerCase());
    const uppercase = letters.filter(letter => letter === letter.toUpperCase()).length;
    if (!letters.length || uppercase / letters.length < 0.8) return title;
    return title.replace(/\s+~\s+/g, ', ').replace(/\p{L}[\p{L}\p{N}'’]*/gu, word => {
        const [base, suffix = ''] = word.split(/(?=['’])/u);
        if (TITLE_ACRONYMS.has(base.toUpperCase())) return base.toUpperCase() + suffix.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
}
