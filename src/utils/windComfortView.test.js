import test from 'node:test';
import assert from 'node:assert/strict';
import {
    comfortScale, feelsLikeGap, freshMicroclimate, hourlyWindColumns, rowWindKmh, windFactorView, windLevelWord,
} from './windComfortView.js';
import {
    calculateApparentTemp, generateHourlyForecast, getComfortZone, getOptimalBookingTime, getVenueWindExposure,
    getWindProfile, getWindWarning, measuredWindFactor, measuredWindOptions, resolveVenueWindFactor,
} from '../data/windIntelligence.js';
import { windChip } from './venueConditionChips.js';
import { venueFeelsLike } from './venueSun.js';

const cafe = { id: 'x-cafe', venueName: 'Corner Cafe', vibe: 'Cafe' };
const hourly = {
    time: ['2026-10-14T15:00', '2026-10-14T16:00', '2026-10-14T17:00'],
    temperature_2m: [21, 19, 17], wind_speed_10m: [36, 18, 9], wind_direction_10m: [0, 0, 200], wind_gusts_10m: [54, 30, 12],
};
const forecastOptions = { now: new Date('2026-10-14T04:30Z'), utcOffsetSeconds: 39600, hourly };

test('the comfort marker sits inside the zone its label names', () => {
    for (const feels of [-3, 5, 9.9, 10, 12, 15.9, 16, 21, 22, 27, 28, 33, 34, 41]) {
        const scale = comfortScale(feels);
        const zone = scale.segments.find(segment => scale.position >= segment.start && scale.position < segment.end)
            ?? scale.segments[scale.segments.length - 1];
        assert.equal(zone.level, getComfortZone(feels).level, `feels like ${feels}`);
    }
});

test('the comfort scale covers 0–100% without gaps and has no marker for a missing reading', () => {
    const { segments, position } = comfortScale(null);
    assert.equal(position, null);
    assert.equal(segments[0].start, 0);
    assert.equal(segments[segments.length - 1].end, 100);
    segments.slice(1).forEach((segment, index) => assert.equal(segment.start, segments[index].end));
    assert.equal(comfortScale(80).position, 100);
    assert.equal(comfortScale(-40).position, 0);
});

test('a venue without a profile now gets the real hourly forecast, not the daily pattern', () => {
    const rows = generateHourlyForecast(20, 5, 50, cafe, 0, 10, forecastOptions);
    assert.equal(rows.length, 24);
    assert.deepEqual(rows.slice(0, 3).map(row => [row.temp, row.wind, row.source]), [[21, 36, 'forecast'], [19, 18, 'forecast'], [17, 9, 'forecast']]);
    assert.equal(rows[0].time.toISOString(), '2026-10-14T04:00:00.000Z');
    assert.equal(rows[0].label, 'Now');
    assert.equal(rows[3].source, 'estimate', 'hours past the forecast fall back to the daily pattern');
    assert.ok(rows.every(row => Number.isFinite(row.temp) && Number.isFinite(row.wind) && Number.isFinite(row.feelsLike)));
});

test('with no hourly forecast every row is an estimate and still renders', () => {
    const rows = generateHourlyForecast(20, 5, 50, cafe, 0, 10, { now: new Date('2026-10-14T04:30Z') });
    assert.equal(rows.length, 24);
    assert.ok(rows.every(row => row.source === 'estimate'));
});

test('the measured wind factor is recovered from the shelter score and rejects bad scores', () => {
    assert.equal(measuredWindFactor({ wind_shelter_score: 0.55 }), 0.5);
    assert.equal(measuredWindFactor({ wind_shelter_score: 1 }), 0);
    assert.equal(measuredWindFactor({ wind_shelter_score: 0.1 }), 1);
    for (const bad of [null, {}, { wind_shelter_score: -0.1 }, { wind_shelter_score: 1.2 }, { wind_shelter_score: 'calm' }]) {
        assert.equal(measuredWindFactor(bad), null);
    }
});

test('wind factor sources rank profile, then measured for the scored direction, then venue type', () => {
    const microclimate = { wind_shelter_score: 0.55 };
    const typeFactor = getWindProfile(cafe).exposure;
    assert.deepEqual(resolveVenueWindFactor(cafe, { direction: 10 }), { factor: typeFactor, source: 'type', note: null, tunnel: false, type: 'cafe' });
    assert.equal(resolveVenueWindFactor(cafe, { direction: 10, microclimate, measuredDirection: 350 }).source, 'measured');
    assert.equal(resolveVenueWindFactor(cafe, { direction: 10, microclimate, measuredDirection: 350 }).factor, 0.5);
    // A different 45° sector, or an unknown direction, is not what the row measured.
    assert.equal(resolveVenueWindFactor(cafe, { direction: 200, microclimate, measuredDirection: 350 }).source, 'type');
    assert.equal(resolveVenueWindFactor(cafe, { direction: null, microclimate, measuredDirection: 350 }).source, 'type');
    assert.equal(resolveVenueWindFactor(cafe, { direction: 10, microclimate, measuredDirection: null }).source, 'type');
    const profiled = { ...cafe, windProfile: { sectors: [{ from: 330, to: 30, factor: 1.6, note: 'Laneway tunnel' }], defaultFactor: 0.6 } };
    const funnel = resolveVenueWindFactor(profiled, { direction: 10, microclimate, measuredDirection: 350 });
    assert.deepEqual([funnel.source, funnel.factor, funnel.tunnel, funnel.note], ['profile', 1.6, true, 'Laneway tunnel']);
});

test('a measured factor changes wind, warning and feels-like only for hours in its direction', () => {
    const measured = { microclimate: { wind_shelter_score: 0.1 }, measuredDirection: 0 };
    assert.equal(getVenueWindExposure(10, cafe, 0, null, measured).effectiveWindMs, 10);
    assert.equal(getVenueWindExposure(10, cafe, 0, null, measured).source, 'measured');
    assert.equal(getVenueWindExposure(10, cafe, 180, null, measured).effectiveWindMs, 10 * getWindProfile(cafe).exposure);
    assert.equal(getWindWarning(10, cafe, 0, null, measured).level, 'orange');
    assert.equal(getWindWarning(10, cafe, 0).level, 'green');
    assert.equal(calculateApparentTemp(20, 10, 50, 0.7, 0, null, cafe, measured), calculateApparentTemp(20, 10, 50, 0));
    const rows = generateHourlyForecast(20, 5, 50, cafe, 0, 10, { ...forecastOptions, ...measured });
    assert.deepEqual(rows.slice(0, 3).map(row => row.windExposure.source), ['measured', 'measured', 'type']);
});

test('wind levels are worded for someone choosing a table, with no event-planner advice', () => {
    const labels = [2, 6, 10, 20].map(ms => getWindWarning(ms, { vibe: 'Rooftop' }).label);
    assert.deepEqual(labels, ['Calm', 'Breezy', 'Windy', 'Very windy']);
    for (const ms of [2, 6, 10, 20]) {
        const warning = getWindWarning(ms, { vibe: 'Rooftop' });
        assert.doesNotMatch(warning.advice, /tent|marquee|decorations|event/i);
        assert.ok(warning.phrase);
    }
});

test('the best-time reason reads as a sentence at every wind level', () => {
    for (const wind of [1, 7, 11, 18]) {
        const best = getOptimalBookingTime(generateHourlyForecast(22, wind, 50, { vibe: 'Rooftop' }, 0, null, { now: new Date('2026-10-14T02:00Z') }));
        assert.match(best.reason, /^Feels like -?\d+° with (calm air|a steady breeze|gusty wind|strong wind)$/);
    }
});

test('microclimate rows are only trusted for the wind factor while their weather is recent', () => {
    const now = new Date('2026-10-14T05:00:00Z');
    const row = at => ({ wind_shelter_score: 0.5, weather_computed_at: at });
    assert.ok(freshMicroclimate(row('2026-10-14T04:45:00Z'), now));
    assert.ok(freshMicroclimate(row('2026-10-14T03:00:00Z'), now));
    assert.equal(freshMicroclimate(row('2026-10-14T02:59:00Z'), now), null);
    assert.equal(freshMicroclimate(row('2026-10-14T06:00:00Z'), now), null, 'a row from the future is not trusted');
    for (const bad of [null, {}, row(null), row('yesterday')]) assert.equal(freshMicroclimate(bad, now), null);
});

test('the wind factor is explained in plain words with its source', () => {
    assert.deepEqual(
        (({ headline, share, sourceLabel, estimated }) => ({ headline, share, sourceLabel, estimated }))(windFactorView({ factor: 0.3, source: 'type', type: 'cafe' })),
        { headline: 'Sheltered spot', share: 'About 30% of the open-air wind reaches here', sourceLabel: 'Estimated from the kind of venue (café)', estimated: true });
    assert.equal(windFactorView({ factor: 0.5, source: 'measured', type: 'cafe' }).headline, 'Partly sheltered');
    assert.equal(windFactorView({ factor: 0.5, source: 'measured', type: 'cafe' }).sourceLabel, 'Measured from the buildings around it');
    assert.equal(windFactorView({ factor: 0.95, source: 'type', type: 'rooftop' }).headline, 'Open to the wind');
    const funnel = windFactorView({ factor: 1.6, source: 'profile', type: 'rooftop', note: ' Northerlies funnel here ', illustrative: true });
    assert.deepEqual([funnel.headline, funnel.share, funnel.sourceLabel, funnel.note],
        ['Wind funnels through here', 'Wind speeds up to about 1.6× here', 'Illustrative wind profile for this venue', 'Northerlies funnel here']);
    assert.equal(windFactorView({ factor: 0, source: 'measured' }).share, 'About 5% of the open-air wind reaches here');
    // Shelter score 0.10, the most exposed a measured row gets, is a factor of exactly 1.
    for (const factor of [0.98, 1, 1.05]) assert.equal(windFactorView({ factor, source: 'measured' }).share, 'All of the open-air wind reaches here');
    assert.equal(windFactorView({ factor: 0.97, source: 'measured' }).share, 'About 95% of the open-air wind reaches here');
    assert.deepEqual([0, 0.33, 0.34, 0.66, 0.67, 1.05, 1.06, 2.5].map(factor => windFactorView({ factor, source: 'type' }).step), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.equal(windFactorView({ factor: NaN, source: 'type' }), null);
    assert.equal(windFactorView(), null);
});

test('hourly columns show the wind at the venue, share one bar scale and say what each bar means', () => {
    const rows = generateHourlyForecast(20, 5, 50, cafe, 0, 10, forecastOptions);
    const columns = hourlyWindColumns(rows, 12);
    assert.equal(columns.length, 12);
    assert.equal(columns[0].windKmh, Math.round(36 * getWindProfile(cafe).exposure));
    assert.equal(columns[0].label, 'Now');
    assert.equal(columns[0].isCurrent, true);
    assert.equal(columns[0].from, 'N');
    assert.match(columns[0].spoken, /^Now: feels like \d+°, wind 11 km\/h from N, calm$/);
    assert.ok(columns.every(column => column.bar > 0 && column.bar <= 1));
    assert.equal(columns[3].estimated, true);
    assert.equal(new Set(columns.map(column => column.key)).size, 12, 'keys are unique');
    // A gale sets the scale; a calm day keeps short bars instead of filling the strip.
    const calm = hourlyWindColumns([{ label: 'Now', wind: 4, feelsLike: 20, windWarning: { level: 'green' } }]);
    assert.equal(calm[0].bar, 0.1);
    assert.deepEqual(hourlyWindColumns(null), []);
    // The "Now" column repeats the panel's headline figures; later hours are untouched.
    const aligned = hourlyWindColumns(rows, 12, { feelsLike: 17, windKmh: 12 });
    assert.deepEqual([aligned[0].feelsLike, aligned[0].windKmh], [17, 12]);
    assert.match(aligned[0].spoken, /^Now: feels like 17°, wind 12 km\/h from N, calm$/);
    assert.deepEqual([aligned[1].feelsLike, aligned[1].windKmh], [columns[1].feelsLike, columns[1].windKmh]);
    assert.equal(hourlyWindColumns(rows, 12, { feelsLike: null, windKmh: null })[0].windKmh, columns[0].windKmh);
    assert.equal(rowWindKmh({ wind: 12 }), 12);
    assert.equal(rowWindKmh({}), null);
    assert.equal(windLevelWord('purple'), 'Wind unknown');
});

test('the feels-like gap is only mentioned when it is worth a sentence', () => {
    assert.equal(feelsLikeGap(20, 12), 'Feels 8° cooler than the 20° air');
    assert.equal(feelsLikeGap(20, 23), 'Feels 3° warmer than the 20° air');
    assert.equal(feelsLikeGap(20, 19), null);
    assert.equal(feelsLikeGap(null, 12), null);
});

test('the list row, the card header and the panel show the same measured wind and feels-like', () => {
    const weather = { main: { temp: 20, humidity: 50 }, wind: { speed: 10 }, windDirection: 350, windGusts: 54 };
    const minutesAgo = minutes => new Date(Date.now() - minutes * 60000).toISOString();
    const row = { wind_shelter_score: 0.1, weather_computed_at: minutesAgo(10) };
    const options = measuredWindOptions(row, 350);
    // What the panel works out…
    const panelWind = Math.round(getVenueWindExposure(10, cafe, 350, 15, options).effectiveWindMs * 3.6);
    const panelFeels = Math.round(calculateApparentTemp(20, 10, 50, getWindProfile(cafe).shelterFactor, 350, 15, cafe, options));
    // …is what the list chip, the card tile and both feels-like figures show.
    assert.equal(panelWind, 36);
    assert.equal(windChip(cafe, weather, row).kmh, panelWind);
    assert.equal(venueFeelsLike(cafe, weather, row), panelFeels);
    assert.notEqual(windChip(cafe, weather, row).kmh, windChip(cafe, weather).kmh);
    // A stale row, or none, leaves the venue-type estimate exactly as it was.
    const stale = { ...row, weather_computed_at: minutesAgo(300) };
    for (const unusable of [stale, null, {}, { wind_shelter_score: 0.1 }]) {
        assert.equal(windChip(cafe, weather, unusable).kmh, windChip(cafe, weather).kmh);
        assert.equal(venueFeelsLike(cafe, weather, unusable), venueFeelsLike(cafe, weather));
    }
    assert.deepEqual(measuredWindOptions(stale, 350), { microclimate: null, measuredDirection: 350 });
});
