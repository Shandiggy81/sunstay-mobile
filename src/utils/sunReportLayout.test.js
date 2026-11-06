import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    bestSideRows, defaultOpenSideId, hourRangeText, momentFit, momentWindowText, reportTrustText, reportWords,
    seasonTable, sharedEvidence, sharedSideLevel, sideRows, sidesSubtitle, sunniestMonthsText, sunWindowsText,
} from './sunReportLayout.js';
import { buildHotelSunReport } from './hotelSunReport.js';
import { FACADE_TRUST_LINE, MODELLED_ROOM_TRUST_LINE } from './stayRoomTypes.js';
import { BEST_FOR_MIN_SHARE } from './bestForMoment.js';

const MELBOURNE = 'Australia/Melbourne';
// 7:58pm in Melbourne (UTC+11) on 4 Nov 2026.
const SUNSET = new Date('2026-11-04T08:58:00Z');

test('time windows read like the moments: "6 to 10am", "12 to 2:30pm"', () => {
    assert.equal(hourRangeText(6, 10), '6 to 10am');
    assert.equal(hourRangeText(12, 14.5), '12 to 2:30pm');
    assert.equal(hourRangeText(14.5, 17), '2:30 to 5pm');
    assert.equal(hourRangeText(11, 13), '11am to 1pm');
    assert.equal(hourRangeText(18.4667, 19.9667), '6:28 to 7:58pm');
    assert.equal(hourRangeText(7.99999, 9), '8 to 9am', 'rounds to the minute, never 7:60');
});

test('moment windows come from SUN_MOMENTS; sunset drinks end at today’s sunset', () => {
    assert.equal(momentWindowText('coffee'), '6 to 10am');
    assert.equal(momentWindowText('lunch'), '12 to 2:30pm');
    assert.equal(momentWindowText('afternoon'), '2:30 to 5pm');
    assert.equal(momentWindowText('sunset', { sunset: SUNSET, timeZone: MELBOURNE }), '6:28 to 7:58pm');
    assert.equal(momentWindowText('sunset', { sunset: null, timeZone: MELBOURNE }), 'Before sunset');
    assert.equal(momentWindowText('sunset', { sunset: new Date('nope'), timeZone: MELBOURNE }), 'Before sunset');
    assert.equal(momentWindowText('brunch'), null);
});

test('best side rows keep the summary order, say when the sun comes and when no side gets sun', () => {
    const at = (hhmm) => new Date(`2026-11-04T${hhmm}:00+11:00`);
    const report = {
        timeZone: MELBOURNE, sunset: SUNSET,
        summary: [
            { key: 'coffee', title: 'Morning coffee', icon: 'coffee', roomName: 'North-east side · Level 2',
                minutes: 222, windows: [{ start: at('06:18'), end: at('10:00') }] },
            { key: 'lunch', title: 'Long lunch', icon: 'dining', roomName: 'North-west side · Level 2',
                minutes: 150, windows: [{ start: at('12:00'), end: at('14:30') }] },
            { key: 'afternoon', title: 'Afternoon', icon: 'afternoon-sun', roomName: null, minutes: 0, windows: [] },
            // Six minutes of sun before sunset: the most of any side, but not a sunset-drinks side.
            { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', roomName: 'North-west side · Level 2',
                minutes: 6, windows: [{ start: at('19:47'), end: at('19:53') }] },
        ],
    };
    assert.deepEqual(bestSideRows(report), [
        { key: 'coffee', title: 'Morning coffee', icon: 'coffee', window: '6 to 10am', side: 'North-east side · Level 2', fit: 'sun', sun: 'Sun 6:18 to 10am' },
        { key: 'lunch', title: 'Long lunch', icon: 'dining', window: '12 to 2:30pm', side: 'North-west side · Level 2', fit: 'sun', sun: 'Sun 12 to 2:30pm' },
        { key: 'afternoon', title: 'Afternoon', icon: 'afternoon-sun', window: '2:30 to 5pm', side: null, fit: 'shade', sun: null },
        { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', window: '6:28 to 7:58pm', side: 'North-west side · Level 2', fit: 'some', sun: 'Sun 7:47 to 7:53pm only' },
    ]);
    // An older summary without minutes or windows still names the side, with no claim about how sunny it is.
    const [legacy] = bestSideRows({ timeZone: MELBOURNE, summary: [{ key: 'coffee', title: 'Morning coffee', icon: 'coffee', roomName: 'East side' }] });
    assert.deepEqual([legacy.side, legacy.fit, legacy.sun], ['East side', 'unknown', null]);
    assert.deepEqual(bestSideRows(null), []);
});

test('side rows compare each side with the sunniest; a failed side has no bar', () => {
    const rooms = [
        { id: 'nw', name: 'North-west side', durationText: '8h 41m', totalMinutes: 521 },
        { id: 'ne', name: 'North-east side', durationText: '7h 50m', totalMinutes: 470 },
        { id: 'se', name: 'South-east side', durationText: '4h 57m', totalMinutes: 297 },
        { id: 'x', name: 'Unknown side', durationText: 'Unavailable', totalMinutes: null, error: 'Room orientation is missing or invalid.' },
    ];
    const rows = sideRows(rooms);
    assert.deepEqual(rows.map(row => row.share === null ? null : Math.round(row.share * 100)), [100, 90, 57, null]);
    assert.equal(rows[3].error, 'Room orientation is missing or invalid.');
    assert.deepEqual(sideRows([{ id: 'a', name: 'A', durationText: '0m', totalMinutes: 0 }]).map(row => row.share), [0]);
    assert.deepEqual(sideRows(undefined), []);
});

test('the sunniest calculated side opens first', () => {
    assert.equal(defaultOpenSideId([{ id: 'nw', totalMinutes: 521 }, { id: 'ne', totalMinutes: 470 }]), 'nw');
    assert.equal(defaultOpenSideId([{ id: 'bad', totalMinutes: null, error: 'x' }, { id: 'ne', totalMinutes: 0 }]), 'ne');
    assert.equal(defaultOpenSideId([{ id: 'bad', totalMinutes: null, error: 'x' }]), 'bad');
    assert.equal(defaultOpenSideId([]), null);
});

test('sunniest months become one sentence', () => {
    assert.equal(sunniestMonthsText(['May', 'Jun', 'Jul']), 'Sunniest in May, June and July');
    assert.equal(sunniestMonthsText(['Jan', 'Dec']), 'Sunniest in January and December');
    assert.equal(sunniestMonthsText(['Jan']), 'Sunniest in January');
    assert.equal(sunniestMonthsText([]), null);
});

test('summer and winter fold into one table of sun, some sun and shade', () => {
    const seasons = [
        { key: 'summer', label: 'Summer', date: '2026-01-15', moments: [
            { key: 'coffee', available: false, minutes: 0 }, { key: 'lunch', available: true, minutes: 150 },
            { key: 'afternoon', available: true, minutes: 75 }, { key: 'sunset', available: null, minutes: 0 },
        ] },
        { key: 'winter', label: 'Winter', date: '2026-07-15', moments: [
            { key: 'coffee', available: true, minutes: 119 }, { key: 'lunch', available: true, minutes: 74 },
            { key: 'afternoon', available: true, minutes: 12 }, { key: 'sunset', available: true, minutes: 85 },
        ] },
    ];
    const table = seasonTable(seasons);
    assert.deepEqual(table.columns, [{ key: 'summer', label: 'Summer · 15 Jan' }, { key: 'winter', label: 'Winter · 15 Jul' }]);
    // 'sun' needs at least half the moment: 120 of coffee's 240 minutes, 75 of lunch's 150.
    assert.deepEqual(table.rows.map(({ key, title, icon, cells }) => [key, title, icon, cells]), [
        ['coffee', 'Morning coffee', 'coffee', ['shade', 'some']],
        ['lunch', 'Long lunch', 'dining', ['sun', 'some']],
        ['afternoon', 'Afternoon', 'afternoon-sun', ['sun', 'some']],
        ['sunset', 'Sunset drinks', 'cocktail', ['unknown', 'sun']],
    ]);
    assert.deepEqual(seasonTable(undefined).columns, []);
});

test('a moment counts as sunny only when direct sun covers at least half of it, like café "Best for"', () => {
    assert.equal(BEST_FOR_MIN_SHARE, 0.5);
    // Morning coffee 6–10am (240 min), long lunch and afternoon 150 min, sunset drinks 90 min.
    for (const [key, half] of [['coffee', 120], ['lunch', 75], ['afternoon', 75], ['sunset', 45]]) {
        assert.equal(momentFit(key, half), 'sun', `${key} at half`);
        assert.equal(momentFit(key, half - 1), 'some', `${key} just under half`);
        assert.equal(momentFit(key, 5), 'some', `${key} with a few minutes`);
        assert.equal(momentFit(key, 0), 'shade', `${key} without sun`);
    }
    for (const minutes of [null, undefined, NaN, -1, '120']) assert.equal(momentFit('coffee', minutes), 'unknown', String(minutes));
    assert.equal(momentFit('brunch', 120), 'unknown');
});

test('sun windows read as local times rounded to the minute', () => {
    // 4 Nov 2026 is daylight time in Melbourne (UTC+11).
    const at = (hhmmss) => new Date(`2026-11-04T${hhmmss}+11:00`);
    assert.equal(sunWindowsText([{ start: at('07:41:20'), end: at('10:00:00') }], MELBOURNE), 'Sun 7:41 to 10am');
    assert.equal(sunWindowsText([{ start: at('07:41:40'), end: at('09:59:50') }], MELBOURNE), 'Sun 7:42 to 10am', 'nearest minute, not truncated');
    assert.equal(sunWindowsText([{ start: at('11:30:00'), end: at('13:05:00') }], MELBOURNE), 'Sun 11:30am to 1:05pm');
    assert.equal(sunWindowsText([
        { start: at('07:10:00'), end: at('07:40:00') }, { start: at('09:20:00'), end: at('10:00:00') },
    ], MELBOURNE), 'Sun 7:10 to 7:40am and 9:20 to 10am');
    assert.equal(sunWindowsText([
        { start: at('12:00:00'), end: at('12:20:00') }, { start: at('13:00:00'), end: at('13:30:00') }, { start: at('14:00:00'), end: at('14:30:00') },
    ], MELBOURNE), 'Sun 12 to 12:20pm, 1 to 1:30pm and 2 to 2:30pm');
    assert.equal(sunWindowsText([{ start: at('10:00:00'), end: at('09:00:00') }, { start: 'x', end: null }], MELBOURNE), null);
    assert.equal(sunWindowsText([], MELBOURNE), null);
    assert.equal(sunWindowsText(undefined, MELBOURNE), null);
});

test('the evidence line shows once only when every side shares it', () => {
    const modelled = { display: { chip: null, evidenceLabel: 'Modelled · not yet confirmed by the hotel' } };
    const confirmed = { display: { chip: 'Confirmed by the hotel', evidenceLabel: 'Confirmed by the hotel' } };
    assert.equal(sharedEvidence([modelled, modelled]), 'Modelled · not yet confirmed by the hotel');
    assert.equal(sharedEvidence([confirmed, confirmed]), 'Confirmed by the hotel');
    assert.equal(sharedEvidence([modelled, confirmed]), null);
    assert.equal(sharedEvidence([modelled, {}]), null);
    assert.equal(sharedEvidence([]), null);
});

test('the header says once how far the sun data is confirmed', () => {
    const modelled = who => ({ display: { chip: null, evidenceLabel: `Modelled · not yet confirmed by the ${who}` } });
    const confirmed = { display: { chip: 'Confirmed by the hotel', evidenceLabel: 'Confirmed by the hotel' } };
    const facade = rooms => ({ display: { trustLine: FACADE_TRUST_LINE }, rooms });
    assert.equal(reportTrustText(facade([modelled('hotel'), modelled('hotel')])),
        'Modelled from building footprint and neighbours · not yet confirmed by the hotel');
    assert.equal(reportTrustText(facade([modelled('owner')])),
        'Modelled from building footprint and neighbours · not yet confirmed by the owner');
    assert.equal(reportTrustText({ display: { trustLine: MODELLED_ROOM_TRUST_LINE }, rooms: [modelled('hotel')] }),
        'Modelled · not yet confirmed by the hotel');
    assert.equal(reportTrustText(facade([confirmed, confirmed])), 'Confirmed by the hotel');
    assert.equal(reportTrustText(facade([confirmed, modelled('hotel')])), FACADE_TRUST_LINE, 'mixed: each side shows its own');
    assert.equal(reportTrustText({ display: { trustLine: null }, rooms: [confirmed, modelled('hotel')] }), null);
});

test('room-type reports talk about room types, facade reports about sides', () => {
    assert.deepEqual(reportWords('room_types'), { best: 'Best room today', list: 'Each room type', unit: 'room type' });
    assert.deepEqual(reportWords('facade_sides'), { best: 'Best side today', list: 'Each side of the building', unit: 'side' });
    assert.deepEqual(reportWords(undefined), reportWords('facade_sides'), 'no report yet: the facade wording');
});

test('a level every side shares is said once, not on every name', () => {
    const side = (title, level, minutes) => ({
        id: title, name: level ? `${title} · ${level}` : title, durationText: `${minutes}m`, totalMinutes: minutes,
        display: { title, level },
    });
    const rooms = [side('North-west side', 'Level 2', 521), side('North-east side', 'Level 2', 470)];
    assert.equal(sharedSideLevel(rooms), 'Level 2');
    assert.deepEqual(sideRows(rooms).map(row => row.name), ['North-west side', 'North-east side']);
    const report = {
        rooms, timeZone: MELBOURNE, sunset: SUNSET, display: { mode: 'facade_sides' },
        summary: [
            { key: 'coffee', title: 'Morning coffee', icon: 'coffee', roomName: 'North-east side · Level 2' },
            { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', roomName: null },
        ],
    };
    assert.deepEqual(bestSideRows(report).map(row => row.side), ['North-east side', null]);
    assert.equal(sidesSubtitle(report), 'Direct sun today, measured at level 2. Tap a side for its year and seasons.');

    // Different levels, or a side without one: every name keeps its level.
    const mixed = [side('North-west side', 'Level 2', 521), side('North-east side', 'Level 9', 470)];
    assert.equal(sharedSideLevel(mixed), null);
    assert.deepEqual(sideRows(mixed).map(row => row.name), ['North-west side · Level 2', 'North-east side · Level 9']);
    assert.equal(sharedSideLevel([side('North-west side', 'Level 2', 521), side('North-east side', null, 470)]), null);
    assert.equal(sidesSubtitle({ rooms: mixed, display: { mode: 'facade_sides' } }), 'Direct sun today. Tap a side for its year and seasons.');
    assert.equal(sidesSubtitle({ rooms: [], display: { mode: 'room_types' } }), 'Direct sun today. Tap a room type for its year and seasons.');
    assert.equal(sharedSideLevel(undefined), null);
});

test('works on a real report: sunniest side first, sunset window from today', () => {
    const report = buildHotelSunReport({
        lat: -37.8136, lng: 144.9631, timeZone: MELBOURNE,
        roomTypes: [
            { id: 'west', name: 'West-facing rooms', orientation: 'W' },
            { id: 'east', name: 'East-facing rooms', orientation: 'E' },
            { id: 'north', name: 'North-facing rooms', orientation: 0 },
        ],
    }, { date: '2026-11-04' });
    const best = bestSideRows(report);
    assert.deepEqual(best.map(row => row.key), ['coffee', 'lunch', 'afternoon', 'sunset']);
    assert.equal(best[0].side, 'East-facing rooms');
    assert.match(best[3].window, /^\d{1,2}(:\d{2})? to \d{1,2}(:\d{2})?pm$/);
    // Open east, north and west sides in November: each moment has a side in the sun for most of it.
    assert.deepEqual(best.map(row => row.fit), ['sun', 'sun', 'sun', 'sun']);
    assert.equal(best[1].sun, 'Sun 12 to 2:30pm');
    for (const row of best) assert.match(row.sun, /^Sun \d{1,2}(:\d{2})?(am|pm)? to \d{1,2}(:\d{2})?(am|pm)$/);
    const sides = sideRows(report.rooms);
    assert.equal(sides[0].share, 1);
    assert.ok(sides.every(side => side.share >= 0 && side.share <= 1));
    assert.equal(defaultOpenSideId(report.rooms), report.rooms[0].id);
    assert.deepEqual(seasonTable(report.rooms[0].seasons).columns.map(column => column.label), ['Summer · 15 Jan', 'Winter · 15 Jul']);
});

test('a few minutes of sun is the best side but never a sunny pick (real engine)', () => {
    // A side facing 350° on 4 Nov 2026 catches the sun only just before 10am and
    // just before sunset: the most sun of any side, so it is named, but "only".
    const report = buildHotelSunReport({
        lat: -37.8136, lng: 144.9631, timeZone: MELBOURNE,
        roomTypes: [{ id: 'nnw', name: 'North side', orientation: 350 }],
    }, { date: '2026-11-04' });
    const rows = new Map(bestSideRows(report).map(row => [row.key, row]));
    for (const key of ['coffee', 'sunset']) {
        const row = rows.get(key);
        const { minutes } = report.summary.find(item => item.key === key);
        assert.ok(minutes > 0 && minutes < (key === 'coffee' ? 120 : 45), `${key}: ${minutes} minutes`);
        assert.equal(row.side, 'North side');
        assert.equal(row.fit, 'some');
        assert.match(row.sun, /^Sun .+ only$/);
    }
    assert.equal(rows.get('lunch').fit, 'sun');
    assert.equal(rows.get('lunch').sun, 'Sun 12 to 2:30pm');
    // The season table follows the same rule as the best-side rows.
    const table = seasonTable(report.rooms[0].seasons);
    for (const row of table.rows) {
        row.cells.forEach((cell, index) => {
            const moment = report.rooms[0].seasons[index].moments.find(item => item.key === row.key);
            assert.equal(cell, moment.available ? momentFit(row.key, moment.minutes) : 'shade', `${row.key} ${index}`);
        });
    }
});
