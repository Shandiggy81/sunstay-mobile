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
    assert.deepEqual(chart.callouts.map(c => [c.label, c.kind, c.text, c.placement]), [['Nov', 'now', 'Now · 7.6h', 'above'], ['Mar', 'most', '7.7h', 'sun'], ['Jun', 'least', '3.3h', 'below']]);
    const nowAtPeak = yearSunChart(monthly, { currentMonth: 3 }).callouts;
    assert.deepEqual(nowAtPeak.map(c => [c.label, c.placement]), [['Mar', 'sun'], ['Jun', 'below']], 'no repeat when now is the peak');
    const shaded = yearSunChart(monthly.map(m => ({ ...m, hours: 0 })));
    assert.deepEqual(shaded.callouts, []);
    assert.equal(yearSunChart([]), null);
});

test('the clay sun sits on the sunniest month, kept inside the chart', () => {
    assert.deepEqual(yearSunChart(monthly).sun, { kind: 'sun', month: 3, xPercent: 20.8, yPercent: yearSunChart(monthly).points[2].yPercent });
    const january = yearSunChart(monthly.map(m => ({ ...m, hours: m.month === 1 ? 9 : 2 }))).sun;
    assert.equal(january.month, 1);
    assert.equal(january.xPercent, 8, 'clamped so the icon is not cut off at the edge');
    const flat = yearSunChart(monthly.map(m => ({ ...m, hours: 5 }))).sun;
    assert.ok([6, 7].includes(flat.month), 'a tie keeps the sun mid-year');
    const none = yearSunChart(monthly.map(m => ({ ...m, hours: 0 }))).sun;
    assert.equal(none.kind, 'shaded');
    assert.equal(none.xPercent, 50);
});

test('rooms in one report can share an axis', () => {
    const low = monthly.map(m => ({ ...m, hours: m.hours / 3 }));
    assert.equal(yearSunChart(low).maxHours, 4, 'on its own, the axis fits the room');
    const shared = yearSunChart(low, { maxHours: 7.7 });
    assert.equal(shared.maxHours, 8);
    assert.deepEqual(shared.ticks.map(t => t.label), ['8h', '4h']);
    assert.equal(yearSunChart(monthly, { maxHours: 2 }).maxHours, 8, 'a smaller shared value never cuts a room off');
    assert.equal(yearSunChart(monthly, { maxHours: NaN }).maxHours, 8);
});

test('labels near the sun move out from under it', () => {
    // Peak in Mar; Feb and Apr are within two months, so their labels go below or are dropped.
    const hours = [6, 7, 9, 7.5, 5, 3, 2.5, 3, 4, 5, 5.5, 6];
    const chart = yearSunChart(hours.map((h, i) => ({ month: i + 1, label: LABELS[i], hours: h })), { currentMonth: 4 });
    const now = chart.callouts.find(c => c.kind === 'now');
    assert.equal(now.placement, 'below', 'now, next to the sun, sits under its dot');
    assert.ok(!chart.callouts.some(c => c.kind === 'most'), 'the peak label next to a below "Now" is dropped, not overlapped');
    for (const c of chart.callouts) {
        if (c.placement === 'above') assert.ok(Math.abs(c.month - chart.sun.month) > 2, `${c.label} would sit under the sun`);
    }
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
