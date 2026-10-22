import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateVenueEvent, venueEventsTonight } from './venueEvents.js';
import { eventsTonight, showtimeWeather, warmPairings } from './afterDarkEvents.js';

// 22 Oct 2026 is a Thursday (weekday 4), AEDT (UTC+11).
const THU_2PM = new Date('2026-10-22T03:00:00Z');
const venues = [
    { id: 'pub', venueName: 'Fireside Pub', lat: -37.8135, lng: 144.9655, heating: 'fireplace' },
    { id: 'nowhere', venueName: 'No location' },
];
const trivia = (over = {}) => ({ venueId: 'pub', title: 'Pub trivia', category: 'comedy', startTime: '19:30', weekdays: [4], ...over });

test('validates a weekly entry and fills safe defaults', () => {
    const r = validateVenueEvent(trivia({ title: '  Pub   trivia ', weekdays: [4, 4, 9] }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.entry, { key: 'pub-trivia', venueId: 'pub', title: 'Pub trivia', category: 'comedy', startTime: '19:30',
        weekdays: [4], skipDates: [], exposure: null, isFree: null, priceFrom: null, adultsOnly: false, sourceUrl: null,
        status: 'review', updatedAt: null });
});

test('explains what is wrong in plain words', () => {
    const r = validateVenueEvent({ venueId: '', title: 'x', category: 'sport', startTime: '7pm', date: '2026-10-22', weekdays: [1], priceFrom: -5, sourceUrl: 'http://x' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors, ['Give the event a name (3–80 characters).', 'Choose live music, comedy, theatre or family.',
        'Add a start time like 19:30.', 'Choose a date or weekly days, not both.', 'Missing venue.',
        'Price must be a number from 0.', 'Event links must start with https://.']);
    assert.deepEqual(validateVenueEvent(trivia({ weekdays: [] })).errors, ['Choose a date or the days it runs each week.']);
    assert.deepEqual(validateVenueEvent(trivia({ weekdays: undefined, date: '2026-02-30' })).errors, ['Use a real date.']);
});

test('price: $0 or free means free; a price means paid; nothing means unknown', () => {
    assert.equal(validateVenueEvent(trivia({ priceFrom: 0 })).entry.isFree, true);
    assert.equal(validateVenueEvent(trivia({ isFree: true, priceFrom: 20 })).entry.priceFrom, 0);
    assert.equal(validateVenueEvent(trivia({ priceFrom: 15 })).entry.isFree, false);
    assert.equal(validateVenueEvent(trivia()).entry.isFree, null);
});

test('weekly entries appear on their night, at the venue, in the shared shape', () => {
    const [event] = venueEventsTonight([trivia({ status: 'approved', exposure: 'indoor' })], venues, { now: THU_2PM });
    assert.deepEqual(event, { id: 'venue:pub:pub-trivia:2026-10-22', source: 'venue', sourceUrl: null, capturedAt: null,
        status: 'approved', title: 'Pub trivia', category: 'comedy', start: '2026-10-22T08:30:00.000Z', venueId: 'pub',
        venueName: 'Fireside Pub', lat: -37.8135, lng: 144.9655, priceFrom: null, isFree: null, ticketUrl: null,
        exposure: 'indoor', adultsOnly: false });
    assert.deepEqual(venueEventsTonight([trivia({ weekdays: [2] })], venues, { now: THU_2PM }), []);
});

test('one-off dates, skipped nights, unknown venues and invalid entries', () => {
    assert.equal(venueEventsTonight([trivia({ weekdays: undefined, date: '2026-10-22' })], venues, { now: THU_2PM }).length, 1);
    assert.equal(venueEventsTonight([trivia({ weekdays: undefined, date: '2026-10-23' })], venues, { now: THU_2PM }).length, 0);
    assert.equal(venueEventsTonight([trivia({ skipDates: ['2026-10-22'] })], venues, { now: THU_2PM }).length, 0);
    assert.equal(venueEventsTonight([trivia({ venueId: 'nowhere' }), trivia({ venueId: 'gone' })], venues, { now: THU_2PM }).length, 0);
    assert.equal(venueEventsTonight([{ title: 'broken' }, null], venues, { now: THU_2PM }).length, 0);
});

test('a 12:30am start belongs to the night before, also when checked after midnight', () => {
    const late = trivia({ title: 'Late DJ set', category: 'live-music', startTime: '00:30' });
    const evening = venueEventsTonight([late], venues, { now: THU_2PM });
    assert.equal(evening[0].start, '2026-10-22T13:30:00.000Z'); // Fri 23 Oct 12:30am
    const afterMidnight = venueEventsTonight([late], venues, { now: new Date('2026-10-22T13:10:00Z') }); // Fri 12:10am
    assert.equal(afterMidnight[0].id, 'venue:pub:late-dj-set:2026-10-22');
    // Thursday's entry is not Friday night's.
    assert.equal(venueEventsTonight([late], venues, { now: new Date('2026-10-23T03:00:00Z') }).length, 0);
});

test('shows that already started more than 30 minutes ago drop off', () => {
    assert.equal(venueEventsTonight([trivia()], venues, { now: new Date('2026-10-22T09:05:00Z') }).length, 0); // 8:05pm
    assert.equal(venueEventsTonight([trivia()], venues, { now: new Date('2026-10-22T08:55:00Z') }).length, 1); // 7:55pm
});

test('venue events flow through the shared engine: review gate, outdoor advice, warm pairing', () => {
    const entries = [trivia(), trivia({ key: 'garden', title: 'Beer garden acoustic', category: 'live-music', status: 'approved', exposure: 'outdoor', startTime: '20:00' })];
    const occurrences = venueEventsTonight(entries, venues, { now: THU_2PM });
    const shown = eventsTonight(occurrences, { now: THU_2PM, origin: { lat: -37.8136, lng: 144.9631 } });
    assert.deepEqual(shown.map(e => e.title), ['Beer garden acoustic'], 'the entry still in review is hidden');
    const weather = { source: 'open-meteo', hourly: { time: ['2026-10-22T20:00'], temperature_2m: [12], apparent_temperature: [9],
        precipitation_probability: [10], wind_speed_10m: [15] } };
    assert.equal(showtimeWeather(shown[0], weather).advice, 'Cold and exposed: bring a jacket');
    // The garden gig is at Fireside Pub itself, so the pub is not offered as its warm pairing...
    assert.deepEqual(warmPairings(shown[0], venues), []);
    // ...but a warm pub next door is.
    const nextDoor = [...venues, { id: 'bar', venueName: 'Heater Bar', tags: ['Heaters'], lat: -37.8137, lng: 144.9657 }];
    assert.equal(warmPairings(shown[0], nextDoor)[0].name, 'Heater Bar');
});

test('the same show from Ticketmaster and the venue appears once, with the best of both', async () => {
    const { dedupeEvents, isSameEvent } = await import('./afterDarkEvents.js');
    const venueGig = venueEventsTonight([trivia({ title: 'The Murlocs live', category: 'live-music', startTime: '20:00', exposure: 'outdoor', status: 'approved' })], venues, { now: THU_2PM })[0];
    const tmGig = { id: 'tm:1', source: 'ticketmaster', title: 'The Murlocs (18+)', start: '2026-10-22T09:15:00.000Z', lat: -37.8136, lng: 144.9656,
        ticketUrl: 'https://www.ticketmaster.com.au/x', priceFrom: 49, isFree: false, adultsOnly: true, status: 'approved', category: 'live-music' };
    const other = { ...tmGig, id: 'tm:2', title: 'Comedy Gala' };
    assert.equal(isSameEvent(venueGig, tmGig), true);
    assert.equal(isSameEvent(venueGig, other), false, 'different title');
    assert.equal(isSameEvent(venueGig, { ...tmGig, start: '2026-10-22T11:00:00.000Z' }), false, 'different time');
    assert.equal(isSameEvent(venueGig, { ...tmGig, lat: -37.82 }), false, 'different place');
    const merged = dedupeEvents([tmGig, venueGig, other]);
    assert.deepEqual(merged.map(e => e.id), [venueGig.id, 'tm:2']);
    assert.equal(merged[0].exposure, 'outdoor', 'the venue knows it is outdoors');
    assert.equal(merged[0].ticketUrl, 'https://www.ticketmaster.com.au/x');
    assert.equal(merged[0].priceFrom, 49);
    assert.equal(merged[0].adultsOnly, true);
    assert.deepEqual(merged[0].alsoListedBy, ['ticketmaster']);
});
