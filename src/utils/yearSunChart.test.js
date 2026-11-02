import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHours, niceMaxHours, smoothPath, yearSunChart, YEAR_CHART } from './yearSunChart.js';

const LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOURS = [7.5, 7.3, 7.7, 5.2, 3.9, 3.3, 3.6, 4.6, 6.1, 7.3, 7.6, 7.5];
const monthly = HOURS.map((hours, i) => ({ month: i + 1, label: LABELS[i], hours }));

test('axis tops out at a round number of hours', () => {
    assert.equal(niceMaxHours(7.7), 8);
    assert.equal(niceMaxHours(0), 2);
    assert.equal(niceMaxHours(10.1), 12);
    assert.equal(niceMaxHours(NaN), 2);
});

test('points sit in month columns and inside the chart', () => {
    const chart = yearSunChart(monthly, { currentMonth: 11 });
    assert.equal(chart.points.length, 12);
    assert.equal(chart.maxHours, 8);
    assert.deepEqual(chart.ticks.map(t => t.label), ['8h', '4h']);
    for (const p of chart.points) {
        assert.ok(p.x > 0 && p.x < YEAR_CHART.width);
        assert.ok(p.y >= YEAR_CHART.top && p.y <= YEAR_CHART.height - YEAR_CHART.bottom);
    }
    assert.equal(chart.points[0].xPercent, 4.2);
    assert.match(chart.area, /Z$/);
});

test('calls out now, the sunniest and the least sunny month', () => {
    const chart = yearSunChart(monthly, { currentMonth: 11 });
    assert.deepEqual(chart.callouts.map(c => [c.label, c.kind, c.text, c.placement]), [['Nov', 'now', 'Now · 7.6h', 'above'], ['Mar', 'most', '7.7h', 'above'], ['Jun', 'least', '3.3h', 'below']]);
    assert.deepEqual(yearSunChart(monthly, { currentMonth: 3 }).callouts.map(c => c.label), ['Mar', 'Jun'], 'no repeat when now is the peak');
    const shaded = yearSunChart(monthly.map(m => ({ ...m, hours: 0 })));
    assert.deepEqual(shaded.callouts, []);
    assert.equal(yearSunChart([]), null);
});

test('the curve never dips below the baseline or above the peak', () => {
    const pts = [{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 100 }];
    const ys = smoothPath(pts).match(/-?\d+(\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 1);
    assert.ok(Math.max(...ys) <= 100 && Math.min(...ys) >= 10, ys.join(','));
    assert.equal(formatHours(7.25), '7.3h');
    assert.equal(formatHours(3), '3h');
});

test('call-outs next to "Now" never overlap it', () => {
    // Pullman East Melbourne's north side: peak in Oct, now Nov, low in Dec.
    const hours = [8.5, 9.9, 10.5, 10.4, 9.1, 8.7, 9.0, 9.9, 10.6, 11.2, 9.7, 7.7];
    const chart = yearSunChart(hours.map((h, i) => ({ month: i + 1, label: LABELS[i], hours: h })), { currentMonth: 11 });
    const above = chart.callouts.filter(c => c.placement === 'above');
    for (const a of above) for (const b of above) if (a !== b) assert.ok(Math.abs(a.month - b.month) > 1, `${a.label}/${b.label}`);
    assert.equal(chart.callouts[0].text, 'Now · 9.7h');
    assert.ok(!chart.callouts.some(c => c.label === 'Oct'), 'the Oct peak next to Now loses its label');
});
