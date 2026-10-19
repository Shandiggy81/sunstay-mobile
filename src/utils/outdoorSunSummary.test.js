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
        assert.equal(cloudy.sentence, "Cloud is blocking the sun right now. 1h 8m of today's 1h 28m sun window at this venue is still to come.");
        const rain = outdoorSunSummary({ daily: DAY, forecast: { now: { kind: 'rain' } }, now, timeZone: TZ });
        assert.equal(rain.statText, 'Rain now');
        assert.match(rain.sentence, /^Rain about right now\./);
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
