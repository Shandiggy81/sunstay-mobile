import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { outsideToday, rowsForLocalDay, shadeByHour, verdictWindLevel } from './outsideToday.js';
import { deriveSunForecast } from './sunForecastState.js';
import { windWord } from './venueConditionChips.js';
import { generateHourlyForecast, measuredWindOptions } from '../data/windIntelligence.js';

// A Melbourne summer-time day (UTC+11), built with the app's own forecast and wind code.
const OFFSET = 39600;
const DAY = '2026-11-12';
const TZ = 'Australia/Melbourne';
const at = (hour, minute = 0) => new Date(`${DAY}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+11:00`);
const VENUE = { id: 'v1', venueName: 'Test Bar', vibe: 'Bar', tags: ['Outdoor Seating'] };

function hourlyBlock({ cloud = () => 10, rainChance = () => 5, wind = () => 20, direction = () => 350, temp = () => 20, from = 0 } = {}) {
    const time = [];
    for (let i = from; i < 48; i += 1) time.push(`${i < 24 ? DAY : '2026-11-13'}T${String(i % 24).padStart(2, '0')}:00`);
    const series = fn => time.map(iso => fn(Number(iso.slice(11, 13))));
    return {
        time,
        cloud_cover: series(cloud), precipitation_probability: series(rainChance), weather_code: series(() => 1), precipitation: series(() => 0),
        temperature_2m: series(temp), wind_speed_10m: series(wind), wind_direction_10m: series(direction),
        wind_gusts_10m: series(hour => wind(hour) * 1.5), relative_humidity_2m: series(() => 50),
    };
}
const forecastAt = (hour, hourly, minute = 0) => deriveSunForecast({
    hourly, utcOffsetSeconds: OFFSET, timeZone: TZ, now: at(hour, minute), sunrise: at(6, 2), sunset: at(20, 5),
});
const rowsFor = (hourly, options = {}) => generateHourlyForecast(20, 20 / 3.6, 50, VENUE, 350, 30 / 3.6,
    { hourly, utcOffsetSeconds: OFFSET, now: at(0), ...options });
const lane = (model, hour) => model.lanes.find(entry => entry.hour === hour);

describe('verdictWindLevel', () => {
    it('uses the same bands as the list chip words', () => {
        const words = { green: 'Calm', light: 'Light wind', yellow: 'Breezy', orange: 'Windy', red: 'Very windy' };
        for (const kmh of [0, 5.9, 6, 19.9, 20, 29.9, 30, 39.9, 40, 80]) assert.equal(words[verdictWindLevel(kmh)], windWord(kmh), `${kmh} km/h`);
        assert.deepEqual([5, 6, 20, 30, 40].map(verdictWindLevel), ['green', 'light', 'yellow', 'orange', 'red']);
        for (const bad of [null, undefined, NaN, 'fast']) assert.equal(verdictWindLevel(bad), null);
    });
});

describe('shadeByHour', () => {
    it('turns sun windows into the share of each venue-local hour in the sun', () => {
        const { source, hours } = shadeByHour({ windows: [{ start: at(10, 30), end: at(13, 15) }, { start: at(16), end: at(16, 45) }], timeZone: TZ });
        assert.equal(source, 'windows');
        assert.deepEqual([9, 10, 11, 12, 13, 14, 16, 17].map(hour => hours[hour]), [0, 0.5, 1, 1, 0.25, 0, 0.75, 0]);
        assert.equal(hours.length, 24);
    });

    it('reads the same hours for a viewer in another time zone, and ignores broken windows', () => {
        const { hours } = shadeByHour({ windows: [{ start: at(10).getTime(), end: at(11).getTime() }, { start: at(14), end: at(13) }, null, { start: 'x', end: at(15) }], timeZone: TZ });
        assert.equal(hours[10], 1);
        assert.equal(hours.filter(value => value > 0).length, 1);
    });

    it('treats an empty window list as shade all day', () => {
        assert.deepEqual(shadeByHour({ windows: [] }), { source: 'windows', hours: Array(24).fill(0) });
    });

    it('falls back to the scored hourly curve, then to unknown', () => {
        const curve = Array.from({ length: 24 }, (_, hour) => (hour >= 9 && hour < 15 ? 0.8 : 0));
        assert.deepEqual(shadeByHour({ curve }), { source: 'curve', hours: curve });
        const gappy = shadeByHour({ curve: curve.map((value, hour) => (hour === 10 ? null : hour === 11 ? 1.4 : value)) });
        assert.equal(gappy.hours[10], null);
        assert.equal(gappy.hours[11], 1);
        for (const bad of [{}, { curve: [1, 2] }, { curve: Array(24).fill(null) }, { curve: 'x' }]) {
            assert.deepEqual(shadeByHour(bad), { source: null, hours: Array(24).fill(null) });
        }
    });
});

describe('rowsForLocalDay', () => {
    it('keeps only the rows of the venue’s own day', () => {
        // A forecast that starts at 2pm today runs to 1pm tomorrow.
        const hourly = hourlyBlock({ from: 14 });
        const rows = generateHourlyForecast(20, 20 / 3.6, 50, VENUE, 350, null, { hourly, utcOffsetSeconds: OFFSET, now: at(0) });
        assert.equal(rows.length, 24);
        const today = rowsForLocalDay(rows, DAY, TZ);
        assert.deepEqual(today.map(row => row.hour), [14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
        assert.equal(rowsForLocalDay(rows, '2026-11-13', TZ).length, 14);
        // The same instants are a different calendar day for a venue in London.
        assert.notDeepEqual(rowsForLocalDay(rows, DAY, 'Europe/London').map(row => row.hour), today.map(row => row.hour));
    });

    it('ignores rows without a usable time, and bad input', () => {
        assert.deepEqual(rowsForLocalDay([{ time: 'noon' }, { time: new Date(NaN) }, null, {}], DAY, TZ), []);
        for (const bad of [null, undefined, 'rows']) assert.deepEqual(rowsForLocalDay(bad, DAY, TZ), []);
        assert.deepEqual(rowsForLocalDay([{ time: at(9) }], null, TZ), []);
        assert.deepEqual(rowsForLocalDay([{ time: at(9) }], DAY, 'Not/AZone'), []);
    });
});

describe('outsideToday', () => {
    it('says where the shade came from', () => {
        const hourly = hourlyBlock();
        const forecast = forecastAt(11, hourly);
        assert.equal(outsideToday({ forecast, windRows: rowsFor(hourly) }).shadeSource, null);
        assert.equal(outsideToday({ forecast, windRows: rowsFor(hourly), shade: shadeByHour({ windows: [] }) }).shadeSource, 'windows');
        assert.equal(outsideToday({ forecast, windRows: rowsFor(hourly), shade: shadeByHour({ curve: Array(24).fill(0.5) }) }).shadeSource, 'curve');
    });

    it('gives one verdict for sun and wind at the current hour on a clear day', () => {
        const hourly = hourlyBlock();
        const model = outsideToday({ forecast: forecastAt(11, hourly, 20), windRows: rowsFor(hourly) });
        assert.equal(model.isNow, true);
        assert.equal(model.nowHour, 11);
        assert.equal(model.selectedHour, 11);
        assert.equal(model.whenLabel, 'Right now');
        // 20 km/h in the open, about 55% of it at an outdoor bar: a light wind.
        assert.equal(model.readout.windWord, 'Light wind');
        assert.equal(model.readout.windKmh, 11);
        assert.equal(model.verdict.state, 'sun');
        assert.equal(model.verdict.headline, 'Sunny with a light wind');
        assert.equal(model.verdict.sunSentence, 'Full sun until 8pm.');
        assert.match(model.verdict.feelsSentence, /^Feels \d+° with 11 km\/h from the north\.$/);
        assert.equal(model.spoken, 'Now: Sunny with a light wind');
        assert.equal(model.readout.rainChance, 5);
    });

    it('draws the day from the hour before sunrise to the hour of sunset', () => {
        const hourly = hourlyBlock();
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly) });
        // Sunrise 6:02am and sunset 8:05pm: 6am is daylight, the 8pm hour is night.
        assert.deepEqual(model.range, { start: 5, end: 20 });
        assert.equal(model.lanes.length, 16);
        assert.deepEqual(model.lanes.slice(0, 3).map(entry => [entry.label, entry.sun]), [['5am', 'dawn'], ['6am', 'sun'], ['7am', 'sun']]);
        assert.deepEqual(model.lanes.slice(-2).map(entry => [entry.label, entry.sun]), [['7pm', 'sun'], ['8pm', 'dark']]);
        assert.ok(model.lanes.every(entry => entry.windKmh === 11 && entry.windBand === 1 && entry.estimated === false));
        // The marker sits in the middle of the 11am column.
        assert.equal(model.marker, (11 - 5 + 0.5) / 16);
    });

    it('shows shade from the venue’s sun windows, and trusts the live reading for now', () => {
        const hourly = hourlyBlock();
        const shade = shadeByHour({ windows: [{ start: at(11, 40), end: at(14, 30) }], timeZone: TZ });
        const forecast = forecastAt(11, hourly, 45);
        const model = outsideToday({ forecast, shade, windRows: rowsFor(hourly), live: { sunKind: 'sun' } });
        assert.deepEqual([10, 11, 12, 13, 14, 15].map(hour => lane(model, hour).sun), ['shade', 'shade', 'sun', 'sun', 'part', 'shade']);
        // 11am is a third in the sun as an hour, but at 11:45 the venue is in its window.
        assert.equal(model.verdict.state, 'sun');
        assert.equal(model.verdict.sunSentence, 'Full sun until 2pm.');
        const shadedNow = outsideToday({ forecast, shade, windRows: rowsFor(hourly), live: { sunKind: 'shaded' } });
        assert.equal(shadedNow.verdict.state, 'shade');
        assert.equal(shadedNow.verdict.sunSentence, 'Sun from 12pm.');
    });

    it('reads cloud and rain from the card’s own forecast', () => {
        const hourly = hourlyBlock({ cloud: hour => (hour >= 13 && hour < 15 ? 95 : 10), rainChance: hour => (hour >= 15 && hour < 17 ? 80 : 5) });
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), selectedMinutes: 13 * 60 + 20 });
        assert.deepEqual([12, 13, 14, 15, 16, 17].map(hour => lane(model, hour).sun), ['sun', 'cloud', 'cloud', 'rain', 'rain', 'sun']);
        assert.equal(model.isNow, false);
        assert.equal(model.selectedHour, 13);
        assert.equal(model.whenLabel, 'At 1pm');
        assert.equal(model.verdict.state, 'cloud');
        assert.equal(model.verdict.headline, 'Cloudy with a light wind');
        assert.equal(model.verdict.sunSentence, 'Sun from 5pm.');
        assert.equal(model.spoken, '1pm: Cloudy with a light wind');
        const rain = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), selectedMinutes: 15 * 60 });
        assert.equal(rain.verdict.headline, 'Rain with a light wind');
        assert.equal(rain.readout.rainChance, 80);
    });

    it('says cloud for now when the live reading does, even over a sunny hour', () => {
        const hourly = hourlyBlock();
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), live: { sunKind: 'cloud' } });
        assert.equal(model.verdict.state, 'cloud');
        assert.equal(lane(model, 11).sun, 'sun', 'the strip keeps the hour’s forecast');
        const raining = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), live: { sunKind: 'rain' } });
        assert.equal(raining.verdict.state, 'rain');
    });

    it('uses the card’s live wind and feels-like for now, and the rows for other hours', () => {
        const hourly = hourlyBlock({ wind: hour => (hour >= 14 ? 60 : 20) });
        const live = { sunKind: 'sun', windKmh: 34.4, feelsLike: 12.2, windFrom: 200, windSource: 'type' };
        const now = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), live });
        assert.equal(now.readout.windKmh, 34);
        assert.equal(now.readout.windWord, 'Windy');
        assert.equal(now.readout.feelsLike, 12);
        assert.equal(now.verdict.headline, 'Sunny but windy');
        assert.equal(now.verdict.feelsSentence, 'Feels 12° with 34 km/h from the south.');
        const later = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), live, selectedMinutes: 15 * 60 });
        assert.equal(later.readout.windKmh, 33);
        assert.equal(later.verdict.headline, 'Sunny but windy');
        assert.match(later.verdict.feelsSentence, /with 33 km\/h from the north\.$/);
    });

    it('marks hours that fall back from the measured shelter as estimates', () => {
        // The wind swings from north to south-west at 4pm; the shelter was measured for the northerly.
        const hourly = hourlyBlock({ direction: hour => (hour >= 16 ? 230 : 350) });
        const entry = { wind_shelter_score: 0.1, weather_computed_at: at(10, 50).toISOString() };
        const rows = rowsFor(hourly, measuredWindOptions(entry, 350, at(11)));
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rows, live: { sunKind: 'sun', windKmh: 20, feelsLike: 16, windFrom: 350, windSource: 'measured' } });
        assert.equal(lane(model, 12).estimated, false);
        assert.equal(lane(model, 12).windKmh, 20);
        assert.equal(lane(model, 16).estimated, true);
        assert.equal(lane(model, 16).windKmh, 11);
        const later = outsideToday({ forecast: forecastAt(11, hourly), windRows: rows, live: { windSource: 'measured' }, selectedMinutes: 17 * 60 });
        assert.equal(later.readout.estimated, true);
    });

    it('offers up to six daylight slots from now, the first labelled Now', () => {
        const hourly = hourlyBlock({ wind: hour => (hour >= 13 ? 60 : 20) });
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), selectedMinutes: 14 * 60 });
        assert.deepEqual(model.slots.map(slot => [slot.label, slot.words, slot.good]), [
            ['Now', 'Sunny · Light wind', true], ['12pm', 'Sunny · Light wind', true], ['1pm', 'Sunny · Windy', false],
            ['2pm', 'Sunny · Windy', false], ['3pm', 'Sunny · Windy', false], ['4pm', 'Sunny · Windy', false],
        ]);
        const evening = outsideToday({ forecast: forecastAt(19, hourly), windRows: rowsFor(hourly) });
        assert.deepEqual(evening.slots.map(slot => slot.label), ['Now']);
        const night = outsideToday({ forecast: forecastAt(22, hourly), windRows: rowsFor(hourly) });
        assert.deepEqual(night.slots, []);
        assert.equal(night.verdict.headline, 'After dark, windy');
        assert.deepEqual(night.range, { start: 5, end: 22 });
    });

    it('says before sunrise in the early morning and widens the strip to include now', () => {
        const hourly = hourlyBlock();
        const model = outsideToday({ forecast: forecastAt(3, hourly), windRows: rowsFor(hourly) });
        assert.equal(model.verdict.state, 'dawn');
        assert.equal(model.verdict.headline, 'Before sunrise, light wind');
        assert.equal(model.verdict.sunSentence, 'Sun from 6am.');
        assert.equal(model.range.start, 3);
        assert.equal(model.marker, 0.5 / model.lanes.length);
    });

    it('does not call an hour sunny when its sky is not in the forecast', () => {
        // The forecast only starts at 2pm, so the morning's sky is unknown.
        const hourly = hourlyBlock({ from: 14 });
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly) });
        assert.equal(lane(model, 11).sun, 'unknown');
        assert.equal(lane(model, 15).sun, 'sun');
        assert.equal(model.verdict, null);
        assert.equal(model.spoken, 'Now');
        // The card's own reading for this moment is enough for a verdict.
        const live = outsideToday({ forecast: forecastAt(11, hourly), windRows: rowsFor(hourly), live: { sunKind: 'sun', windKmh: 8, feelsLike: 19, windFrom: null } });
        assert.equal(live.verdict.headline, 'Sunny with a light wind');
        assert.equal(live.verdict.feelsSentence, 'Feels 19° with 8 km/h of wind.');
    });

    it('keeps the sun strip when the wind is missing, without inventing a verdict', () => {
        const hourly = hourlyBlock();
        const model = outsideToday({ forecast: forecastAt(11, hourly), windRows: [] });
        assert.equal(lane(model, 12).sun, 'sun');
        assert.equal(lane(model, 12).windKmh, null);
        assert.equal(lane(model, 12).windBand, null);
        assert.equal(model.verdict, null);
        assert.deepEqual(model.slots, []);
        assert.deepEqual(model.readout, { windWord: null, windKmh: null, feelsLike: null, rainChance: 5, estimated: false });
    });

    it('returns null without an hourly sky to draw', () => {
        const noHourly = deriveSunForecast({ hourly: null, utcOffsetSeconds: OFFSET, timeZone: TZ, now: at(11), sunrise: at(6, 2), sunset: at(20, 5) });
        assert.equal(outsideToday({ forecast: noHourly, windRows: [] }), null);
        for (const bad of [undefined, null, {}, { forecast: null }, { forecast: { hours: [], nowHour: 11, hasHourly: true } }]) assert.equal(outsideToday(bad), null);
    });

    it('treats the slider resting on its position for now as now', () => {
        const hourly = hourlyBlock();
        const rows = rowsFor(hourly);
        // 3am: the app's slider starts at 6am, so "now" is pinned there.
        const night = outsideToday({ forecast: forecastAt(3, hourly), windRows: rows, selectedMinutes: 360, nowSliderMinutes: 360 });
        assert.equal(night.isNow, true);
        assert.equal(night.selectedHour, 3);
        assert.equal(night.verdict.state, 'dawn');
        // 11:55am snaps to 12:00 on the slider: still now, described as the real hour.
        const snapped = outsideToday({ forecast: forecastAt(11, hourly, 55), windRows: rows, selectedMinutes: 720, nowSliderMinutes: 720 });
        assert.equal(snapped.isNow, true);
        assert.equal(snapped.selectedHour, 11);
        // Any other hour is a choice.
        const chosen = outsideToday({ forecast: forecastAt(11, hourly), windRows: rows, selectedMinutes: 15 * 60, nowSliderMinutes: 675 });
        assert.equal(chosen.isNow, false);
        assert.equal(chosen.selectedHour, 15);
    });

    it('wraps the slider minutes and leaves its inputs untouched', () => {
        const hourly = hourlyBlock();
        const forecast = forecastAt(11, hourly);
        const rows = rowsFor(hourly);
        const before = JSON.stringify([forecast, rows]);
        assert.equal(outsideToday({ forecast, windRows: rows, selectedMinutes: 24 * 60 + 14 * 60 + 59 }).selectedHour, 14);
        assert.equal(outsideToday({ forecast, windRows: rows, selectedMinutes: 11 * 60 + 5 }).isNow, true);
        assert.equal(outsideToday({ forecast, windRows: rows, selectedMinutes: NaN }).isNow, true);
        assert.equal(JSON.stringify([forecast, rows]), before);
    });
});
