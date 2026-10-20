import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { layoutSunWindows, MIN_HILL_WIDTH } from './sunWindowsGraph.js';

// Sunrise/sunset gaps and hill shapes. The #203 behaviour is covered, unchanged,
// in sunWindowsGraph.test.js; these tests only add to it.
const DATE = '2026-10-14';
const at = (time) => `${DATE}T${time}:00+11:00`;
const window = (start, end) => ({ start: at(start), end: at(end) });
const layout = (options = {}) => layoutSunWindows({ date: DATE, ...options });
const SUN_TIMES = { sunrise: at('06:30'), sunset: at('19:40') };
const widthsAddUp = (result) => {
    const gaps = result.gaps.reduce((sum, gap) => sum + gap.xEnd - gap.xStart, 0);
    const sun = result.windows.reduce((sum, w) => sum + w.xEnd - w.xStart, 0);
    return Math.abs(gaps + sun - 360) < 1e-9;
};

describe('sunrise and sunset gaps', () => {
    it('keeps one undifferentiated gap kind without sun times', () => {
        const result = layout({ windows: [window('09:00', '11:00')] });
        assert.ok(result.gaps.length > 0);
        assert.ok(result.gaps.every((gap) => gap.kind === null));
    });

    it('marks daylight gaps as building shade and the rest as night', () => {
        const result = layout({
            windows: [window('09:00', '11:00'), window('13:00', '15:00')],
            axisStart: at('05:00'), axisEnd: at('21:00'), ...SUN_TIMES,
        });
        assert.deepEqual(result.gaps.map((gap) => gap.kind), ['night', 'shade', 'shade', 'shade', 'night']);
        const x = (time) => (Date.parse(at(time)) - Date.parse(at('05:00'))) / (16 * 3600_000) * 360;
        assert.ok(Math.abs(result.gaps[0].xEnd - x('06:30')) < 1e-9);
        assert.ok(Math.abs(result.gaps[4].xStart - x('19:40')) < 1e-9);
        assert.ok(widthsAddUp(result));
        for (const gap of result.gaps) {
            if (gap.kind === 'night') assert.doesNotMatch(gap.path, / C /, 'night is a flat band');
            else assert.match(gap.path, /^M .* C .* C .* Z$/);
        }
    });

    it('draws a thin shade sliver flat instead of as a spike', () => {
        const result = layout({ windows: [window('06:42', '11:15')], axisStart: at('05:00'), axisEnd: at('18:00'), ...SUN_TIMES });
        const sliver = result.gaps.find((gap) => gap.kind === 'shade' && gap.xEnd <= result.windows[0].xStart);
        assert.ok(sliver.xEnd - sliver.xStart < 12);
        assert.doesNotMatch(sliver.path, / C /);
    });

    it('splits an empty day too, and leaves sunrise and sunset outside the axis alone', () => {
        const empty = layout({ ...SUN_TIMES });
        assert.equal(empty.windowCount, 0);
        assert.deepEqual(empty.gaps.map((gap) => gap.kind), ['night', 'shade']);
        const midday = layout({ windows: [window('10:00', '12:00')], ...SUN_TIMES });
        assert.ok(midday.gaps.every((gap) => gap.kind === 'shade'));
    });

    it('uses whichever sun time it has and ignores unreadable ones', () => {
        const onlySunset = layout({ windows: [window('12:00', '14:00')], axisStart: at('11:00'), axisEnd: at('21:00'), sunset: at('19:40') });
        assert.deepEqual(onlySunset.gaps.map((gap) => gap.kind), ['shade', 'shade', 'night']);
        const unreadable = layout({ windows: [window('12:00', '14:00')], sunrise: 'dawn', sunset: new Date('x') });
        assert.ok(unreadable.gaps.every((gap) => gap.kind === null));
        assert.equal(unreadable.totalLabel, '2h');
    });
});

describe('hill shapes', () => {
    it('widens a short window to a minimum visual width without moving its times or total', () => {
        const result = layout({ windows: [window('09:00', '09:10')], axisStart: at('06:00'), axisEnd: at('18:00') });
        const [hill] = result.windows;
        assert.ok(hill.hillEnd - hill.hillStart >= MIN_HILL_WIDTH - 1e-9);
        assert.ok(hill.hillStart <= hill.xStart && hill.hillEnd >= hill.xEnd);
        assert.ok(hill.xEnd - hill.xStart < MIN_HILL_WIDTH / 2, 'the true extent is still the short one');
        assert.equal(hill.minutes, 10);
        assert.equal(result.totalMinutes, 10);
        assert.equal(result.totalLabel, '10m');
        assert.ok(Math.abs(hill.sun.x - (hill.xStart + hill.xEnd) / 2) < 1e-9, 'sun stays at the true midpoint');
        assert.ok(widthsAddUp(result));
    });

    it('never lets widened neighbours overlap, or a hill leave the axis', () => {
        const result = layout({
            windows: [window('09:00', '09:05'), window('09:10', '09:15')],
            axisStart: at('09:00'), axisEnd: at('18:00'),
        });
        const [a, b] = result.windows;
        assert.ok(a.hillEnd <= b.hillStart + 1e-9);
        assert.ok(a.hillStart >= 0 && b.hillEnd <= 360);
        assert.ok(a.hillStart <= a.xStart && a.hillEnd >= a.xEnd && b.hillStart <= b.xStart && b.hillEnd >= b.xEnd);
    });

    it('leaves long windows at their true width', () => {
        const [hill] = layout({ windows: [window('08:00', '16:00')] }).windows;
        assert.equal(hill.hillStart, hill.xStart);
        assert.equal(hill.hillEnd, hill.xEnd);
    });

    it('draws a round crown and gives short windows a readable sun', () => {
        const short = layout({ windows: [window('09:00', '09:10')], axisStart: at('06:00'), axisEnd: at('18:00') }).windows[0];
        const numbers = short.path.match(/-?\d+(?:\.\d+)?/g).map(Number);
        // M s B  C c1x c1y c2x c2y midX top  C ...
        const [start, , c1x, , c2x, , midX] = numbers;
        const half = midX - start;
        assert.ok(midX - c2x >= 0.6 * half, 'crown control points sit wide of the apex');
        assert.ok(c1x - start <= 0.4 * half, 'the foot stays soft');
        assert.ok(short.sun.radius >= 9, `sun radius ${short.sun.radius}`);
        assert.doesNotMatch(short.path, /NaN|Infinity/);
    });
});
