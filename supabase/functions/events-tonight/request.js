/**
 * Pure request and response handling for events-tonight (tested from
 * src/utils/eventsTonightFunction.test.js). No Deno APIs here.
 */

// Victoria, generously: the function is not a general Ticketmaster proxy.
export const VIC_BOUNDS = Object.freeze({ minLat: -39.3, maxLat: -33.9, minLng: 140.9, maxLng: 150.1 });
export const MAX_RADIUS_KM = 10;
export const MAX_WINDOW_HOURS = 24;
export const CACHE_TTL_MS = 15 * 60 * 1000;
export const DISCOVERY_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HOUR_MS = 60 * 60 * 1000;

const num = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Validates ?lat&lng&radius&start&end (start/end as YYYY-MM-DDTHH:mm:ssZ, the
 * shape ticketmasterSearchParams sends). Returns the upstream query (without
 * the key) and a cache key, or an error with its HTTP status.
 */
export function parseEventsRequest(searchParams, now = Date.now()) {
  const lat = num(searchParams.get('lat'));
  const lng = num(searchParams.get('lng'));
  if (lat === null || lng === null) return { ok: false, status: 400, error: 'lat_lng_required' };
  if (lat < VIC_BOUNDS.minLat || lat > VIC_BOUNDS.maxLat || lng < VIC_BOUNDS.minLng || lng > VIC_BOUNDS.maxLng) {
    return { ok: false, status: 400, error: 'outside_victoria' };
  }
  const radiusRaw = num(searchParams.get('radius') ?? '3');
  if (radiusRaw === null || radiusRaw < 1 || radiusRaw > MAX_RADIUS_KM) return { ok: false, status: 400, error: 'bad_radius' };
  const radius = Math.round(radiusRaw);
  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  if (!STAMP.test(start) || !STAMP.test(end)) return { ok: false, status: 400, error: 'bad_window' };
  const startMs = Date.parse(start), endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return { ok: false, status: 400, error: 'bad_window' };
  if (endMs - startMs > MAX_WINDOW_HOURS * HOUR_MS) return { ok: false, status: 400, error: 'window_too_long' };
  if (startMs < now - 2 * HOUR_MS || startMs > now + 48 * HOUR_MS) return { ok: false, status: 400, error: 'window_not_tonight' };

  // Round the point to about 1 km and the window to the hour, so nearby guests share a cached answer.
  const rLat = lat.toFixed(2), rLng = lng.toFixed(2);
  const hourStart = new Date(Math.floor(startMs / HOUR_MS) * HOUR_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const query = {
    latlong: `${rLat},${rLng}`,
    radius: String(radius),
    unit: 'km',
    countryCode: 'AU',
    startDateTime: hourStart,
    endDateTime: end,
    sort: 'date,asc',
    size: '100',
  };
  return { ok: true, query, cacheKey: `${rLat},${rLng},${radius},${hourStart},${end}` };
}

/** Upstream URL with the key appended last (never logged). */
export function discoveryUrl(query, apiKey) {
  return `${DISCOVERY_URL}?${new URLSearchParams({ ...query, apikey: apiKey })}`;
}

/** Keep only what the app's normaliser reads; drops images, promo text and links we don't use. */
export function trimDiscoveryBody(body) {
  const events = Array.isArray(body?._embedded?.events) ? body._embedded.events : [];
  return {
    _embedded: {
      events: events.slice(0, 100).map((e) => ({
        id: e?.id,
        name: e?.name,
        url: e?.url,
        dates: {
          start: e?.dates?.start,
          timezone: e?.dates?.timezone,
          status: e?.dates?.status ? { code: e.dates.status.code } : undefined,
        },
        classifications: Array.isArray(e?.classifications)
          ? e.classifications.map((c) => ({
            primary: c?.primary,
            family: c?.family,
            segment: c?.segment ? { name: c.segment.name } : undefined,
            genre: c?.genre ? { name: c.genre.name } : undefined,
            subGenre: c?.subGenre ? { name: c.subGenre.name } : undefined,
          }))
          : undefined,
        priceRanges: Array.isArray(e?.priceRanges)
          ? e.priceRanges.map((p) => ({ currency: p?.currency, min: p?.min, max: p?.max }))
          : undefined,
        _embedded: {
          venues: (Array.isArray(e?._embedded?.venues) ? e._embedded.venues.slice(0, 1) : []).map((v) => ({
            name: v?.name,
            location: v?.location ? { latitude: v.location.latitude, longitude: v.location.longitude } : undefined,
          })),
        },
      })),
    },
  };
}

/** Upstream status → our status and error code. */
export function upstreamError(status) {
  if (status === 429) return { status: 503, error: 'quota_exhausted' };
  if (status === 401 || status === 403) return { status: 503, error: 'key_rejected' };
  return { status: 502, error: 'upstream_error' };
}

/** A tiny TTL cache with a size cap. */
export function createCache(ttlMs = CACHE_TTL_MS, maxEntries = 500) {
  const entries = new Map();
  return {
    get(key, now = Date.now()) {
      const hit = entries.get(key);
      if (!hit) return null;
      if (now - hit.at > ttlMs) { entries.delete(key); return null; }
      return hit;
    },
    set(key, value, now = Date.now()) {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
      entries.set(key, { value, at: now });
    },
  };
}
