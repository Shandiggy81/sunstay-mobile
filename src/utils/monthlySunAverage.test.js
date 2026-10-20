import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalconySunDay } from './balconySunEngine.js';
import {
    calculateMonthlySunAverage,
    createMonthlySunAverageJob,
    MONTHLY_SAMPLE_STEP_DAYS,
    monthlySampleDates,
    monthShortName,
    pickSunniestMonths,
    sunniestMonthsInOrder,
    SUNNIEST_MONTH_COUNT,
} from './monthlySunAverage.js';

const BASE = { lat: -37.8136, lng: 144.9631, timeZone: 'Australia/Melbourne', year: 2026 };
const OPEN = { ...BASE, facing: null, obstructions: [] };
// A north-facing room under a deep overhang: the high summer sun is blocked,
// so its sunniest months are not summer ones.
const NORTH_OVERHANG = { ...BASE, facing: 'N', obstructions: [], overhang: { depth: 1.5, height: 2.0 } };

describe('monthlySampleDates', () => {
    it('samples every 7th day from 1 January, 4 or 5 per month', () => {
        const dates = monthlySampleDates(2026);
        assert.equal(MONTHLY_SAMPLE_STEP_DAYS, 7);
        assert.equal(dates.length, 53);
        assert.equal(dates[0], '2026-01-01');
        assert.equal(dates.at(-1), '2026-12-31');
        for (let i = 1; i < dates.length; i++) {
            assert.equal(Date.parse(dates[i]) - Date.parse(dates[i - 1]), 7 * 86_400_000);
        }
        const perMonth = new Map();
        for (const date of dates) perMonth.set(date.slice(5, 7), (perMonth.get(date.slice(5, 7)) ?? 0) + 1);
        assert.equal(perMonth.size, 12);
        for (const count of perMonth.values()) assert.ok(count === 4 || count === 5);
    });

    it('handles a leap year and rejects a bad year', () => {
        const leap = monthlySampleDates(2028);
        assert.equal(leap.length, 53);
        assert.equal(leap.at(-1), '2028-12-30');
        for (const year of [2026.5, 1800, '2026', null]) assert.throws(() => monthlySampleDates(year), RangeError);
    });
});

describe('pickSunniestMonths', () => {
    it('takes the highest averages, most sun first, ties to the earlier month', () => {
        const months = [
            { month: 1, averageMinutes: 300 }, { month: 2, averageMinutes: 500 },
            { month: 3, averageMinutes: 400 }, { month: 10, averageMinutes: 500 },
            { month: 12, averageMinutes: 400 },
        ];
        assert.equal(SUNNIEST_MONTH_COUNT, 3);
        assert.deepEqual(pickSunniestMonths(months), [2, 10, 3]);
        assert.deepEqual(pickSunniestMonths(months, 1), [2]);
    });

    it('never calls a month with no sun "sunniest"', () => {
        assert.deepEqual(pickSunniestMonths([{ month: 6, averageMinutes: 0 }, { month: 7, averageMinutes: 12 }]), [7]);
        assert.deepEqual(pickSunniestMonths(Array.from({ length: 12 }, (_, i) => ({ month: i + 1, averageMinutes: 0 }))), []);
        assert.deepEqual(pickSunniestMonths(null), []);
    });
});

describe('calculateMonthlySunAverage', () => {
    it('averages the engine day totals of each month’s samples', () => {
        const result = calculateMonthlySunAverage(OPEN);
        assert.equal(result.year, 2026);
        assert.equal(result.months.length, 12);
        const february = monthlySampleDates(2026).filter((d) => d.startsWith('2026-02'));
        const expected = february.reduce((sum, date) => sum + calculateBalconySunDay({ ...OPEN, date }).totalMinutes, 0) / february.length;
        assert.equal(result.months[1].samples, february.length);
        assert.equal(result.months[1].averageMinutes, expected);
    });

    it('finds summer for open sky and something else when the geometry says so', () => {
        assert.deepEqual(calculateMonthlySunAverage(OPEN).sunniest, [12, 1, 11]);
        const north = calculateMonthlySunAverage(NORTH_OVERHANG).sunniest;
        assert.equal(north.length, 3);
        for (const month of north) assert.ok(month >= 3 && month <= 9, `month ${month}`);
    });

    it('returns no sunniest months for a place that never gets direct sun', () => {
        const shaded = calculateMonthlySunAverage({ ...BASE, facing: null, obstructions: [{ start: 0, end: 360, minAltitude: 89 }] });
        assert.deepEqual(shaded.sunniest, []);
        assert.ok(shaded.months.every((m) => m.averageMinutes === 0));
    });

    it('throws like the engine on bad options', () => {
        assert.throws(() => calculateMonthlySunAverage({ ...OPEN, lat: 200 }), RangeError);
        assert.throws(() => calculateMonthlySunAverage({ ...OPEN, year: 2026.5 }), RangeError);
    });
});

describe('createMonthlySunAverageJob', () => {
    it('works one day per slice and gives the same result as the one-shot call', () => {
        const job = createMonthlySunAverageJob(NORTH_OVERHANG);
        let slices = 0;
        while (!job.run(() => true)) {
            slices += 1;
            assert.equal(job.result, null, 'no partial result before the last sample');
            assert.equal(job.done, false);
        }
        assert.equal(slices + 1, 53);
        assert.equal(job.done, true);
        assert.deepEqual(job.result, calculateMonthlySunAverage(NORTH_OVERHANG));
        assert.equal(job.run(() => true), true, 'running a finished job is a no-op');
    });
});

describe('sunniestMonthsInOrder / monthShortName', () => {
    it('reads in calendar order, wrapping across the new year', () => {
        assert.deepEqual(sunniestMonthsInOrder([12, 1, 11]), [11, 12, 1]);
        assert.deepEqual(sunniestMonthsInOrder([10, 9, 11]), [9, 10, 11]);
        assert.deepEqual(sunniestMonthsInOrder([6]), [6]);
        assert.deepEqual(sunniestMonthsInOrder([]), []);
        assert.deepEqual(sunniestMonthsInOrder([2, 2, 13, 0, 'x']), [2]);
        assert.deepEqual(sunniestMonthsInOrder(null), []);
    });

    it('names months briefly', () => {
        assert.deepEqual([1, 6, 12].map(monthShortName), ['Jan', 'Jun', 'Dec']);
        assert.equal(monthShortName(13), null);
        assert.equal(monthShortName('1'), null);
    });
});
