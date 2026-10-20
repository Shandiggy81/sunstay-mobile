import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { layoutSunWindows } from './sunWindowsGraph.js';

const DATE = '2026-10-14';
const TIMEZONE = 'Australia/Melbourne';
const MINUTE = 60_000;
const at = time => `${DATE}T${time}:00+11:00`;
const window = (start, end) => ({ start: at(start), end: at(end) });
const layout = (options = {}) => layoutSunWindows({ date: DATE, ...options });
const referenceWindows = [window('06:42', '11:15'), window('13:05', '17:05')];

describe('sun-window input types and validation', () => {
  it('accepts offset-qualified ISO strings', () => {
    const result = layout({ windows: [window('09:15', '12:05')] });
    assert.equal(result.totalMinutes, 170);
    assert.equal(result.windows[0].rangeLabel, '9:15am – 12:05pm');
  });

  it('accepts finite epoch milliseconds', () => {
    const result = layout({ windows: [{ start: Date.parse(at('09:15')), end: Date.parse(at('12:05')) }] });
    assert.equal(result.totalMinutes, 170);
    assert.equal(result.windows[0].rangeLabel, '9:15am – 12:05pm');
  });

  it('accepts JS Date objects from existing sun-moment results without mutation', () => {
    const start = new Date(at('09:15'));
    const end = new Date(at('12:05'));
    const records = Object.freeze([Object.freeze({ start, end })]);
    const result = layout({ windows: records });
    assert.equal(result.totalMinutes, 170);
    assert.equal(start.toISOString(), '2026-10-13T22:15:00.000Z');
    assert.equal(end.toISOString(), '2026-10-14T01:05:00.000Z');
    assert.notEqual(result.windows[0], records[0]);
  });

  it('produces identical layouts for equivalent Date, epoch and offset-ISO inputs', () => {
    const source = window('09:15', '12:05');
    const iso = layout({ windows: [source], now: at('10:00') });
    const dates = layout({ windows: [{ start: new Date(source.start), end: new Date(source.end) }], now: new Date(at('10:00')) });
    const epochs = layout({ windows: [{ start: Date.parse(source.start), end: Date.parse(source.end) }], now: Date.parse(at('10:00')) });
    assert.deepEqual(dates, iso);
    assert.deepEqual(epochs, iso);
  });

  it('accepts a venue date expressed as a Date or zoned instant', () => {
    const expected = layout({ windows: referenceWindows });
    assert.deepEqual(layout({ date: new Date(`${DATE}T12:00:00+11:00`), windows: referenceWindows }), expected);
    assert.deepEqual(layout({ date: `${DATE}T12:00:00+11:00`, windows: referenceWindows }), expected);
  });

  it('drops invalid Date objects and records the problem instead of showing false sun', () => {
    const result = layout({ windows: [{ start: new Date(NaN), end: new Date(at('12:00')) }] });
    assert.equal(result.invalidWindowCount, 1);
    assert.equal(result.windowCount, 0);
    assert.equal(result.accessibleSummary, 'Sun times unavailable for this date.');
    assert.equal(result.now, null);
  });

  it('rejects ambiguous, impossible, missing and non-finite window timestamps', () => {
    const bad = [undefined, null, false, {}, NaN, Infinity, 'not a date', DATE, `${DATE}T09:00:00`,
      '2026-02-30T09:00:00+11:00', '2025-02-29T09:00:00Z', '2026-10-14T24:00:00Z',
      '2026-10-14T09:60:00Z', '2026-10-14T09:00:60Z', '2026-10-14T09:00:00+24:00'];
    const result = layout({ windows: bad.map(start => ({ start, end: at('12:00') })) });
    assert.equal(result.invalidWindowCount, bad.length);
    assert.equal(result.totalMinutes, 0);
    assert.equal(result.windowCount, 0);
  });

  it('drops zero and negative lengths, and clips away records from other venue dates', () => {
    const result = layout({ windows: [window('10:00', '10:00'), window('12:00', '11:00'),
      { start: '2026-10-13T09:00:00+11:00', end: '2026-10-13T10:00:00+11:00' }] });
    assert.equal(result.windowCount, 0);
    assert.equal(result.invalidWindowCount, 0);
    assert.equal(result.accessibleSummary, 'No direct sun on this date');
  });

  it('throws for invalid venue dates, zones, collections and explicit axes', () => {
    for (const date of [undefined, null, '2026-02-30', 'not a date', new Date(NaN), `${DATE}T09:00:00`]) {
      assert.throws(() => layout({ date }), RangeError);
    }
    for (const timezone of ['', null, 'Not/AZone']) assert.throws(() => layout({ timezone }), RangeError);
    assert.throws(() => layout({ windows: null }), RangeError);
    assert.throws(() => layout({ axisStart: 'invalid' }), RangeError);
    assert.throws(() => layout({ axisEnd: new Date(NaN) }), RangeError);
    assert.throws(() => layout({ axisStart: at('12:00'), axisEnd: at('11:00') }), RangeError);
    assert.throws(() => layout({ axisStart: at('12:00'), axisEnd: at('12:00') }), RangeError);
  });
});

describe('normalisation, exact totals and formatting', () => {
  it('uses the real reference-window sum of 8h33m, not the illustrative 6h25m headline', () => {
    const result = layout({ windows: referenceWindows });
    assert.equal(result.totalMinutes, 513);
    assert.equal(result.totalLabel, '8h 33m');
    assert.equal(result.totalMinutes, result.windows.reduce((sum, window) => sum + window.minutes, 0));
    assert.deepEqual(result.windows.map(window => window.durationLabel), ['4h 33m', '4h']);
    assert.equal(result.accessibleSummary, 'Sun 6:42am to 11:15am and 1:05pm to 5:05pm, 8 hours 33 minutes total.');
  });

  it('sorts, merges overlapping and touching windows, and never double-counts minutes', () => {
    const source = Object.freeze([Object.freeze(window('11:00', '13:00')), Object.freeze(window('09:00', '12:00')),
      Object.freeze(window('13:00', '14:00')), Object.freeze(window('10:00', '11:00'))]);
    const result = layout({ windows: source });
    assert.equal(result.windowCount, 1);
    assert.equal(result.totalMinutes, 300);
    assert.equal(result.totalLabel, '5h');
    assert.equal(result.windows[0].rangeLabel, '9:00am – 2:00pm');
    assert.equal(source[0].start, at('11:00'));
  });

  it('clips cross-midnight input to the requested venue date before counting it', () => {
    const result = layout({ windows: [
      { start: '2026-10-13T23:00:00+11:00', end: at('01:00') },
      { start: at('23:00'), end: '2026-10-15T02:00:00+11:00' },
    ] });
    assert.equal(result.totalMinutes, 120);
    assert.equal(result.windows[0].start, Date.parse(`${DATE}T00:00:00+11:00`));
    assert.equal(result.windows[1].end, Date.parse('2026-10-15T00:00:00+11:00'));
  });

  it('clips windows crossing both axis edges and computes the headline from those displayed windows', () => {
    const result = layout({ windows: [window('06:00', '10:00'), window('14:00', '19:00')],
      axisStart: at('08:00'), axisEnd: at('17:00') });
    assert.equal(result.totalMinutes, 300);
    assert.deepEqual(result.windows.map(window => window.rangeLabel), ['8:00am – 10:00am', '2:00pm – 5:00pm']);
    assert.equal(result.windows[0].xStart, 0);
    assert.equal(result.windows[1].xEnd, 360);
    assert.equal(result.totalMinutes, result.windows.reduce((sum, window) => sum + window.minutes, 0));
    assert.equal(result.clippedByAxis, true);
    assert.match(result.accessibleSummary, /Shown hours only\.$/);
  });

  it('does not claim the entire date has no sun when an explicit axis excludes every window', () => {
    const result = layout({ windows: [window('09:00', '10:00')], axisStart: at('12:00'), axisEnd: at('14:00') });
    assert.equal(result.windowCount, 0);
    assert.equal(result.totalMinutes, 0);
    assert.equal(result.clippedByAxis, true);
    assert.equal(result.accessibleSummary, 'No direct sun in the shown hours');
  });

  it('reports a fully omitted window even when another remains entirely visible', () => {
    const result = layout({ windows: [window('09:00', '10:00'), window('13:00', '14:00')],
      axisStart: at('12:00'), axisEnd: at('15:00') });
    assert.equal(result.clippedByAxis, true);
    assert.equal(result.windowCount, 1);
    assert.equal(result.totalMinutes, 60);
    assert.equal(result.accessibleSummary, 'Sun 1:00pm to 2:00pm, 1 hour total. Shown hours only.');
  });

  it('does not mark a genuinely empty day or the fitted default axis as clipped', () => {
    assert.equal(layout({ windows: referenceWindows }).clippedByAxis, false);
    const empty = layout({ axisStart: at('12:00'), axisEnd: at('14:00') });
    assert.equal(empty.clippedByAxis, false);
    assert.equal(empty.accessibleSummary, 'No direct sun on this date');
  });

  it('retains seconds and milliseconds so individual labels and headline do not round apart', () => {
    const result = layout({ windows: [
      { start: `${DATE}T09:00:00.000+11:00`, end: `${DATE}T09:00:30.001+11:00` },
      { start: `${DATE}T10:00:00.000+11:00`, end: `${DATE}T10:00:30.002+11:00` },
    ] });
    assert.equal(result.totalMilliseconds, 60_003);
    assert.equal(result.totalLabel, '1m 0.003s');
    assert.deepEqual(result.windows.map(window => window.durationLabel), ['30.001s', '30.002s']);
    assert.equal(result.windows[0].rangeLabel, '9:00am – 9:00:30.001am');
    assert.equal(result.totalMinutes, result.windows.reduce((sum, window) => sum + window.minutes, 0));
  });

  it('uses singular spoken units and never invents sun for empty input', () => {
    assert.equal(layout({ windows: [window('09:00', '10:01')] }).accessibleSummary,
      'Sun 9:00am to 10:01am, 1 hour 1 minute total.');
    const empty = layout();
    assert.equal(empty.totalLabel, '0m');
    assert.equal(empty.totalMinutes, 0);
    assert.equal(empty.windowCount, 0);
    assert.equal(empty.accessibleSummary, 'No direct sun on this date');
    assert.equal(empty.gaps.length, 1);
  });

  it('retains valid records while reporting partial invalid input honestly', () => {
    const result = layout({ windows: [window('09:00', '10:00'), { start: 'bad', end: at('12:00') }] });
    assert.equal(result.totalLabel, '1h');
    assert.equal(result.invalidWindowCount, 1);
    assert.match(result.accessibleSummary, /Some invalid sun windows were omitted/);
  });
});

describe('axis, geometry and current-time layout', () => {
  it('fits the windows with padding rounded to local whole hours rather than using midnight to midnight', () => {
    const result = layout({ windows: referenceWindows });
    assert.equal(result.axis.start, Date.parse(at('05:00')));
    assert.equal(result.axis.end, Date.parse(at('18:00')));
    assert.equal(result.dateLabel, 'Wed 14 Oct');
    assert.equal(result.timezoneLabel, 'Melbourne time');
    assert.ok(result.ticks.length >= 2 && result.ticks.length <= 5);
    assert.equal(result.ticks.length, 5);
    assert.equal(result.ticks[0].x, 0);
    assert.equal(result.ticks.at(-1).x, 360);
    assert.ok(result.ticks.every(tick => Number.isFinite(tick.x)));
  });

  it('uses a useful 6am–6pm empty axis and permits explicit Date/epoch bounds', () => {
    const empty = layout();
    assert.equal(empty.axis.start, Date.parse(at('06:00')));
    assert.equal(empty.axis.end, Date.parse(at('18:00')));
    const result = layout({ axisStart: new Date(at('07:00')), axisEnd: Date.parse(at('20:00')) });
    assert.deepEqual(result.axis, { start: Date.parse(at('07:00')), end: Date.parse(at('20:00')) });
  });

  it('leaves full-width endpoint labels clear when explicit axes include fractional seconds', () => {
    const result = layout({ axisStart: `${DATE}T06:01:02.003+11:00`, axisEnd: `${DATE}T18:04:05.006+11:00` });
    assert.deepEqual(result.ticks.map(tick => tick.label), ['6:01:02.003am', '12pm', '6:04:05.006pm']);
    assert.ok(result.ticks.length <= 5);
    const middle = result.ticks[1];
    const firstLabelRight = result.ticks[0].label.length * 6.5;
    const lastLabelLeft = 360 - result.ticks.at(-1).label.length * 6.5;
    assert.ok(middle.x - middle.label.length * 6.5 / 2 - firstLabelRight >= 12);
    assert.ok(lastLabelLeft - middle.x - middle.label.length * 6.5 / 2 >= 12);
  });

  it('supports either explicit axis bound independently and bounds oversized axes to the date', () => {
    assert.equal(layout({ axisStart: at('08:00') }).axis.start, Date.parse(at('08:00')));
    assert.equal(layout({ axisEnd: at('20:00') }).axis.end, Date.parse(at('20:00')));
    const result = layout({ axisStart: '2026-10-13T00:00:00+11:00', axisEnd: '2026-10-16T00:00:00+11:00' });
    assert.equal(result.axis.start, Date.parse(`${DATE}T00:00:00+11:00`));
    assert.equal(result.axis.end, Date.parse('2026-10-15T00:00:00+11:00'));
  });

  it('places one capped hill and midpoint sun per window, including three or more windows', () => {
    const result = layout({ windows: [window('06:30', '07:00'), window('10:30', '11:15'), window('13:00', '20:00')] });
    assert.equal(result.windowCount, 3);
    for (const window of result.windows) {
      assert.ok(window.xStart >= 0 && window.xEnd <= 360 && window.xEnd > window.xStart);
      assert.ok(window.height >= 32 && window.height <= 64);
      assert.equal(window.sun.x, (window.xStart + window.xEnd) / 2);
      assert.equal(window.sun.y, 104 - window.height);
      assert.ok(window.sun.radius >= 3 && window.sun.radius <= 15);
      assert.match(window.path, /^M .* C .* C .* Z$/);
      assert.doesNotMatch(window.path, /NaN|Infinity/);
    }
    assert.ok(result.windows[2].height > result.windows[0].height);
    assert.ok(result.windows[2].height / result.windows[0].height <= 2);
    const gapWidth = result.gaps.reduce((sum, gap) => sum + gap.xEnd - gap.xStart, 0);
    const sunWidth = result.windows.reduce((sum, window) => sum + window.xEnd - window.xStart, 0);
    assert.ok(Math.abs(gapWidth + sunWidth - 360) < 1e-9);
    assert.match(result.accessibleSummary, /, .* and .* total\.$/);
  });

  it('shows Now only on the venue-local date and distinguishes sun from a gap', () => {
    const inside = layout({ windows: referenceWindows, now: at('10:00') });
    const gap = layout({ windows: referenceWindows, now: at('12:00') });
    assert.equal(inside.now.inWindow, true);
    assert.equal(inside.now.withinAxis, true);
    assert.equal(gap.now.inWindow, false);
    assert.equal(gap.now.withinAxis, true);
    assert.equal(layout({ now: '2026-10-13T23:00:00Z' }).now !== null, true);
    assert.equal(layout({ now: '2026-10-14T23:00:00Z' }).now, null);
    assert.equal(layout({ now: new Date(NaN) }).now, null);
    assert.equal(layout({ now: DATE }).now, null);
    assert.equal(layout().now, null);
  });

  it('uses half-open sun windows and keeps outside-axis markers honest', () => {
    assert.equal(layout({ windows: [window('09:00', '10:00')], now: at('10:00') }).now.inWindow, false);
    const early = layout({ windows: referenceWindows, now: at('01:00') });
    assert.equal(early.now.withinAxis, false);
    assert.equal(early.now.x, 0);
    assert.equal(early.now.labelX, 22);
    const late = layout({ windows: referenceWindows, now: at('22:00') });
    assert.equal(late.now.withinAxis, false);
    assert.equal(late.now.x, 360);
    assert.equal(late.now.labelX, 338);
  });

  it('keeps Now labels within a 44px tag at both actual axis endpoints', () => {
    const options = { windows: referenceWindows, axisStart: at('06:00'), axisEnd: at('18:00') };
    const first = layout({ ...options, now: at('06:00') }).now;
    const last = layout({ ...options, now: at('18:00') }).now;
    assert.deepEqual([first.x, first.labelX, first.withinAxis], [0, 22, true]);
    assert.deepEqual([last.x, last.labelX, last.withinAxis], [360, 338, true]);
  });
});

describe('venue timezone and daylight saving', () => {
  it('counts elapsed time across Melbourne DST start and omits the nonexistent 2am tick', () => {
    const result = layoutSunWindows({ date: '2026-10-04', windows: [{
      start: '2026-10-04T01:30:00+10:00', end: '2026-10-04T03:30:00+11:00',
    }], now: '2026-10-03T15:45:00Z' });
    assert.equal(result.totalMinutes, 60);
    assert.equal(result.totalLabel, '1h');
    assert.equal(result.windows[0].rangeLabel, '1:30am (UTC+10) – 3:30am (UTC+11)');
    assert.ok(result.ticks.every(tick => !tick.label.startsWith('2am')));
    assert.equal(result.now.inWindow, true);
    assert.equal(result.dateLabel, 'Sun 4 Oct');
  });

  it('disambiguates repeated Melbourne clocks when daylight saving ends', () => {
    const result = layoutSunWindows({ date: '2026-04-05', windows: [
      { start: '2026-04-05T02:15:00+11:00', end: '2026-04-05T02:30:00+11:00' },
      { start: '2026-04-05T02:15:00+10:00', end: '2026-04-05T02:30:00+10:00' },
    ] });
    assert.equal(result.totalMinutes, 30);
    assert.equal(result.windowCount, 2);
    assert.match(result.windows[0].rangeLabel, /UTC\+11/);
    assert.match(result.windows[1].rangeLabel, /UTC\+10/);
  });

  it('omits interior ticks when ambiguous DST endpoint labels need the space', () => {
    const result = layoutSunWindows({ date: '2026-04-05',
      axisStart: '2026-04-05T02:00:00.001+11:00', axisEnd: '2026-04-05T02:59:59.999+10:00',
      windows: [{ start: '2026-04-05T02:10:00+11:00', end: '2026-04-05T02:50:00+10:00' }],
    });
    assert.deepEqual(result.ticks.map(tick => tick.label), ['2:00:00.001am (UTC+11)', '2:59:59.999am (UTC+10)']);
    assert.ok(result.ticks.length <= 5);
    assert.equal(result.totalMinutes, 100);
    assert.equal(result.windows[0].rangeLabel, '2:10am (UTC+11) – 2:50am (UTC+10)');
  });

  it('supports another venue timezone without using the browser clock', () => {
    const result = layoutSunWindows({ date: DATE, timezone: 'America/Los_Angeles', windows: [
      { start: '2026-10-14T09:00:00-07:00', end: '2026-10-14T11:30:00-07:00' },
    ] });
    assert.equal(result.windows[0].rangeLabel, '9:00am – 11:30am');
    assert.equal(result.totalLabel, '2h 30m');
    assert.equal(result.timezoneLabel, 'Los Angeles time');
  });

  it('produces identical Melbourne layouts from five host/browser timezones, including the DST boundary', () => {
    const script = `import {layoutSunWindows} from './src/utils/sunWindowsGraph.js';
      console.log(JSON.stringify([
        layoutSunWindows({date:'2026-10-14',windows:[{start:'2026-10-14T06:42:00+11:00',end:'2026-10-14T11:15:00+11:00'},{start:'2026-10-14T13:05:00+11:00',end:'2026-10-14T17:05:00+11:00'}],now:'2026-10-14T01:00:00Z'}),
        layoutSunWindows({date:'2026-10-04',windows:[{start:'2026-10-04T01:30:00+10:00',end:'2026-10-04T03:30:00+11:00'}]})
      ]));`;
    const zones = ['Australia/Melbourne', 'Europe/London', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Auckland'];
    const results = zones.map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../..', import.meta.url), env: { ...process.env, TZ }, encoding: 'utf8',
    }).trim());
    for (const result of results) assert.equal(result, results[0]);
  });
});
