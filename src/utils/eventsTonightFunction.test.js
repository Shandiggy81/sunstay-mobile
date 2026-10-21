import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createCache, discoveryUrl, parseEventsRequest, trimDiscoveryBody, upstreamError,
} from '../../supabase/functions/events-tonight/request.js';
import { normaliseTicketmasterResponse, ticketmasterSearchParams } from './afterDarkEvents.js';

const NOW = Date.parse('2026-10-22T03:00:00Z');
const params = (over = {}) => new URLSearchParams({ lat: '-37.8136', lng: '144.9631', radius: '3',
    start: '2026-10-22T03:00:00Z', end: '2026-10-22T18:00:00Z', ...over });

test('accepts the window the app builds and rounds it for caching', () => {
    const app = ticketmasterSearchParams({ lat: -37.8136, lng: 144.9631, radiusKm: 3, now: new Date(NOW) });
    const r = parseEventsRequest(params({ start: app.get('startDateTime'), end: app.get('endDateTime') }), NOW);
    assert.equal(r.ok, true);
    assert.deepEqual(r.query, { latlong: '-37.81,144.96', radius: '3', unit: 'km', countryCode: 'AU',
        startDateTime: '2026-10-22T03:00:00Z', endDateTime: '2026-10-22T18:00:00Z', sort: 'date,asc', size: '100' });
    assert.equal(r.cacheKey, '-37.81,144.96,3,2026-10-22T03:00:00Z,2026-10-22T18:00:00Z');
    assert.equal(parseEventsRequest(params({ start: '2026-10-22T03:20:00Z' }), NOW).query.startDateTime, '2026-10-22T03:00:00Z');
});

test('rejects anything that is not tonight in Victoria', () => {
    const cases = [
        [{ lat: '' }, 'lat_lng_required'],
        [{ lat: '-33.86', lng: '151.21' }, 'outside_victoria'], // Sydney
        [{ radius: '50' }, 'bad_radius'],
        [{ radius: '0.5' }, 'bad_radius'],
        [{ start: '2026-10-22 03:00' }, 'bad_window'],
        [{ end: '2026-10-22T02:00:00Z' }, 'bad_window'],
        [{ end: '2026-10-24T03:00:00Z' }, 'window_too_long'],
        [{ start: '2026-11-22T03:00:00Z', end: '2026-11-22T18:00:00Z' }, 'window_not_tonight'],
    ];
    for (const [over, error] of cases) {
        const r = parseEventsRequest(params(over), NOW);
        assert.equal(r.ok, false, error);
        assert.equal(r.error, error);
        assert.equal(r.status, 400);
    }
});

test('the key is only ever added to the upstream URL', () => {
    const r = parseEventsRequest(params(), NOW);
    assert.equal(r.cacheKey.includes('KEY'), false);
    const url = new URL(discoveryUrl(r.query, 'TEST-KEY'));
    assert.equal(url.origin + url.pathname, 'https://app.ticketmaster.com/discovery/v2/events.json');
    assert.equal(url.searchParams.get('apikey'), 'TEST-KEY');
});

test('trimmed body still normalises exactly like the full one, without images', () => {
    const full = { _embedded: { events: [{
        id: 'G1', name: 'Sample Gig', url: 'https://www.ticketmaster.com.au/event/G1', info: 'long promo', images: [{ url: 'https://x/y.jpg' }],
        dates: { start: { localDate: '2026-10-22', localTime: '20:00:00', dateTime: '2026-10-22T09:00:00Z' }, timezone: 'Australia/Melbourne', status: { code: 'onsale' } },
        classifications: [{ primary: true, segment: { id: 's', name: 'Music' }, genre: { name: 'Rock' } }],
        priceRanges: [{ type: 'standard', currency: 'AUD', min: 30, max: 60 }],
        _embedded: { venues: [{ name: 'Sample Hall', location: { latitude: '-37.81', longitude: '144.96' }, images: [] }] },
    }] } };
    const trimmed = trimDiscoveryBody(full);
    assert.equal(JSON.stringify(trimmed).includes('images'), false);
    assert.equal(JSON.stringify(trimmed).includes('long promo'), false);
    const opts = { capturedAt: new Date(NOW) };
    assert.deepEqual(normaliseTicketmasterResponse(trimmed, opts), normaliseTicketmasterResponse(full, opts));
    assert.deepEqual(trimDiscoveryBody(null), { _embedded: { events: [] } });
});

test('upstream errors map to clear codes', () => {
    assert.deepEqual(upstreamError(429), { status: 503, error: 'quota_exhausted' });
    assert.deepEqual(upstreamError(401), { status: 503, error: 'key_rejected' });
    assert.deepEqual(upstreamError(500), { status: 502, error: 'upstream_error' });
});

test('cache expires and stays bounded', () => {
    const cache = createCache(1000, 2);
    cache.set('a', 1, 0);
    assert.equal(cache.get('a', 999).value, 1);
    assert.equal(cache.get('a', 1001), null);
    cache.set('a', 1, 0); cache.set('b', 2, 0); cache.set('c', 3, 0);
    assert.equal(cache.get('a', 0), null);
    assert.equal(cache.get('c', 0).value, 3);
});
