/**
 * Sunniest months for a place: average direct-sun minutes per day in each
 * month, from the same engine as the card's sun windows (calculateBalconySunDay),
 * so the months follow the venue's own buildings and facing, not the season.
 * A north-facing Melbourne space can peak in winter.
 *
 * Samples every 7th day from 1 January (53 days), so each month gets 4 or 5
 * samples. calculateMonthlySunSummary (one sample, the 15th) is unchanged; it
 * still serves RoomSunCard, StayComparison and hotelSunReport.
 *
 * The work is an idle job (see idleJob.js) because 53 engine days take a few
 * hundred milliseconds on a laptop and more on a phone; run it after first
 * paint. calculateMonthlySunAverage runs the same job synchronously.
 *
 * @module utils/monthlySunAverage
 */
import { calculateBalconySunDay, DEFAULT_TIME_ZONE } from './balconySunEngine.js';

export const MONTHLY_SAMPLE_STEP_DAYS = 7;
export const SUNNIEST_MONTH_COUNT = 3;
const DAY_MS = 86_400_000;

/** Every 7th calendar date of `year`, from 1 January, as YYYY-MM-DD. */
export function monthlySampleDates(year) {
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        throw new RangeError('Year must be an integer between 1900 and 2100.');
    }
    const dates = [];
    for (let t = Date.UTC(year, 0, 1); new Date(t).getUTCFullYear() === year; t += MONTHLY_SAMPLE_STEP_DAYS * DAY_MS) {
        dates.push(new Date(t).toISOString().slice(0, 10));
    }
    return dates;
}

/**
 * The `count` months with the highest average, most sun first. Ties go to the
 * earlier month. Months with no sun at all are never "sunniest", so a fully
 * shaded place returns [].
 *
 * @param {Array<{ month: number, averageMinutes: number }>} months
 * @returns {number[]} month numbers, 1–12
 */
export function pickSunniestMonths(months, count = SUNNIEST_MONTH_COUNT) {
    if (!Array.isArray(months)) return [];
    return months
        .filter((m) => Number.isInteger(m?.month) && Number.isFinite(m?.averageMinutes) && m.averageMinutes > 0)
        .sort((a, b) => b.averageMinutes - a.averageMinutes || a.month - b.month)
        .slice(0, count)
        .map((m) => m.month);
}

/**
 * A resumable job for runWhenIdle: one engine day per step.
 *
 * @param {object} options calculateBalconySunDay options without `date`, plus `year`
 * @returns {{ readonly done: boolean, readonly result: null | {
 *   year: number,
 *   months: Array<{ month: number, samples: number, averageMinutes: number }>,
 *   sunniest: number[],
 * }, run: (shouldYield: () => boolean) => boolean }}
 *   `result` stays null until every sample is done. `averageMinutes` is the
 *   unrounded mean; ranking uses it, display rounds it.
 */
export function createMonthlySunAverageJob({ year, ...options }) {
    const dates = monthlySampleDates(year);
    const totals = Array.from({ length: 12 }, () => ({ minutes: 0, samples: 0 }));
    const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
    let index = 0;
    let result = null;
    return {
        get done() { return index >= dates.length; },
        get result() { return result; },
        run(shouldYield) {
            while (index < dates.length) {
                const date = dates[index++];
                const day = calculateBalconySunDay({ ...options, timeZone, date });
                const month = Number(date.slice(5, 7)) - 1;
                totals[month].minutes += day.totalMinutes;
                totals[month].samples += 1;
                if (index < dates.length && shouldYield()) return false;
            }
            if (!result) {
                const months = totals.map((t, i) => ({
                    month: i + 1,
                    samples: t.samples,
                    averageMinutes: t.samples ? t.minutes / t.samples : 0,
                }));
                result = { year, months, sunniest: pickSunniestMonths(months) };
            }
            return true;
        },
    };
}

/** createMonthlySunAverageJob run to completion in one go. Throws like the engine on bad options. */
export function calculateMonthlySunAverage(options) {
    const job = createMonthlySunAverageJob(options);
    job.run(() => false);
    return job.result;
}

const MONTH_SHORT = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** "Jan" … "Dec" for 1–12, else null. */
export function monthShortName(month) {
    return Number.isInteger(month) ? MONTH_SHORT[month - 1] ?? null : null;
}

/**
 * Months in calendar order for display, starting after the largest gap so a
 * run across the new year reads Nov · Dec · Jan rather than Jan · Nov · Dec.
 */
export function sunniestMonthsInOrder(months) {
    if (!Array.isArray(months)) return [];
    const sorted = [...new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
    if (sorted.length < 2) return sorted;
    let start = 0;
    let largestGap = -1;
    sorted.forEach((month, i) => {
        const previous = sorted[(i - 1 + sorted.length) % sorted.length];
        const gap = (month - previous + 12) % 12;
        if (gap > largestGap) { largestGap = gap; start = i; }
    });
    return [...sorted.slice(start), ...sorted.slice(0, start)];
}
