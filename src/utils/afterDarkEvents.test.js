import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    distanceMetres, eventsTonight, fetchEventsTonight, normaliseTicketmasterEvent, normaliseTicketmasterResponse,
    showtimeWeather, ticketmasterCategory, ticketmasterSearchParams, tonightWindow, warmPairings,
} from './afterDarkEvents.js';

// Fictional fixtures in the Discovery v2 shape. 22 Oct 2026 is AEDT (UTC+11).
const CBD = { lat: -37.8136, lng: 144.9631 };
const tm = (over = {}) => ({
    id: 'G5vYZ0001', name: '  Sample  Band Live ', url: 'https://www.ticketmaster.com.au/event/G5vYZ0001',
    dates: { start: { localDate: '2026-10-22', localTime: '20:00:00', dateTime: '2026-10-22T09:00:00Z' },
        timezone: 'Australia/Melbourne', status: { code: 'onsale' } },
    classifications: [{ primary: true, segment: { name: 'Music' }, genre: { name: 'Rock' } }],
    priceRanges: [{ type: 'standard', currency: 'AUD', min: 45, max: 89 }],
    _embedded: { venues: [{ name: 'Sample Hall', location: { latitude: '-37.8120', longitude: '144.9650' } }] },
    ...over,
});
const CAPTURED = new Date('2026-10-22T01:00:00Z');

test('normalises a Ticketmaster event to facts only, in review by default', () => {
    const event = normaliseTicketmasterEvent(tm(), { capturedAt: CAPTURED });
    assert.deepEqual(event, {
        id: 'tm:G5vYZ0001', source: 'ticketmaster', sourceUrl: 'https://www.ticketmaster.com.au/event/G5vYZ0001',
        capturedAt: '2026-10-22T01:00:00.000Z', status: 'review', title: 'Sample Band Live', category: 'live-music',
        start: '2026-10-22T09:00:00.000Z', venueName: 'Sample Hall', lat: -37.812, lng: 144.965,
        priceFrom: 45, isFree: false, ticketUrl: 'https://www.ticketmaster.com.au/event/G5vYZ0001', exposure: null,
        adultsOnly: false,
    });
});

test('falls back to local date and time in the event timezone', () => {
    const raw = tm();
    delete raw.dates.start.dateTime;
    assert.equal(normaliseTicketmasterEvent(raw).start, '2026-10-22T09:00:00.000Z');
});

test('drops events that cannot be placed honestly', () => {
    const drop = [
        tm({ dates: { ...tm().dates, status: { code: 'canceled' } } }),
        tm({ dates: { ...tm().dates, status: { code: 'postponed' } } }),
        tm({ dates: { start: { localDate: '2026-10-22', timeTBA: true }, status: { code: 'onsale' } } }),
        tm({ _embedded: { venues: [{ name: 'No location' }] } }),
        tm({ classifications: [{ primary: true, segment: { name: 'Sports' } }] }),
        tm({ name: '   ' }),
        tm({ id: '' }),
        null,
    ];
    for (const raw of drop) assert.equal(normaliseTicketmasterEvent(raw), null);
});

test('maps classifications to the four launch categories', () => {
    assert.equal(ticketmasterCategory([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }]), 'comedy');
    assert.equal(ticketmasterCategory([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' } }]), 'theatre');
    assert.equal(ticketmasterCategory([{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Musical' } }]), 'theatre');
    assert.equal(ticketmasterCategory([{ segment: { name: 'Arts & Theatre' }, genre: { name: "Children's Theatre" } }]), 'family');
    assert.equal(ticketmasterCategory([{ segment: { name: 'Music' }, family: true }]), 'family');
    assert.equal(ticketmasterCategory([{ segment: { name: 'Film' } }]), null);
    // Shapes seen in the live feed on 22 Oct 2026.
    assert.equal(ticketmasterCategory([{ primary: true, segment: { name: 'Arts & Theatre' }, genre: { name: 'Variety' }, subGenre: { name: 'Cabaret' }, family: false }]), 'theatre');
    assert.equal(ticketmasterCategory([{ primary: true, segment: { name: 'Undefined' }, genre: { name: 'Undefined' }, family: false }]), null);
    assert.equal(ticketmasterCategory([{ primary: false, segment: { name: 'Sports' } }, { primary: true, segment: { name: 'Music' } }]), 'live-music');
    assert.equal(ticketmasterCategory(undefined), null);
});

test('price: from the lowest AUD range; free only when every range is $0; unknown stays null', () => {
    assert.equal(normaliseTicketmasterEvent(tm({ priceRanges: [{ currency: 'AUD', min: 0, max: 0 }] })).isFree, true);
    const none = normaliseTicketmasterEvent(tm({ priceRanges: undefined }));
    assert.equal(none.isFree, null);
    assert.equal(none.priceFrom, null);
    const usd = normaliseTicketmasterEvent(tm({ priceRanges: [{ currency: 'USD', min: 10, max: 20 }] }));
    assert.equal(usd.priceFrom, null);
});

test('only https links are kept', () => {
    const event = normaliseTicketmasterEvent(tm({ url: 'http://example.com/x' }));
    assert.equal(event.ticketUrl, null);
    assert.equal(event.sourceUrl, null);
});

test('response normaliser drops unusable and duplicate events', () => {
    const body = { _embedded: { events: [tm(), tm(), tm({ id: 'G2', classifications: [{ segment: { name: 'Sports' } }] }), tm({ id: 'G3' })] } };
    assert.deepEqual(normaliseTicketmasterResponse(body).map(e => e.id), ['tm:G5vYZ0001', 'tm:G3']);
    assert.deepEqual(normaliseTicketmasterResponse({}), []);
});

test('tonight runs to 5am Melbourne time, from the morning or after midnight', () => {
    const afternoon = tonightWindow(new Date('2026-10-22T03:00:00Z')); // 2pm 22 Oct
    assert.equal(afternoon.to.toISOString(), '2026-10-22T18:00:00.000Z'); // 5am 23 Oct
    const lateNight = tonightWindow(new Date('2026-10-22T14:30:00Z')); // 1:30am 23 Oct
    assert.equal(lateNight.to.toISOString(), '2026-10-22T18:00:00.000Z');
});

test('search params cover tonight around the stay', () => {
    const params = ticketmasterSearchParams({ ...CBD, radiusKm: 2.4, now: new Date('2026-10-22T03:00:00Z') });
    assert.equal(params.get('latlong'), '-37.8136,144.9631');
    assert.equal(params.get('radius'), '2');
    assert.equal(params.get('unit'), 'km');
    assert.equal(params.get('countryCode'), 'AU');
    assert.equal(params.get('startDateTime'), '2026-10-22T03:00:00Z');
    assert.equal(params.get('endDateTime'), '2026-10-22T18:00:00Z');
    assert.equal(params.has('apikey'), false, 'the key is added server-side only');
    assert.throws(() => ticketmasterSearchParams({}), RangeError);
});

const approved = (over = {}) => ({ ...normaliseTicketmasterEvent(tm(), { status: 'approved' }), ...over });

test('eventsTonight: approved, tonight, nearby, sorted by start then distance', () => {
    const now = new Date('2026-10-22T03:00:00Z'); // 2pm
    const events = [
        approved({ id: 'late', start: '2026-10-22T11:00:00.000Z' }),
        approved({ id: 'early', start: '2026-10-22T08:00:00.000Z' }),
        approved({ id: 'far', lat: -37.90, lng: 145.10 }),
        approved({ id: 'tomorrow', start: '2026-10-23T09:00:00.000Z' }),
        approved({ id: 'over', start: '2026-10-22T02:00:00.000Z' }),
        { ...approved({ id: 'review' }), status: 'review' },
    ];
    const list = eventsTonight(events, { now, origin: CBD, maxKm: 2 });
    assert.deepEqual(list.map(e => e.id), ['early', 'late']);
    assert.ok(list[0].distanceMetres > 200 && list[0].distanceMetres < 300);
    assert.equal(list[0].walkMinutes, Math.round(list[0].distanceMetres / 80));
});

test('eventsTonight filters by category and free, and works without an origin', () => {
    const now = new Date('2026-10-22T03:00:00Z');
    const events = [approved({ id: 'gig' }), approved({ id: 'free-family', category: 'family', isFree: true }),
        approved({ id: 'unknown-price', category: 'family', isFree: null })];
    assert.deepEqual(eventsTonight(events, { now, categories: ['family'] }).map(e => e.id), ['free-family', 'unknown-price']);
    assert.deepEqual(eventsTonight(events, { now, freeOnly: true }).map(e => e.id), ['free-family']);
    assert.equal(eventsTonight(events, { now })[0].distanceMetres, null);
    assert.deepEqual(eventsTonight(null), []);
});

const hourly = (over = {}) => ({ source: 'open-meteo', hourly: {
    time: ['2026-10-22T19:00', '2026-10-22T20:00', '2026-10-22T21:00'],
    temperature_2m: [16, 14.4, 13], apparent_temperature: [15, 11.2, 10],
    precipitation_probability: [10, 20, 60], wind_speed_10m: [12, 32, 20], ...over } });

test('showtime weather reads the event start hour', () => {
    const w = showtimeWeather(approved(), hourly()); // 8pm local
    assert.equal(w.line, '14° · dry · windy');
    assert.equal(w.advice, null, 'no advice when exposure is unknown');
    const outdoor = showtimeWeather(approved({ exposure: 'outdoor' }), hourly());
    assert.equal(outdoor.advice, 'Cold and exposed: bring a jacket');
    const wet = showtimeWeather(approved({ exposure: 'outdoor', start: '2026-10-22T10:00:00.000Z' }), hourly());
    assert.equal(wet.line, '13° · 60% chance of rain · breezy');
    assert.equal(wet.advice, 'Bring a jacket or pick an indoor plan');
    assert.equal(`${wet.line} ${wet.advice}`.match(/rain/gi).length, 1, 'outdoor rain advice does not repeat the forecast');
});

test('showtime weather is null without a matching hour or with fallback weather', () => {
    assert.equal(showtimeWeather(approved({ start: '2026-10-23T09:00:00.000Z' }), hourly()), null);
    assert.equal(showtimeWeather(approved(), { ...hourly(), source: 'demo' }), null);
    assert.equal(showtimeWeather(approved(), hourly({ precipitation_probability: [10, null, 60] })), null);
    assert.equal(showtimeWeather(approved(), null), null);
});

test('wet hourly readings never display dry when the precipitation probability is low', () => {
    for (const readings of [{ weather_code: [0, 61, 0] }, { precipitation: [0, .1, 0] }]) {
        const forecast = showtimeWeather(approved(), hourly({ precipitation_probability: [0, 10, 0], ...readings }));
        assert.equal(forecast.isWet, true);
        assert.equal(forecast.line, '14° · wet at showtime · windy');
    }
    const possible = showtimeWeather(approved(), hourly({ precipitation_probability: [0, 30, 0], weather_code: [0, 61, 0] }));
    assert.equal(possible.line, '14° · 30% chance of rain · windy', 'known probabilities at 30% and above remain visible');
});

test('warm pairings: declared warmth only, nearest first, within the walk', () => {
    const event = approved();
    const venues = [
        { id: 'a', venueName: 'Fireside Pub', heating: 'fireplace', lat: -37.8135, lng: 144.9655 },
        { id: 'b', venueName: 'Heater Bar', tags: ['Heaters'], lat: -37.8122, lng: 144.9652 },
        { id: 'c', venueName: 'Cold Bar', tags: ['Beer Garden'], lat: -37.8121, lng: 144.9651 },
        { id: 'd', venueName: 'Far Fireplace', heating: 'fireplace', lat: -37.83, lng: 144.99 },
        { id: 'e', venueName: 'Says no', heating: 'no fireplace', lat: -37.8121, lng: 144.9651 },
    ];
    const pairs = warmPairings(event, venues);
    assert.deepEqual(pairs.map(p => p.id), ['b', 'a']);
    assert.equal(pairs[0].line, `Outdoor heaters at Heater Bar, ${pairs[0].distanceMetres}\u00a0m away`);
    assert.match(pairs[1].line, /^Fireplace at Fireside Pub, \d+0\u00a0m away$/);
    assert.deepEqual(warmPairings({}, venues), []);
});

const pairingVenues = () => [
    { id: 'outdoor', venueName: 'Heater Garden', tags: ['Heaters', 'Beer Garden'], lat: -37.812, lng: 144.965 },
    { id: 'mixed', venueName: 'Indoor Lounge', tags: ['Heaters', 'Indoor Warmth'], lat: -37.8122, lng: 144.965 },
    { id: 'fire', venueName: 'Fireside Pub', heating: 'fireplace', lat: -37.8124, lng: 144.965 },
    { id: 'outside-fire', venueName: 'Terrace Fire', heating: 'outdoor fireplace', lat: -37.8121, lng: 144.965 },
    { id: 'pit', venueName: 'Fire Pit Garden', tags: ['Fire Pit', 'Beer Garden'], lat: -37.812, lng: 144.965 },
];

test('a wet show excludes outdoor warmth, even when it is closer, and strips outdoor amenities from mixed venues', () => {
    const weather = hourly({ precipitation_probability: [10, 50, 60] });
    const forecast = showtimeWeather(approved(), weather);
    assert.equal(forecast.isWet, true);
    const pairs = warmPairings(approved(), pairingVenues(), { weather, forecast });
    assert.deepEqual(pairs.map(pair => pair.id), ['mixed', 'fire']);
    assert.deepEqual(pairs[0].warmth, [{ icon: 'indoor-warmth', text: 'Warm indoor space' }]);
    assert.deepEqual(pairs[1].warmth, [{ icon: 'fireplace', text: 'Fireplace inside' }]);
    assert.equal(pairs[0].line, `Warm and dry before the show: Indoor Lounge, ${pairs[0].distanceMetres}\u00a0m away`);
    assert.deepEqual(warmPairings(approved(), [pairingVenues()[0]], { weather }), []);
});

test('wet showtime detection uses the event hour, observed hourly precipitation or wet WMO code, never another hour', () => {
    for (const readings of [
        { precipitation_probability: [80, 50, 20] },
        { precipitation: [0, .1, 0] },
        { weather_code: [0, 61, 0] },
        { weather_code_raw: [0, 95, 0], weather_code: [0, 0, 0] },
    ]) {
        const weather = hourly(readings);
        assert.equal(showtimeWeather(approved(), weather).isWet, true);
        assert.deepEqual(warmPairings(approved(), pairingVenues(), { weather }).map(pair => pair.id), ['mixed', 'fire']);
    }
    const dry = hourly({ precipitation_probability: [100, 49, 100], precipitation: [.5, 0, .5], weather_code: [61, 0, 61] });
    assert.equal(showtimeWeather(approved(), dry).isWet, false);
    assert.deepEqual(warmPairings(approved(), pairingVenues(), { weather: dry }), warmPairings(approved(), pairingVenues()));
});

test('rain now keeps pairings indoors without claiming rain at a dry showtime', () => {
    for (const current of [{ precipitation: .2 }, { weather: [{ main: 'Rain' }] }, { weather: [{ main: 'Drizzle' }] }]) {
        const weather = { ...hourly(), ...current };
        const forecast = showtimeWeather(approved(), weather);
        assert.equal(forecast.isWet, false);
        assert.deepEqual(warmPairings(approved(), pairingVenues(), { weather, forecast }).map(pair => pair.id), ['mixed', 'fire']);
    }
});

test('dry or missing forecast keeps existing pairings; partial wet data still prevents outdoor tips', () => {
    const venues = pairingVenues();
    const before = warmPairings(approved(), venues);
    assert.deepEqual(warmPairings(approved(), venues, { weather: hourly() }), before);
    for (const weather of [null, {}, { ...hourly(), source: 'demo', precipitation: 1 }, { ...hourly(), unavailable: true, precipitation: 1 }]) {
        assert.deepEqual(warmPairings(approved(), venues, { weather }), before);
    }
    const partial = hourly({ temperature_2m: [null, null, null], precipitation_probability: [10, 80, 20] });
    assert.equal(showtimeWeather(approved(), partial), null);
    assert.deepEqual(warmPairings(approved(), venues, { weather: partial }).map(pair => pair.id), ['mixed', 'fire']);
});

test('distanceMetres is symmetric and roughly right', () => {
    const d = distanceMetres(CBD, { lat: -37.8226, lng: 144.9631 });
    assert.ok(Math.abs(d - 1000) < 5, String(d));
    assert.equal(Math.round(distanceMetres(CBD, { lat: -37.8226, lng: 144.9631 })), Math.round(distanceMetres({ lat: -37.8226, lng: 144.9631 }, CBD)));
});

test('age limits in titles mark an event adults-only', () => {
    for (const name of ['The House Soiree (18+ Event)', 'Late Show 18 +', 'R18 Comedy', 'Adults only trivia', 'Over 18s night'])
        assert.equal(normaliseTicketmasterEvent(tm({ name })).adultsOnly, true, name);
    for (const name of ['Sample Band Live', 'Class of 2018 reunion gig', 'Top 180 hits'])
        assert.equal(normaliseTicketmasterEvent(tm({ name })).adultsOnly, false, name);
});

test('fetchEventsTonight calls the function with tonight\'s window and normalises the reply', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ _embedded: { events: [tm()] }, fetchedAt: '2026-10-22T03:00:00.000Z' }) };
    };
    const result = await fetchEventsTonight({ supabaseUrl: 'https://x.supabase.co/', anonKey: 'anon', origin: CBD,
        now: new Date('2026-10-22T03:00:00Z'), fetchImpl });
    assert.equal(result.ok, true);
    assert.deepEqual(result.events.map(e => [e.id, e.status]), [['tm:G5vYZ0001', 'approved']]);
    assert.equal(result.fetchedAt, '2026-10-22T03:00:00.000Z');
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/functions/v1/events-tonight');
    assert.deepEqual(Object.fromEntries(url.searchParams), { lat: '-37.8136', lng: '144.9631', radius: '3',
        start: '2026-10-22T03:00:00Z', end: '2026-10-22T18:00:00Z' });
    assert.equal(calls[0].init.headers.Authorization, 'Bearer anon');
});

test('fetchEventsTonight reports errors without throwing', async () => {
    const fail = (status, body) => async () => ({ ok: false, status, json: async () => body });
    const base = { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', origin: CBD };
    assert.equal((await fetchEventsTonight({ ...base, fetchImpl: fail(503, { error: 'quota_exhausted' }) })).error, 'quota_exhausted');
    assert.equal((await fetchEventsTonight({ ...base, fetchImpl: fail(500, null) })).error, 'http_500');
    assert.equal((await fetchEventsTonight({ ...base, fetchImpl: async () => { throw new TypeError('x'); } })).error, 'network');
    assert.equal((await fetchEventsTonight({ ...base, origin: null })).error, 'missing_origin');
    assert.equal((await fetchEventsTonight({ origin: CBD })).error, 'missing_supabase');
});
