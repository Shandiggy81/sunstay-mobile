import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseVenueDateTime, venueHour, venueTimeAt, venueTimeParts, venueUtcOffsetSeconds } from './venueTime.js';
import { getSunData } from './getSunData.js';
import { sunMomentsFromDay } from './sunMoments.js';
import { venueDayBounds } from './balconySunEngine.js';
import { venueSunForecast } from './venueSun.js';

const ZONE = 'Australia/Melbourne';
const VIEWERS = ['Australia/Melbourne', 'Europe/London', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Auckland'];

describe('explicit venue time', () => {
    it('resolves Melbourne clock times across the 4 October 2026 DST change', () => {
        assert.equal(venueTimeAt('2026-10-04', 1.5).toISOString(), '2026-10-03T15:30:00.000Z');
        assert.equal(venueTimeAt('2026-10-04', 6).toISOString(), '2026-10-03T19:00:00.000Z');
        assert.equal(venueUtcOffsetSeconds(venueTimeAt('2026-10-04', 1.5)), 36000);
        assert.equal(venueUtcOffsetSeconds(venueTimeAt('2026-10-04', 6)), 39600);
        assert.throws(() => venueTimeAt('2026-10-04', 2.5), RangeError, '2:30am did not exist');
        assert.equal(venueHour(venueTimeAt('2026-10-04', 14.5)), 14.5);
        assert.equal(venueTimeParts(new Date('2026-10-03T14:30:00Z')).date, '2026-10-04');
        assert.equal(parseVenueDateTime('2026-10-04T06:00').toISOString(), '2026-10-03T19:00:00.000Z');
        assert.equal(parseVenueDateTime('2026-10-04T02:30'), null);
        assert.equal(parseVenueDateTime('not a date'), null);
        assert.equal(parseVenueDateTime('2026-10-04T06:00:00+11:00').toISOString(), '2026-10-03T19:00:00.000Z');
    });

    it('keeps morning coffee at 6–10am on the 23-hour DST day, not 7–11am', () => {
        const date = '2026-10-04';
        const bounds = venueDayBounds(date, ZONE);
        const daily = { date, dayStart: bounds.start, dayEnd: bounds.end, totalMinutes: 300,
            windows: [{ start: venueTimeAt(date, 6), end: venueTimeAt(date, 11) }] };
        const coffee = sunMomentsFromDay({ daily, timeZone: ZONE }).moments[0];
        assert.equal(venueHour(coffee.windows[0].start), 6);
        assert.equal(venueHour(coffee.windows[0].end), 10);
        assert.equal((coffee.windows[0].end - coffee.windows[0].start) / 60000, 240);
    });

    it('uses each event’s venue offset before the DST jump, not the current weather offset', () => {
        const now = new Date('2026-10-03T14:30:00Z'); // 00:30 AEST, sunrise will be AEDT
        const venue = { lat: -37.8136, lng: 144.9631, timeZone: ZONE };
        const sun = getSunData(venue.lat, venue.lng, { now });
        const forecast = venueSunForecast({ venue, now, weather: { utcOffsetSeconds: 36000 } });
        assert.equal(forecast.nowHour, 0.5);
        assert.equal(forecast.sunriseHour, sun.startHour);
        assert.equal(forecast.sunsetHour, sun.endHour);
        assert.equal(venueUtcOffsetSeconds(sun.sunriseDate), 39600);
    });

    it('rejects invalid coordinates and unavailable polar events instead of inventing daylight', () => {
        assert.equal(getSunData(NaN, 144.96), null);
        assert.equal(getSunData(-91, 144.96), null);
        assert.equal(getSunData(90, 0, { now: new Date('2026-06-21T12:00:00Z') }), null);
    });

    it('keeps sun geometry, headlines, remaining sun, moments and forecast hours identical for five viewer timezones', () => {
        // Separate processes prevent cached engine results or a global TZ change
        // from making this pass without actually exercising each viewer clock.
        const source = `
            import { getSunData } from './src/utils/getSunData.js';
            import { venueTimeAt } from './src/utils/venueTime.js';
            import { venueLocalDate, calculateBalconySunDay } from './src/utils/balconySunEngine.js';
            import { outdoorSunDay, sunMomentsFromDay } from './src/utils/sunMoments.js';
            import { outdoorSunSummary } from './src/utils/outdoorSunSummary.js';
            import { venueSunForecast, hourlyStrip, sunStatText, sunSentence } from './src/utils/venueSun.js';
            import { generateHourlyForecast } from './src/data/windIntelligence.js';
            import { toUnixTimestamp } from './src/utils/weatherService.js';
            const timeZone = 'Australia/Melbourne';
            const venue = { lat: -37.8136, lng: 144.9631, timeZone, vibe: 'Cafe' };
            const output = ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-19'].map(date => {
                const now = venueTimeAt(date, 13);
                const sun = getSunData(venue.lat, venue.lng, { now, timeZone });
                if (!sun || venueLocalDate(sun.sunriseDate, timeZone) !== date) throw new Error('Missing/wrong daylight day');
                const time = Array.from({ length: 24 }, (_, h) => date + 'T' + String(h).padStart(2, '0') + ':00');
                // No response offset: this must still use the venue, not browser.
                const weather = { hourly: { time, temperature_2m: time.map(() => 23), cloud_cover: time.map(() => 0),
                    precipitation_probability: time.map(() => 0), weather_code: time.map(() => 0) } };
                const forecast = venueSunForecast({ venue, now, weather });
                if (forecast.nowHour !== 13) throw new Error('Not 1pm venue time');
                const daily = outdoorSunDay({ ...venue, horizon: Array(36).fill(0), date });
                const room = calculateBalconySunDay({ ...venue, facing: 0, obstructions: [], date });
                return { sun, providerSunrise: toUnixTimestamp(date + 'T06:30'), room: room.windows, daily: daily.windows,
                    moments: sunMomentsFromDay({ daily, forecast, timeZone }),
                    summary: outdoorSunSummary({ daily, forecast, now, timeZone }),
                    stat: sunStatText(forecast), sentence: sunSentence(forecast),
                    hours: hourlyStrip(weather, { now, forecast, timeZone }),
                    comfortHours: generateHourlyForecast(20, 2, 50, venue, null, null, { now }).map(h => [h.hour, h.label, h.temp, h.wind]),
                };
            });
            console.log(JSON.stringify(output));
        `;
        const run = timeZone => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', source], {
            cwd: new URL('../../', import.meta.url), env: { ...process.env, TZ: timeZone }, encoding: 'utf8', timeout: 15000,
        }));
        const baseline = run(VIEWERS[0]);
        for (const viewer of VIEWERS.slice(1)) assert.deepEqual(run(viewer), baseline, viewer);
        assert.match(baseline[1].stat, /^Sun until /);
        assert.equal(baseline[1].hours[1].label, '2pm');
    });
});
