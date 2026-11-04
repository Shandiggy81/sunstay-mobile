import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    bestSideRows, defaultOpenSideId, hourRangeText, momentWindowText, reportTrustText, reportWords,
    seasonTable, sharedEvidence, sideRows, sunniestMonthsText,
} from './sunReportLayout.js';
import { buildHotelSunReport } from './hotelSunReport.js';
import { FACADE_TRUST_LINE, MODELLED_ROOM_TRUST_LINE } from './stayRoomTypes.js';

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

test('best side rows keep the summary order and say when no side gets sun', () => {
    const report = {
        timeZone: MELBOURNE, sunset: SUNSET,
        summary: [
            { key: 'coffee', title: 'Morning coffee', icon: 'coffee', roomName: 'North-east side · Level 2' },
            { key: 'lunch', title: 'Long lunch', icon: 'dining', roomName: 'North-west side · Level 2' },
            { key: 'afternoon', title: 'Afternoon', icon: 'afternoon-sun', roomName: null },
            { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', roomName: 'North-west side · Level 2' },
        ],
    };
    assert.deepEqual(bestSideRows(report), [
        { key: 'coffee', title: 'Morning coffee', icon: 'coffee', window: '6 to 10am', side: 'North-east side · Level 2' },
        { key: 'lunch', title: 'Long lunch', icon: 'dining', window: '12 to 2:30pm', side: 'North-west side · Level 2' },
        { key: 'afternoon', title: 'Afternoon', icon: 'afternoon-sun', window: '2:30 to 5pm', side: null },
        { key: 'sunset', title: 'Sunset drinks', icon: 'cocktail', window: '6:28 to 7:58pm', side: 'North-west side · Level 2' },
    ]);
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

test('summer and winter fold into one table of sun and shade', () => {
    const seasons = [
        { key: 'summer', label: 'Summer', date: '2026-01-15', moments: [
            { key: 'coffee', available: false }, { key: 'lunch', available: true },
            { key: 'afternoon', available: true }, { key: 'sunset', available: null },
        ] },
        { key: 'winter', label: 'Winter', date: '2026-07-15', moments: [
            { key: 'coffee', available: true }, { key: 'lunch', available: true },
            { key: 'afternoon', available: true }, { key: 'sunset', available: true },
        ] },
    ];
    const table = seasonTable(seasons);
    assert.deepEqual(table.columns, [{ key: 'summer', label: 'Summer · 15 Jan' }, { key: 'winter', label: 'Winter · 15 Jul' }]);
    assert.deepEqual(table.rows.map(({ key, title, icon, cells }) => [key, title, icon, cells]), [
        ['coffee', 'Morning coffee', 'coffee', ['shade', 'sun']],
        ['lunch', 'Long lunch', 'dining', ['sun', 'sun']],
        ['afternoon', 'Afternoon', 'afternoon-sun', ['sun', 'sun']],
        ['sunset', 'Sunset drinks', 'cocktail', ['unknown', 'sun']],
    ]);
    assert.deepEqual(seasonTable(undefined).columns, []);
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
    const sides = sideRows(report.rooms);
    assert.equal(sides[0].share, 1);
    assert.ok(sides.every(side => side.share >= 0 && side.share <= 1));
    assert.equal(defaultOpenSideId(report.rooms), report.rooms[0].id);
    assert.deepEqual(seasonTable(report.rooms[0].seasons).columns.map(column => column.label), ['Summer · 15 Jan', 'Winter · 15 Jul']);
});
