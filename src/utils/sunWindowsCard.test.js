import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cardSunWindows, forecastForSunWindows, roundedSunDay } from './sunWindowsCard.js';
import { outdoorSunSummary } from './outdoorSunSummary.js';
import { layoutSunWindows } from './sunWindowsGraph.js';
import { outdoorSunDay } from './sunMoments.js';

const TIMEZONE = 'Australia/Melbourne';
const MINUTE = 60_000;
const at = (time) => new Date(`2026-10-14T${time}+11:00`);

// Engine output for a CBD test horizon on 14 Oct 2026: edges to the
// millisecond, and totalMinutes = Math.round(unrounded sum) = 538.
const ENGINE_DAY = Object.freeze({
    date: '2026-10-14',
    timeZone: TIMEZONE,
    windows: [
        { start: at('08:50:16.845'), end: at('16:04:46.083') },
        { start: at('17:22:22.529'), end: at('19:06:08.701') },
    ],
    totalMinutes: 538,
    sunrise: at('06:34:40.200'),
    sunset: at('19:39:10.900'),
});

const sumMinutes = (windows) => windows.reduce((sum, w) => sum + (w.end - w.start) / MINUTE, 0);
// "8:50:16am", "16.845s", "15.41s", "seconds": any sign of sub-minute precision.
const SECONDS = /\d:\d{2}:\d{2}|\d(?:\.\d+)?s\b|second/;

function allLabels(layout) {
    return [
        layout.totalLabel,
        layout.accessibleSummary,
        ...layout.ticks.map((t) => t.label),
        ...layout.windows.flatMap((w) => [w.startLabel, w.endLabel, w.rangeLabel, w.durationLabel]),
    ];
}

describe('cardSunWindows', () => {
    it("makes the graph's total exactly the sum of the rounded windows", () => {
        const card = cardSunWindows(ENGINE_DAY);
        const layout = layoutSunWindows(card);
        const sum = sumMinutes(card.windows);
        assert.ok(Number.isInteger(sum));
        assert.equal(layout.totalMinutes, sum);
        assert.equal(layout.totalMilliseconds, sum * MINUTE);
        assert.equal(layout.windows.reduce((total, w) => total + w.minutes, 0), layout.totalMinutes);
    });

    it('leaves no seconds in any chip, tick, total or spoken summary', () => {
        const raw = layoutSunWindows({ windows: ENGINE_DAY.windows, date: ENGINE_DAY.date, timezone: TIMEZONE });
        assert.ok(allLabels(raw).some((label) => SECONDS.test(label)), 'fixture should show seconds when not rounded');

        for (const label of allLabels(layoutSunWindows(cardSunWindows(ENGINE_DAY)))) {
            assert.doesNotMatch(label, SECONDS);
        }

        const horizon = Array.from({ length: 36 }, (_, i) => ((i >= 28 && i <= 33) || (i >= 8 && i <= 10) ? 40 : 5));
        const engineDay = outdoorSunDay({ lat: -37.8136, lng: 144.9631, horizon, date: '2026-10-14', timeZone: TIMEZONE });
        for (const label of allLabels(layoutSunWindows(cardSunWindows(engineDay)))) {
            assert.doesNotMatch(label, SECONDS);
        }
    });

    it('shows 8h 59m (539) where the engine total says 538, so the headline must use the graph total', () => {
        assert.equal(Math.round(sumMinutes(ENGINE_DAY.windows)), ENGINE_DAY.totalMinutes);
        const layout = layoutSunWindows(cardSunWindows(ENGINE_DAY));
        assert.deepEqual(layout.windows.map((w) => `${w.rangeLabel} · ${w.durationLabel}`),
            ['8:50am – 4:05pm · 7h 15m', '5:22pm – 7:06pm · 1h 44m']);
        assert.equal(layout.totalMinutes, 539);
        assert.equal(layout.totalLabel, '8h 59m');
        assert.notEqual(layout.totalMinutes, ENGINE_DAY.totalMinutes);
    });

    it('returns epoch-ms windows with the date, zone and minute-rounded sunrise and sunset', () => {
        assert.deepEqual(cardSunWindows(ENGINE_DAY), {
            windows: [
                { start: +at('08:50:00'), end: +at('16:05:00') },
                { start: +at('17:22:00'), end: +at('19:06:00') },
            ],
            date: '2026-10-14',
            timezone: TIMEZONE,
            sunrise: +at('06:35:00'),
            sunset: +at('19:39:00'),
        });
    });

    it('merges windows that touch or overlap once rounded, and sorts them', () => {
        const card = cardSunWindows({ ...ENGINE_DAY, windows: [
            { start: at('13:00:00'), end: at('14:00:00') },
            { start: at('10:30:20'), end: at('11:00:00') },
            { start: at('10:00:00'), end: at('10:30:10') },
            { start: at('13:30:00'), end: at('13:45:00') },
        ] });
        assert.deepEqual(card.windows, [
            { start: +at('10:00:00'), end: +at('11:00:00') },
            { start: +at('13:00:00'), end: +at('14:00:00') },
        ]);
    });

    it('drops windows under a minute after rounding and keeps a whole minute', () => {
        const card = cardSunWindows({ ...ENGINE_DAY, windows: [
            { start: at('12:00:10'), end: at('12:00:25') },
            { start: at('15:00:20'), end: at('15:00:50') },
        ] });
        assert.deepEqual(card.windows, [{ start: +at('15:00:00'), end: +at('15:01:00') }]);
        assert.deepEqual(cardSunWindows({ ...ENGINE_DAY, windows: [] }).windows, []);
    });

    it('does not change the engine result', () => {
        const before = ENGINE_DAY.windows.map((w) => [w.start.getTime(), w.end.getTime()]);
        cardSunWindows(ENGINE_DAY);
        assert.deepEqual(ENGINE_DAY.windows.map((w) => [w.start.getTime(), w.end.getTime()]), before);
    });

    it('returns null for a missing day or an unreadable window, and null sun times when unknown', () => {
        for (const bad of [null, undefined, {}, { ...ENGINE_DAY, windows: null }, { ...ENGINE_DAY, date: null },
            { ...ENGINE_DAY, timeZone: '' }, { ...ENGINE_DAY, windows: [{ start: at('09:00:00'), end: 'later' }] },
            { ...ENGINE_DAY, windows: [{ start: new Date('x'), end: at('10:00:00') }] }]) {
            assert.equal(cardSunWindows(bad), null);
        }
        const card = cardSunWindows({ ...ENGINE_DAY, sunrise: null, sunset: undefined });
        assert.equal(card.sunrise, null);
        assert.equal(card.sunset, null);
    });
});

describe('roundedSunDay', () => {
    it('gives every reader of the day the graph total', () => {
        const day = roundedSunDay(ENGINE_DAY);
        assert.equal(day.totalMinutes, 539);
        assert.equal(layoutSunWindows(cardSunWindows(day)).totalMinutes, 539);
        assert.deepEqual(cardSunWindows(day), cardSunWindows(ENGINE_DAY), 'rounding twice changes nothing');
        assert.ok(day.windows.every((w) => w.start instanceof Date && w.end instanceof Date));
        const summary = outdoorSunSummary({ daily: day, now: at('12:00:00'), timeZone: TIMEZONE });
        assert.equal(summary.totalMinutes, 539);
        assert.match(summary.sentence, /8h 59m/);
    });

    it('keeps the other day fields and returns null like cardSunWindows', () => {
        const day = roundedSunDay(ENGINE_DAY);
        assert.equal(day.date, ENGINE_DAY.date);
        assert.equal(day.sunset, ENGINE_DAY.sunset);
        assert.equal(roundedSunDay(null), null);
        assert.equal(roundedSunDay({ ...ENGINE_DAY, windows: [{ start: 'x', end: at('10:00:00') }] }), null);
    });
});

describe('forecastForSunWindows', () => {
    const hours = (kindAt) => Array.from({ length: 24 }, (_, hour) => ({ hour, kind: kindAt(hour) }));
    const sun = cardSunWindows({ ...ENGINE_DAY, windows: [{ start: at('09:00:00'), end: at('13:00:00') }] });
    const forecast = (kindAt) => ({ hasHourly: true, hours: hours(kindAt) });

    it('reads the forecast sky over the sun windows only', () => {
        assert.deepEqual(forecastForSunWindows({ forecast: forecast(() => 'sun'), sun }),
            { kind: 'sun', text: "Mostly sunny in today's sun windows" });
        // cloud outside the windows does not count
        assert.equal(forecastForSunWindows({ forecast: forecast((h) => (h >= 9 && h < 13 ? 'sun' : 'cloud')), sun }).kind, 'sun');
        assert.equal(forecastForSunWindows({ forecast: forecast((h) => (h < 11 ? 'sun' : 'cloud')), sun }).kind, 'mixed');
        assert.equal(forecastForSunWindows({ forecast: forecast(() => 'cloud'), sun }).kind, 'cloud');
        assert.equal(forecastForSunWindows({ forecast: forecast((h) => (h === 12 ? 'rain' : 'sun')), sun }).text,
            "Rain forecast during today's sun windows");
    });

    it('says nothing without an hourly forecast or without sun windows', () => {
        assert.equal(forecastForSunWindows({ forecast: null, sun }), null);
        assert.equal(forecastForSunWindows({ forecast: { hasHourly: false, hours: [] }, sun }), null);
        assert.equal(forecastForSunWindows({ forecast: forecast(() => 'day'), sun }), null);
        assert.equal(forecastForSunWindows({ forecast: forecast(() => 'sun'), sun: { ...sun, windows: [] } }), null);
    });
});
