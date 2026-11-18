import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoVenues } from '../data/demoVenues.js';
import { heatingConflict } from './partnerWalkthrough.js';
import { getBadgeState } from './dataBadgeState.js';
import { readMicroclimate } from './microclimate.js';
import { freshMicroclimateEntry } from './microclimateProvenance.js';
import {
    clockLabel, nextService, parseListedHours, partnerDataStatus, partnerServiceHours, partnerTodayTasks,
    partnerTodayView, serviceWeather, venueDateLabel,
} from './partnerToday.js';

const byId = id => demoVenues.find(venue => venue.id === id);
const tulk = byId('dv-20');          // Library cafe, "Mon–Fri 8am–5pm; Sat–Sun 8:30am–5pm." (checked)
const laLaLand = byId('dv-25');      // Bar, "Sun–Wed 5pm–1am; Thu–Sat 5pm–3am." (checked)
const arbory = byId('dv-22');        // "Seasonal operation on the Yarra — check the venue website…"

// Monday 19 October 2026, Melbourne daylight time (UTC+11).
const melbourne = (day, hour, minute = 0) => new Date(Date.UTC(2026, 9, day, hour - 11, minute));

/** A raw Open-Meteo-style forecast for 19–20 Oct; `at(day, hour)` overrides any hour. */
function forecast(at = () => ({})) {
    const time = [], hourly = { time, temperature_2m: [], precipitation_probability: [], weather_code: [], is_day: [] };
    for (const day of [19, 20]) {
        for (let hour = 0; hour < 24; hour++) {
            const row = { temp: 23, rain: 0, code: 0, ...at(day, hour) };
            time.push(`2026-10-${day}T${String(hour).padStart(2, '0')}:00`);
            hourly.temperature_2m.push(row.temp);
            hourly.precipitation_probability.push(row.rain);
            hourly.weather_code.push(row.code);
            hourly.is_day.push(hour >= 7 && hour <= 19 ? 1 : 0);
        }
    }
    return { hourly, daily: { time: ['2026-10-19', '2026-10-20'], sunrise: ['2026-10-19T06:22', '2026-10-20T06:21'], sunset: ['2026-10-19T19:44', '2026-10-20T19:45'] } };
}
const sunny = forecast();
const rainyEvening = forecast((day, hour) => ({ temp: 14, code: 3, rain: day === 19 && hour >= 18 ? 80 : 10, ...(day === 19 && hour >= 18 ? { code: 63 } : {}) }));

test('scenario: sunny lunch at a cafe that is open now', () => {
    const view = partnerTodayView({ venue: tulk, forecast: sunny, now: melbourne(19, 12, 15) });
    assert.equal(view.dateLabel, 'Monday 19 October');
    assert.equal(view.service.status, 'open');
    assert.equal(view.service.label, 'Open now · until 5pm');
    assert.equal(view.service.span, '8am–5pm');
    assert.equal(view.service.source, 'listing');
    assert.deepEqual(view.weather, { kind: 'sun', icon: 'sun', text: 'Sunny, 23°', detail: 'Dry through service' });
    assert.equal(view.forecastMissing, false);

    const tasks = partnerTodayTasks({ venue: tulk, heatingConflict: heatingConflict(tulk) });
    assert.deepEqual(tasks.map(task => task.key), ['heating', 'special', 'guest']);
    assert.ok(tasks.every(task => !task.done));
});

test('scenario: rainy evening at a bar that opens at 5pm', () => {
    const view = partnerTodayView({ venue: laLaLand, forecast: rainyEvening, now: melbourne(19, 16, 10) });
    assert.equal(view.service.status, 'today');
    assert.equal(view.service.label, 'Opens 5pm tonight');
    assert.equal(view.service.span, '5pm–1am');
    assert.deepEqual(view.weather, { kind: 'rain', icon: 'rain', text: 'Rain likely from 6pm', detail: '80% chance · 14°' });
    assert.equal(view.tip.text, 'Rain is forecast during service. Plan for wet arrivals and check any outdoor seating.');
    assert.equal(view.tip.icon, 'umbrella');

    // A special saved on this device ticks its task off and quotes it back.
    const tasks = partnerTodayTasks({ venue: laLaLand, tools: { happyHour: { deal: 'Hot toddies $14' } }, guestChecked: true });
    assert.deepEqual(tasks.map(({ key, done }) => [key, done]), [['special', true], ['guest', true]]);
    assert.equal(tasks[0].detail, '“Hot toddies $14”');
});

test('scenario: missing hours, weather and amenity data are asked for, never guessed', () => {
    assert.equal(partnerServiceHours(arbory), null);
    const view = partnerTodayView({ venue: arbory, forecast: null, now: melbourne(19, 12, 15) });
    assert.equal(view.service, null);
    assert.equal(view.weather, null);
    assert.equal(view.tip, null);
    assert.equal(view.forecastMissing, true);
    assert.deepEqual(partnerTodayTasks({ venue: arbory, hoursKnown: false }).map(task => task.key), ['hours', 'special', 'guest']);

    // A bare listing: no features to show, so the setup task appears.
    const bare = { id: 'bare', venueName: 'New Place' };
    assert.deepEqual(partnerTodayTasks({ venue: bare, hoursKnown: false }).map(task => task.key), ['hours', 'special', 'setup', 'guest']);
    // Outdoor setup saved in the preview counts as features.
    assert.ok(!partnerTodayTasks({ venue: bare, tools: { outdoor: { umbrellas: true } } }).some(task => task.key === 'setup'));

    // Hours known but the forecast failed or is demo data: no weather line.
    const noForecast = partnerTodayView({ venue: tulk, forecast: { source: 'demo', hourly: sunny.hourly }, now: melbourne(19, 12) });
    assert.equal(noForecast.service.label, 'Open now · until 5pm');
    assert.equal(noForecast.weather, null);
    assert.equal(noForecast.forecastMissing, true);
});

test('listing hours are read only when every part is plain', () => {
    assert.deepEqual(parseListedHours('Mon–Fri 8am–5pm; Sat–Sun 8:30am–5pm.'), {
        mon: { open: '08:00', close: '17:00', closed: false }, tue: { open: '08:00', close: '17:00', closed: false },
        wed: { open: '08:00', close: '17:00', closed: false }, thu: { open: '08:00', close: '17:00', closed: false },
        fri: { open: '08:00', close: '17:00', closed: false }, sat: { open: '08:30', close: '17:00', closed: false },
        sun: { open: '08:30', close: '17:00', closed: false },
    });
    const bar = parseListedHours('Tue–Fri 3pm–late; Sat 12pm–late; Sun 3pm–late; closed Mon.');
    assert.deepEqual(bar.mon, { open: '', close: '', closed: true });
    assert.deepEqual(bar.sat, { open: '12:00', close: '24:00', closed: false, late: true });
    assert.deepEqual(parseListedHours('Daily 12pm–1am.').sun, { open: '12:00', close: '01:00', closed: false });
    assert.deepEqual(parseListedHours('Weekdays 7am–3:30pm; weekends 8am–3:30pm.').sat, { open: '08:00', close: '15:30', closed: false });
    assert.deepEqual(parseListedHours('Sun–Wed 10am–midnight').tue, { open: '10:00', close: '24:00', closed: false });
    for (const text of ['Daily from 4pm.', 'Seasonal operation on the Yarra — check the venue website before visiting.',
        'Rooftop: Fri 5pm–late', 'Sun–Wed 10am–midnight; Thu–Sat 10am–1am. Kitchen lunch Wed–Sun 12–2:30pm', '', null, 'Mon 5pm–5pm']) {
        assert.equal(parseListedHours(text), null, String(text));
    }
});

test('the partner’s own hours win over the listing, and an unchecked listing says so', () => {
    const own = { mon: { open: '11:00', close: '15:00', closed: false } };
    assert.deepEqual(partnerServiceHours({ ...tulk, hours: own }), { hours: own, source: 'set' });
    assert.equal(partnerServiceHours({ opening_hours: 'Daily 12pm–1am.' }).source, 'listing-unconfirmed');
    // An all-blank editor map doesn't count as hours.
    assert.equal(partnerServiceHours({ hours: { mon: { open: '', close: '', closed: false } } }), null);
});

test('next service covers overnight closes, late nights, tomorrow and later days', () => {
    const hours = parseListedHours('Sun–Wed 5pm–1am; Thu–Sat 5pm–3am.');
    const afterMidnight = nextService({ hours, now: melbourne(20, 0, 30) }); // Tue 12:30am, Monday's service
    assert.equal(afterMidnight.label, 'Open now · until 1am');
    assert.equal(afterMidnight.end.toISOString(), melbourne(20, 1).toISOString());

    const late = nextService({ hours: parseListedHours('Daily 3pm–late'), now: melbourne(19, 21) });
    assert.equal(late.label, 'Open now · until late');
    assert.equal(late.span, '3pm–late');
    assert.equal(late.end.toISOString(), melbourne(20, 0).toISOString());

    assert.equal(nextService({ hours: parseListedHours('Mon–Fri 8am–5pm'), now: melbourne(19, 18) }).label, 'Opens 8am tomorrow');
    assert.equal(nextService({ hours: parseListedHours('Thu 11:30am–3pm'), now: melbourne(19, 18) }).label, 'Opens Thu 11:30am');
    assert.equal(nextService({ hours: parseListedHours('Mon 11am–3pm'), now: melbourne(19, 9) }).label, 'Opens 11am today');
    assert.equal(nextService({ hours: { mon: { open: '', close: '', closed: true } }, now: melbourne(19, 9) }), null);
    assert.equal(nextService({ hours: null, now: melbourne(19, 9) }), null);
});

test('service weather speaks for the service window only', () => {
    const start = melbourne(19, 17), end = melbourne(20, 1);
    assert.equal(serviceWeather({ forecast: rainyEvening, start, end, now: melbourne(19, 16) }).text, 'Rain likely from 6pm');
    assert.equal(serviceWeather({ forecast: rainyEvening, start: melbourne(19, 18), end, now: melbourne(19, 18, 30) }).text, 'Rain likely during service');
    assert.deepEqual(serviceWeather({ forecast: sunny, start: melbourne(19, 21), end: melbourne(19, 23), now: melbourne(19, 12) }),
        { kind: 'clear', icon: 'night', text: 'Clear and dry, 23°', detail: null });
    const cloudy = forecast(() => ({ code: 3, temp: 17.6 }));
    assert.equal(serviceWeather({ forecast: cloudy, start, end, now: start }).text, 'Cloudy and dry, 18°');
    assert.equal(serviceWeather({ forecast: sunny, start: melbourne(22, 12), end: melbourne(22, 15), now: melbourne(19, 12) }).kind, 'beyond');
    assert.equal(serviceWeather({ forecast: null, start, end, now: start }), null);
});

test('labels', () => {
    assert.equal(clockLabel(0 + 60 * 17), '5pm');
    assert.equal(clockLabel(8 * 60 + 30), '8:30am');
    assert.equal(clockLabel(1440), 'midnight');
    assert.equal(clockLabel(25 * 60), '1am');
    assert.equal(venueDateLabel(melbourne(20, 9)), 'Tuesday 20 October');
});

test('an expired venue reading and a fresh service forecast each get their own status', () => {
    const now = melbourne(19, 12, 15);
    // Young enough by age alone (35 min), but past its own expiry at 12:10pm.
    const expired = { id: 'dv-20', sun_now: 0.92, effective_sun: 0.92,
        weather_computed_at: new Date(now - 35 * 60000).toISOString(), expires_at: new Date(now - 5 * 60000).toISOString() };
    const status = partnerDataStatus({ forecastFetchedAt: now.getTime() - 2 * 60000, reading: expired, now });
    assert.deepEqual([status.forecast.label, status.forecast.sublabel, status.forecast.isLive], ['Forecast', 'Updated 2 min ago', false]);
    assert.equal(status.reading.status, 'expired');
    assert.equal(status.reading.text, 'Venue reading expired at 12:10pm · left off your guest card until it refreshes');
    // Read raw, the row would call itself live; the guest card reads only fresh rows.
    assert.equal(readMicroclimate(expired, null, now).isLiveSun, true);
    const onCard = freshMicroclimateEntry({ 'dv-20': expired }, 'dv-20', now);
    assert.equal(onCard, null);
    assert.equal(readMicroclimate(onCard, null, now).isLiveSun, false);
    assert.equal(readMicroclimate(onCard, null, now).available, false);
});

test('a fresh venue reading next to an older forecast keeps each its own age', () => {
    const now = melbourne(19, 12, 15);
    const fresh = { id: 'dv-20', sun_now: 0.9, weather_computed_at: new Date(now - 12 * 60000).toISOString() };
    const status = partnerDataStatus({ forecastFetchedAt: new Date(now - 50 * 60000).toISOString(), reading: fresh, now });
    assert.equal(status.forecast.sublabel, 'Updated 50 min ago');
    assert.deepEqual(status.reading, { status: 'fresh', updatedAt: now.getTime() - 12 * 60000, text: 'Venue reading · on your guest card' });
    assert.equal(getBadgeState({ kind: 'calculated', updatedAt: status.reading.updatedAt, now }).sublabel, 'Updated 12 min ago');
    assert.equal(freshMicroclimateEntry({ 'dv-20': fresh }, 'dv-20', now), fresh);
});

test('a reading over an hour old is stale without an expiry time; no data claims nothing', () => {
    const now = melbourne(19, 12, 15);
    const old = { id: 'dv-20', sun_now: 0.9, weather_computed_at: new Date(now - 95 * 60000).toISOString() };
    const status = partnerDataStatus({ reading: old, now });
    assert.equal(status.reading.text, 'Venue reading from 10:40am is over an hour old · left off your guest card until it refreshes');
    assert.equal(status.forecast, null);
    assert.equal(partnerDataStatus({ reading: { id: 'dv-20', sun_now: 0.9 }, now }).reading.text,
        'Venue reading has no update time · left off your guest card until it refreshes');
    assert.deepEqual(partnerDataStatus({ now }), { forecast: null, reading: null });
});
