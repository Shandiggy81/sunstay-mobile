/**
 * SunStay After Dark: events in one shape, "tonight near my stay", weather at
 * showtime and a warm place nearby. Pure; no requests. The Ticketmaster call
 * itself belongs in a server-side function (the API key must not ship in the
 * bundle); this file only builds its query and reads its response.
 *
 * Event shape:
 * { id, source, sourceUrl, capturedAt, status: 'review'|'approved', title,
 *   category: 'live-music'|'comedy'|'theatre'|'family', start: ISO string,
 *   venueName, lat, lng, priceFrom: number|null, isFree: boolean|null,
 *   ticketUrl: string|null, exposure: 'indoor'|'outdoor'|null, adultsOnly: boolean }
 * Facts only: no images or promo copy (brief: copyright guardrail).
 */
import { parseVenueDateTime, venueTimeParts, venueTimeAt } from './venueTime.js';
import { windWord } from './venueConditionChips.js';
import { warmthForVenue } from './tonightFeel.js';

const MELBOURNE = 'Australia/Melbourne';
export const AFTER_DARK_START_HOUR = 17;

export const EVENT_CATEGORIES = Object.freeze({
    'live-music': { label: 'Live music', icon: 'live-music' },
    comedy: { label: 'Comedy', icon: 'party' },
    theatre: { label: 'Theatre', icon: 'arts' },
    family: { label: 'Family', icon: 'family' },
});

const ADULTS_ONLY = /\b(?:18\s*\+|R18\+?|over\s*18s?|adults?\s+only)/i;
const DROPPED_STATUS = new Set(['canceled', 'cancelled', 'postponed']);

const lower = value => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const finite = value => {
    const n = typeof value === 'string' && value.trim() ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const httpsUrl = value => (typeof value === 'string' && /^https:\/\/[^\s]+$/i.test(value.trim()) ? value.trim() : null);

/** Launch category for a Ticketmaster classification list, or null when it isn't one we list. */
export function ticketmasterCategory(classifications) {
    const list = Array.isArray(classifications) ? classifications : [];
    const ordered = [...list.filter(c => c?.primary), ...list.filter(c => !c?.primary)];
    for (const c of ordered) {
        const segment = lower(c?.segment?.name), genre = lower(c?.genre?.name), sub = lower(c?.subGenre?.name);
        if (genre === 'comedy' || sub === 'comedy') return 'comedy';
        if (c?.family === true || segment === 'family' || genre === 'family' || genre === "children's theatre") return 'family';
        if (segment === 'music') return 'live-music';
        // Live data (22 Oct 2026) tags cabaret as Arts & Theatre → Variety → Cabaret: every
        // Arts & Theatre show that isn't comedy or family is a theatre night.
        if (segment === 'arts & theatre') return 'theatre';
    }
    return null;
}

/**
 * One Ticketmaster Discovery v2 event → SunStay event, or null when it can't be
 * placed honestly (no time, no venue location, cancelled or postponed, or not a
 * launch category). New events start in review unless the caller says otherwise.
 */
export function normaliseTicketmasterEvent(raw, { capturedAt = new Date(), status = 'review' } = {}) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) return null;
    const title = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ').slice(0, 140) : '';
    if (!title) return null;
    const dates = raw.dates ?? {};
    if (DROPPED_STATUS.has(lower(dates.status?.code))) return null;
    const startInfo = dates.start ?? {};
    if (startInfo.dateTBD || startInfo.dateTBA || startInfo.timeTBA || startInfo.noSpecificTime) return null;
    const zone = typeof dates.timezone === 'string' && dates.timezone ? dates.timezone : MELBOURNE;
    let start = typeof startInfo.dateTime === 'string' ? parseVenueDateTime(startInfo.dateTime, zone) : null;
    if (!start && typeof startInfo.localDate === 'string' && typeof startInfo.localTime === 'string') {
        start = parseVenueDateTime(`${startInfo.localDate}T${startInfo.localTime.slice(0, 8)}`, zone);
    }
    if (!start) return null;
    const category = ticketmasterCategory(raw.classifications);
    if (!category) return null;
    const venue = raw._embedded?.venues?.[0];
    const lat = finite(venue?.location?.latitude), lng = finite(venue?.location?.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const prices = (Array.isArray(raw.priceRanges) ? raw.priceRanges : [])
        .filter(p => !p?.currency || p.currency === 'AUD')
        .map(p => ({ min: finite(p?.min), max: finite(p?.max) }))
        .filter(p => p.min !== null && p.min >= 0);
    const priceFrom = prices.length ? Math.min(...prices.map(p => p.min)) : null;
    const isFree = prices.length ? prices.every(p => p.min === 0 && (p.max === null || p.max === 0)) : null;
    const url = httpsUrl(raw.url);
    return {
        id: `tm:${raw.id.trim()}`,
        source: 'ticketmaster',
        sourceUrl: url,
        capturedAt: new Date(capturedAt).toISOString(),
        status,
        title,
        category,
        start: start.toISOString(),
        venueName: typeof venue?.name === 'string' ? venue.name.trim() : '',
        lat,
        lng,
        priceFrom,
        isFree,
        ticketUrl: url,
        // Ticketmaster does not say whether a show is indoors or outdoors.
        exposure: null,
        // Age limits appear only in titles in the live feed ("(18+ Event)").
        adultsOnly: ADULTS_ONLY.test(title),
    };
}

/** Normalise a whole Discovery response, dropping unusable and duplicate events. */
export function normaliseTicketmasterResponse(body, options = {}) {
    const raw = body?._embedded?.events;
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    return raw.map(item => normaliseTicketmasterEvent(item, options)).filter(event => {
        if (!event || seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
    });
}

const utcStamp = date => new Date(date).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Tonight's window: now (less a short grace) until 5am the next morning, Melbourne time. */
export function tonightWindow(now = new Date(), { timeZone = MELBOURNE, graceMinutes = 30 } = {}) {
    const local = venueTimeParts(now, timeZone);
    let endDate = local.date;
    if (local.hour >= 5) {
        const [y, m, d] = local.date.split('-').map(Number);
        endDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    return { from: new Date(now.getTime() - graceMinutes * 60000), to: venueTimeAt(endDate, 5, timeZone) };
}

/** Discovery v2 /events.json query for tonight around a point (apikey added server-side). */
export function ticketmasterSearchParams({ lat, lng, radiusKm = 3, now = new Date(), size = 100 } = {}) {
    if (finite(lat) === null || finite(lng) === null) throw new RangeError('lat and lng are required');
    const { from, to } = tonightWindow(now, { graceMinutes: 0 });
    return new URLSearchParams({
        latlong: `${lat},${lng}`,
        radius: String(Math.max(1, Math.min(50, Math.round(radiusKm)))),
        unit: 'km',
        countryCode: 'AU',
        startDateTime: utcStamp(from),
        endDateTime: utcStamp(to),
        sort: 'date,asc',
        size: String(Math.max(1, Math.min(200, size))),
    });
}

/** Great-circle distance in metres. */
export function distanceMetres(a, b) {
    const RAD = Math.PI / 180, R = 6371000;
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Approved events starting tonight, nearest the guest's stay when an origin is
 * given, sorted by start time then distance. Walking time assumes 80 m a minute.
 */
export function eventsTonight(events, { now = new Date(), origin = null, maxKm = 2, categories = null, freeOnly = false } = {}) {
    const { from: graceStart, to } = tonightWindow(now);
    // The night's date precedes its 5am end by one calendar day, including across DST.
    const [y, m, d] = venueTimeParts(to, MELBOURNE).date.split('-').map(Number);
    const nightDate = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const eveningStart = venueTimeAt(nightDate, AFTER_DARK_START_HOUR, MELBOURNE);
    const from = new Date(Math.max(graceStart.getTime(), eveningStart.getTime()));
    const wanted = Array.isArray(categories) && categories.length ? new Set(categories) : null;
    const hasOrigin = origin && finite(origin.lat) !== null && finite(origin.lng) !== null;
    return (Array.isArray(events) ? events : []).flatMap(event => {
        if (event?.status !== 'approved' || !EVENT_CATEGORIES[event.category]) return [];
        if (wanted && !wanted.has(event.category)) return [];
        if (freeOnly && event.isFree !== true) return [];
        const start = new Date(event.start);
        if (!Number.isFinite(start.getTime()) || start < from || start >= to) return [];
        if (!hasOrigin) return [{ ...event, distanceMetres: null, walkMinutes: null }];
        const metres = distanceMetres(origin, event);
        if (metres > maxKm * 1000) return [];
        return [{ ...event, distanceMetres: Math.round(metres), walkMinutes: Math.max(1, Math.round(metres / 80)) }];
    }).sort((a, b) => new Date(a.start) - new Date(b.start) || (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0));
}

function showtimeForecastIndex(event, weather, timeZone) {
    const hourly = weather?.hourly;
    if (!event?.start || !hourly || !Array.isArray(hourly.time) || weather.source === 'demo' || weather.unavailable) return -1;
    const start = new Date(event.start);
    if (!Number.isFinite(start.getTime())) return -1;
    const target = venueTimeParts(start, timeZone);
    return hourly.time.findIndex(time => {
        const instant = parseVenueDateTime(time, timeZone);
        if (!instant) return false;
        const p = venueTimeParts(instant, timeZone);
        return p.date === target.date && p.hour === target.hour;
    });
}

const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

function wetShowtime(weather, index) {
    if (!weather || weather.source === 'demo' || weather.unavailable || weather.error) return false;
    if (index < 0) return false;
    const hourly = weather.hourly;
    return (finite(hourly.precipitation_probability?.[index]) ?? 0) >= 50
        || (finite(hourly.precipitation?.[index]) ?? 0) > 0
        || WET_CODES.has(finite(hourly.weather_code_raw?.[index] ?? hourly.weather_code?.[index] ?? hourly.weathercode?.[index]));
}

/**
 * Forecast for the hour an event starts, from the app's Open-Meteo hourly block
 * (Melbourne-wide, so it is labelled a city forecast). Null without data, never a guess.
 */
export function showtimeWeather(event, weather, { timeZone = MELBOURNE } = {}) {
    const index = showtimeForecastIndex(event, weather, timeZone);
    if (index < 0) return null;
    const hourly = weather.hourly;
    const pick = key => finite(hourly[key]?.[index]);
    const temp = pick('temperature_2m'), feels = pick('apparent_temperature');
    const rain = pick('precipitation_probability'), wind = pick('wind_speed_10m') ?? pick('windspeed_10m');
    if (temp === null || rain === null || wind === null) return null;
    const isWet = wetShowtime(weather, index);
    const parts = [`${Math.round(temp)}°`, rain >= 30 ? `${Math.round(rain)}% chance of rain` : isWet ? 'wet at showtime' : 'dry', windWord(wind).toLowerCase()];
    let advice = null;
    if (event.exposure === 'outdoor') {
        if (rain >= 50) advice = 'Bring a jacket or pick an indoor plan';
        else if ((feels ?? temp) < 12 || wind >= 30) advice = 'Cold and exposed: bring a jacket';
    }
    return { temp, feels, rain, wind, line: parts.join(' · '), advice, isWet };
}

const WARMTH_SHORT = { fireplace: 'Fireplace', heater: 'Outdoor heaters', 'indoor-warmth': 'Warm indoor space' };

/** Declared warmth near a show, nearest first; wet evenings use indoor warmth only. */
export function warmPairings(event, venues, { maxMetres = 500, limit = 2, weather = null, forecast = null } = {}) {
    if (finite(event?.lat) === null || finite(event?.lng) === null) return [];
    const rainingNow = weather && weather.source !== 'demo' && !weather.unavailable && !weather.error
        && ((finite(weather.precipitation) ?? 0) > 0 || /rain|drizzle|thunder/i.test(String(weather.weather?.[0]?.main ?? '')));
    const wet = rainingNow || (typeof forecast?.isWet === 'boolean' ? forecast.isWet
        : wetShowtime(weather, showtimeForecastIndex(event, weather, MELBOURNE)));
    return (Array.isArray(venues) ? venues : []).flatMap(venue => {
        const lat = finite(venue?.lat), lng = finite(venue?.lng);
        if (lat === null || lng === null) return [];
        // Pair with somewhere else: an event's own venue is not its "nearby" warm spot.
        if (event.venueId != null && String(venue.id) === String(event.venueId)) return [];
        const outdoorFire = /\b(?:outdoor|outside|garden|terrace)\b/i.test(String(venue.heating ?? ''));
        const warmth = warmthForVenue(venue).filter(item => !wet
            || item.icon === 'indoor-warmth' || item.icon === 'fireplace' && !outdoorFire);
        if (!warmth.length) return [];
        const metres = distanceMetres(event, { lat, lng });
        if (metres > maxMetres) return [];
        const name = venue.venueName ?? venue.name ?? '';
        const rounded = Math.round(metres / 10) * 10;
        return [{ id: venue.id, name, distanceMetres: rounded, warmth,
            line: wet ? `Warm and dry before the show: ${name}, ${rounded}\u00a0m away`
                : `${WARMTH_SHORT[warmth[0].icon] ?? warmth[0].text} at ${name}, ${rounded}\u00a0m away` }];
    }).sort((a, b) => a.distanceMetres - b.distanceMetres).slice(0, limit);
}

/**
 * Tonight's Ticketmaster events near a point, through the events-tonight Edge
 * Function (which holds the key). Ticketmaster is a licensed feed with live
 * cancellation status, so its events are shown as approved; venue-page events
 * still go through review. Returns { ok, events, error, fetchedAt }.
 */
export async function fetchEventsTonight({
    supabaseUrl, anonKey, origin, radiusKm = 3, now = new Date(), fetchImpl = fetch, signal,
} = {}) {
    if (!supabaseUrl || !anonKey) return { ok: false, events: [], error: 'missing_supabase', fetchedAt: null };
    let search;
    try {
        search = ticketmasterSearchParams({ lat: origin?.lat, lng: origin?.lng, radiusKm, now });
    } catch {
        return { ok: false, events: [], error: 'missing_origin', fetchedAt: null };
    }
    const query = new URLSearchParams({
        lat: String(origin.lat), lng: String(origin.lng), radius: search.get('radius'),
        start: search.get('startDateTime'), end: search.get('endDateTime'),
    });
    try {
        const res = await fetchImpl(`${String(supabaseUrl).replace(/\/$/, '')}/functions/v1/events-tonight?${query}`, {
            method: 'GET',
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
            signal,
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, events: [], error: body?.error || `http_${res.status}`, fetchedAt: null };
        const capturedAt = body?.fetchedAt ? new Date(body.fetchedAt) : now;
        const events = normaliseTicketmasterResponse(body, { capturedAt, status: 'approved' });
        return { ok: true, events, error: null, fetchedAt: capturedAt.toISOString() };
    } catch (error) {
        if (error?.name === 'AbortError') return { ok: false, events: [], error: 'aborted', fetchedAt: null };
        return { ok: false, events: [], error: 'network', fetchedAt: null };
    }
}

const titleWords = title => new Set(String(title ?? '').toLowerCase()
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !['the', 'and', 'live', 'with', 'presents'].includes(w)));

/**
 * The same show from two sources (say Ticketmaster and the venue itself):
 * starts within 30 minutes, venues within 150 m, and most title words shared.
 */
export function isSameEvent(a, b) {
    if (!a || !b || a.id === b.id) return Boolean(a && b);
    const dt = Math.abs(new Date(a.start) - new Date(b.start));
    if (!Number.isFinite(dt) || dt > 30 * 60000) return false;
    if ([a.lat, a.lng, b.lat, b.lng].some(v => finite(v) === null) || distanceMetres(a, b) > 150) return false;
    const wa = titleWords(a.title), wb = titleWords(b.title);
    if (!wa.size || !wb.size) return false;
    const shared = [...wa].filter(w => wb.has(w)).length;
    return shared / Math.min(wa.size, wb.size) >= 0.6;
}

/**
 * One row per show. The venue's own entry wins (it knows indoor/outdoor and
 * its own details); a ticket link and price from another source fill its gaps.
 */
export function dedupeEvents(events) {
    const rank = e => (e?.source === 'venue' ? 0 : 1);
    const kept = [];
    for (const event of [...(Array.isArray(events) ? events : [])].filter(Boolean).sort((a, b) => rank(a) - rank(b))) {
        const twin = kept.find(k => isSameEvent(k, event));
        if (!twin) { kept.push({ ...event }); continue; }
        twin.ticketUrl ??= event.ticketUrl;
        twin.priceFrom ??= event.priceFrom;
        twin.isFree ??= event.isFree;
        twin.adultsOnly = Boolean(twin.adultsOnly || event.adultsOnly);
        twin.alsoListedBy = [...(twin.alsoListedBy ?? []), event.source];
    }
    return kept.sort((a, b) => new Date(a.start) - new Date(b.start));
}
