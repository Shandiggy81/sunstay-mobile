import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    distanceMetres, eventsTonight, normaliseTicketmasterEvent, normaliseTicketmasterResponse,
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
    assert.match(wet.advice, /^Rain likely/);
});

test('showtime weather is null without a matching hour or with fallback weather', () => {
    assert.equal(showtimeWeather(approved({ start: '2026-10-23T09:00:00.000Z' }), hourly()), null);
    assert.equal(showtimeWeather(approved(), { ...hourly(), source: 'demo' }), null);
    assert.equal(showtimeWeather(approved(), hourly({ precipitation_probability: [10, null, 60] })), null);
    assert.equal(showtimeWeather(approved(), null), null);
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
    assert.equal(pairs[0].line, `Outdoor heaters at Heater Bar, ${pairs[0].distanceMetres} m away`);
    assert.match(pairs[1].line, /^Fireplace at Fireside Pub, \d+0 m away$/);
    assert.deepEqual(warmPairings({}, venues), []);
});

test('distanceMetres is symmetric and roughly right', () => {
    const d = distanceMetres(CBD, { lat: -37.8226, lng: 144.9631 });
    assert.ok(Math.abs(d - 1000) < 5, String(d));
    assert.equal(Math.round(distanceMetres(CBD, { lat: -37.8226, lng: 144.9631 })), Math.round(distanceMetres({ lat: -37.8226, lng: 144.9631 }, CBD)));
});
