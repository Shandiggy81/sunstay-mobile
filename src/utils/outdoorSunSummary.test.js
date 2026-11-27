import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outdoorSunSummary } from './outdoorSunSummary.js';
import { outdoorSunDay, sunMomentsFromDay } from './sunMoments.js';
import { deriveSunForecast } from './sunForecastState.js';
import { venueStatTiles } from './venueStatTiles.js';

// Melbourne daylight time, 19 Oct 2026: UTC+11.
const OFFSET = 11 * 3600;
const at = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 19, hour - 11, minute));
const TZ = 'Australia/Melbourne';

// A courtyard that buildings shade except 12:10pm–1:38pm (1h 28m).
const DAY = Object.freeze({
    date: '2026-10-19',
    dayStart: at(0),
    sunrise: at(6, 22),
    sunset: at(19, 44),
    windows: [{ start: at(12, 10), end: at(13, 38) }],
    totalMinutes: 88,
});

// Open sky all day: the forecast alone counts every daylight hour as sun.
function clearForecast(now) {
    const time = Array.from({ length: 24 }, (_, h) => `2026-10-19T${String(h).padStart(2, '0')}:00`);
    return deriveSunForecast({
        hourly: { time, cloud_cover: time.map(() => 0), precipitation_probability: time.map(() => 0), weather_code: time.map(() => 0) },
        utcOffsetSeconds: OFFSET,
        now,
        sunrise: 6 + 22 / 60,
        sunset: 19 + 44 / 60,
    });
}

const summary = (now, extra = {}) => outdoorSunSummary({ daily: DAY, forecast: clearForecast(now), now, timeZone: TZ, ...extra });

describe('outdoorSunSummary', () => {
    it('reproduces the contradiction: the forecast says 6h+ left while the venue has 1h 28m in total', () => {
        const now = at(13, 7);
        const forecast = clearForecast(now);
        assert.ok(forecast.sunMinutesLeft > 6 * 60, 'open-sky forecast minutes left');
        const s = summary(now);
        assert.equal(s.totalMinutes, 88);
        assert.equal(s.remainingMinutes, 31);
        assert.ok(s.remainingMinutes <= s.totalMinutes);
        assert.equal(s.state, 'sun-now');
        assert.equal(s.statText, 'Sun until 1:38pm');
        assert.equal(s.sentence, "Direct sun here until 1:38pm. 31m of today's 1h 28m is still to come.");
        assert.doesNotMatch(s.sentence, /6h/);
    });

    it('never reports more left than the total, even when totalMinutes disagrees with the windows', () => {
        const daily = { ...DAY, totalMinutes: 30 };
        for (let h = 5; h <= 21; h += 0.25) {
            const now = at(Math.floor(h), (h % 1) * 60);
            const s = outdoorSunSummary({ daily, forecast: clearForecast(now), now, timeZone: TZ });
            assert.ok(s.remainingMinutes <= s.totalMinutes, `at ${h}: ${s.remainingMinutes} > ${s.totalMinutes}`);
            assert.ok(s.remainingMinutes >= 0);
        }
    });

    it('before sunrise: the whole window is ahead and the text names sunrise', () => {
        const s = summary(at(5, 30));
        assert.equal(s.state, 'before-sunrise');
        assert.equal(s.remainingMinutes, 88);
        assert.equal(s.kind, 'night');
        assert.equal(s.statText, 'Sun up 6:22am');
        assert.equal(s.sentence, "The sun's up at 6:22am. Expect about 1h 28m of direct sun at this venue today.");
    });

    it('after sunset: nothing left, and the day total is past tense', () => {
        const s = summary(at(20, 15));
        assert.equal(s.state, 'after-sunset');
        assert.equal(s.remainingMinutes, 0);
        assert.equal(s.totalMinutes, 88);
        assert.equal(s.statText, 'Sun has set');
        assert.equal(s.sentence, 'The sun has set. This venue had about 1h 28m of direct sun today.');
    });

    it('shaded now with sun later names when it arrives', () => {
        const s = summary(at(10));
        assert.equal(s.state, 'shaded-now');
        assert.equal(s.kind, 'shaded');
        assert.equal(s.remainingMinutes, 88);
        assert.equal(s.statText, 'Sun from 12:10pm');
        assert.equal(s.sentence, "Shaded by nearby buildings right now. Sun reaches this venue from 12:10pm: 1h 28m of today's 1h 28m is still to come.");
    });

    it('shaded for the rest of the day once the window has passed', () => {
        const s = summary(at(16));
        assert.equal(s.state, 'shaded-rest');
        assert.equal(s.remainingMinutes, 0);
        assert.equal(s.statText, 'No more sun today');
        assert.match(s.sentence, /rest of today\. This venue had about 1h 28m/);
    });

    it('fully shaded all day', () => {
        const s = summary(at(13), { daily: { ...DAY, windows: [], totalMinutes: 0 } });
        assert.equal(s.state, 'no-sun');
        assert.equal(s.totalMinutes, 0);
        assert.equal(s.remainingMinutes, 0);
        assert.equal(s.statText, 'Shaded today');
        assert.equal(s.sentence, 'Buildings around this venue block direct sun all day today.');
    });

    it('cloud or rain over a sun window says so instead of promising sun', () => {
        const now = at(12, 30);
        const cloudy = outdoorSunSummary({ daily: DAY, forecast: { now: { kind: 'cloud' } }, now, timeZone: TZ });
        assert.equal(cloudy.kind, 'cloud');
        assert.equal(cloudy.statText, 'Cloudy now');
        // No hourly forecast to check the rest of the window with: it is told as clear-sky sun.
        assert.equal(cloudy.sentence, "Cloud is blocking the sun right now. 1h 8m of today's 1h 28m clear-sky sun at this venue is still to come.");
        const rain = outdoorSunSummary({ daily: DAY, forecast: { now: { kind: 'rain' } }, now, timeZone: TZ });
        assert.equal(rain.statText, 'Rain likely');
        assert.match(rain.sentence, /^Rain likely right now\./);
    });

    it('works without a forecast (missing weather)', () => {
        const s = outdoorSunSummary({ daily: DAY, forecast: null, now: at(12, 30), timeZone: TZ });
        assert.equal(s.kind, 'sun');
        assert.equal(s.remainingMinutes, 68);
    });

    it('missing or broken day data returns null so the card keeps the forecast text', () => {
        assert.equal(outdoorSunSummary({ daily: null, now: at(12) }), null);
        assert.equal(outdoorSunSummary({ daily: { totalMinutes: 60 }, now: at(12) }), null);
        assert.equal(outdoorSunSummary({ daily: DAY, now: new Date(NaN) }), null);
        assert.equal(outdoorSunSummary(), null);
        const bad = outdoorSunSummary({ daily: { ...DAY, windows: [{ start: null, end: at(13) }], totalMinutes: 0 }, now: at(12), timeZone: TZ });
        assert.equal(bad.state, 'no-sun');
    });

    it('with a real stored horizon, left never exceeds the Sun moments total at any time of day', () => {
        // Tall buildings everywhere except the north (330°–30°).
        const horizon = Array.from({ length: 36 }, (_, i) => (i >= 33 || i < 3 ? 0 : 75));
        const daily = outdoorSunDay({ lat: -37.8136, lng: 144.9631, horizon, date: '2026-10-19', timeZone: TZ });
        assert.ok(daily && daily.totalMinutes > 0 && daily.totalMinutes < 6 * 60);
        const moments = sunMomentsFromDay({ daily, timeZone: TZ });
        for (let h = 0; h < 24; h += 0.5) {
            const now = at(Math.floor(h), (h % 1) * 60);
            const s = outdoorSunSummary({ daily, forecast: clearForecast(now), now, timeZone: TZ });
            assert.equal(s.totalMinutes, moments.totalMinutes);
            assert.ok(s.remainingMinutes <= s.totalMinutes, `at ${h}`);
        }
    });
});

/** Today's forecast from one slot per local hour ({ rain, code, cloud }) and an optional current reading. */
function forecastWith(slotFor, now, current = {}) {
    const time = Array.from({ length: 24 }, (_, h) => `2026-10-19T${String(h).padStart(2, '0')}:00`);
    const slots = time.map((_, h) => ({ rain: 0, code: 0, cloud: 0, ...slotFor(h) }));
    return deriveSunForecast({
        hourly: {
            time,
            cloud_cover: slots.map(s => s.cloud),
            precipitation_probability: slots.map(s => s.rain),
            weather_code: slots.map(s => s.code),
        },
        utcOffsetSeconds: OFFSET,
        now,
        sunrise: 6 + 22 / 60,
        sunset: 19 + 44 / 60,
        current,
    });
}
const RAIN_ALL_DAY = () => ({ rain: 95, code: 3, cloud: 100 });

describe('outdoorSunSummary against the forecast (sky-now verdict)', () => {
    it('rain likely in the sun window: no clear-sky sun is promised', () => {
        const now = at(12, 30);
        const s = outdoorSunSummary({ daily: DAY, forecast: forecastWith(RAIN_ALL_DAY, now), now, timeZone: TZ });
        assert.equal(s.state, 'sun-now');
        assert.equal(s.kind, 'rain');
        assert.equal(s.statText, 'Rain likely');
        assert.equal(s.sentence, 'Rain likely right now. No direct sun is forecast here for the rest of today.');
    });

    it('rain in the reading is "Raining", and only the forecast\'s sunny part of the window is still to come', () => {
        const now = at(12, 30);
        // A dry forecast for the noon hour, but the current reading has rain; sun from 1pm.
        const forecast = forecastWith(h => (h === 12 ? { rain: 20, code: 3, cloud: 90 } : {}), now, { isRaining: true });
        const s = outdoorSunSummary({ daily: DAY, forecast, now, timeZone: TZ });
        assert.equal(s.statText, 'Raining');
        assert.equal(s.sentence, 'Raining right now. About 38m of sun is forecast here later today.');
        assert.equal(venueStatTiles({ venue: {}, forecast, sunNow: s })[0].value, 'Raining');
    });

    it("rain wins over the buildings' shade, and the sun still to come is the forecast's", () => {
        const now = at(11);
        const forecast = forecastWith(h => (h === 11 ? { rain: 80, code: 61, cloud: 100 } : {}), now);
        const s = outdoorSunSummary({ daily: DAY, forecast, now, timeZone: TZ });
        assert.equal(s.state, 'shaded-now');
        assert.equal(s.kind, 'rain');
        assert.equal(s.sentence, 'Rain likely right now. About 1h 28m of sun is forecast here later today.');
        assert.equal(venueStatTiles({ venue: {}, forecast, sunNow: s })[0].value, 'Rain likely · 80%');
    });

    it("cloud while shaded keeps the buildings' answer", () => {
        const now = at(11);
        const s = outdoorSunSummary({ daily: DAY, forecast: forecastWith(h => (h === 11 ? { cloud: 100, code: 3 } : {}), now), now, timeZone: TZ });
        assert.equal(s.state, 'shaded-now');
        assert.equal(s.statText, 'Sun from 12:10pm');
    });

    it('after the last window in rain: rain leads, with no sun promised', () => {
        const now = at(15);
        const s = outdoorSunSummary({ daily: DAY, forecast: forecastWith(RAIN_ALL_DAY, now), now, timeZone: TZ });
        assert.equal(s.state, 'shaded-rest');
        assert.equal(s.kind, 'rain');
        assert.equal(s.sentence, 'Rain likely right now. Buildings shade this venue for the rest of today.');
    });

    it('a day the forecast cuts short is never told as "had about 1h 28m of direct sun"', () => {
        const dawn = at(5);
        assert.equal(outdoorSunSummary({ daily: DAY, forecast: forecastWith(RAIN_ALL_DAY, dawn), now: dawn, timeZone: TZ }).sentence,
            "The sun's up at 6:22am. No direct sun is forecast here today.");
        const night = at(21);
        assert.equal(outdoorSunSummary({ daily: DAY, forecast: forecastWith(RAIN_ALL_DAY, night), now: night, timeZone: TZ }).sentence,
            'The sun has set for today.');
        // Sun forecast for the 1pm hour only: 38 of the window's 88 minutes.
        const partly = forecastWith(h => (h === 13 ? {} : { rain: 90, code: 61, cloud: 100 }), night);
        assert.equal(outdoorSunSummary({ daily: DAY, forecast: partly, now: night, timeZone: TZ }).sentence,
            'The sun has set. About 38m of direct sun was forecast here today.');
        const afternoon = at(16);
        const wetNoon = forecastWith(h => (h === 12 ? { rain: 90, code: 61, cloud: 100 } : {}), afternoon);
        assert.equal(outdoorSunSummary({ daily: DAY, forecast: wetNoon, now: afternoon, timeZone: TZ }).sentence,
            'Shaded by nearby buildings for the rest of today. About 38m of direct sun was forecast here today.');
    });

    it('a fully sunny forecast keeps the wording unchanged', () => {
        const now = at(21);
        assert.equal(outdoorSunSummary({ daily: DAY, forecast: clearForecast(now), now, timeZone: TZ }).sentence,
            'The sun has set. This venue had about 1h 28m of direct sun today.');
    });
});

describe('venueStatTiles sunNow', () => {
    it('uses the outdoor summary for "Sun now" when given, else the forecast', () => {
        const now = at(10);
        const forecast = clearForecast(now);
        const plain = venueStatTiles({ venue: {}, weather: null, forecast, score: 80, scoreLoading: false, feelsLike: 20 });
        assert.match(plain[0].value, /^Sun until/);
        const tiles = venueStatTiles({ venue: {}, weather: null, forecast, score: 80, scoreLoading: false, feelsLike: 20, sunNow: summary(now) });
        assert.equal(tiles[0].label, 'Sun now');
        assert.equal(tiles[0].value, 'Sun from 12:10pm');
        assert.equal(tiles[0].icon, 'shaded');
    });
});
