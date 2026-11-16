import test from 'node:test';
import assert from 'node:assert/strict';
import { compassArcPath, compassPointAt, sunCompassView } from './sunCompass.js';
import { calculateBalconySunDay } from './balconySunEngine.js';

const venue = { lat: -37.8136, lng: 144.9631 };
const rooms = [
    { id: 'n', orientation: 0 }, { id: 'e', orientation: 90 }, { id: 's', orientation: 180 }, { id: 'w', orientation: 270 },
];
const MORNING = new Date('2026-10-19T00:00:00Z'); // 11am in Melbourne
const side = (view, id) => view.sides.find(entry => entry.id === id);

test('at 11am the sun is in the north-east: north and east are lit, west and south wait', () => {
    const view = sunCompassView({ rooms, venue, now: MORNING });
    assert.equal(view.live, true);
    assert.equal(view.night, false);
    assert.ok(view.sun.bearing > 10 && view.sun.bearing < 80, `sun bearing ${view.sun.bearing}`);
    assert.ok(view.sun.altitude > 30);
    assert.deepEqual(['n', 'e', 's', 'w'].map(id => side(view, id).state), ['now', 'now', 'later', 'later']);
    assert.match(side(view, 'n').status, /^In sun until \d{1,2}:\d{2}pm( AEDT)?$/);
    assert.match(side(view, 'w').status, /^Sun from \d{1,2}:\d{2}pm( AEDT)?$/);
    // A viewer outside Melbourne sees the venue's zone beside the time.
    assert.equal(side(view, 'n').title, 'North side');
    // Lit sides lead the list, longest sun first.
    assert.deepEqual(view.ranked.slice(0, 2).map(entry => entry.state), ['now', 'now']);
    assert.ok(view.ranked[0].totalMinutes >= view.ranked[1].totalMinutes);
});

test('each side agrees with the sun day the side cards compute', () => {
    const view = sunCompassView({ rooms, venue, now: MORNING });
    for (const room of rooms) {
        const day = calculateBalconySunDay({ ...venue, facing: room.orientation, obstructions: [], overhang: null, date: '2026-10-19' });
        assert.equal(side(view, room.id).totalMinutes, day.totalMinutes);
    }
});

test('a wall of buildings is reported as no direct sun, and that side goes last', () => {
    const blocked = [...rooms.slice(0, 3), { id: 'w', orientation: 270, obstructions: [{ start: 0, end: 360, minAltitude: 89 }] }];
    const view = sunCompassView({ rooms: blocked, venue, now: MORNING });
    assert.deepEqual([side(view, 'w').state, side(view, 'w').status, side(view, 'w').totalMinutes], ['none', 'No direct sun', 0]);
    assert.equal(view.ranked[view.ranked.length - 1].id, 'w');
});

test('after dark the compass has no sun and says where it has been', () => {
    const view = sunCompassView({ rooms, venue, now: new Date('2026-10-19T11:00:00Z') }); // 10pm
    assert.equal(view.sun, null);
    assert.equal(view.night, true);
    assert.ok(view.sides.every(entry => entry.state === 'done' && entry.status === 'Sun has left this side'));
});

test('another date has totals but no "now"', () => {
    const view = sunCompassView({ rooms, venue, date: '2026-12-21', now: MORNING });
    assert.equal(view.live, false);
    assert.equal(view.sun, null);
    assert.equal(view.night, false);
    assert.ok(view.sides.every(entry => entry.state === 'some' && entry.status === 'Gets direct sun'));
});

test('custom titles are used, and sides without a bearing are left out', () => {
    const view = sunCompassView({
        rooms: [...rooms, { id: 'x', orientation: '' }, { id: 'y' }], venue, now: MORNING,
        titleFor: room => (room.id === 'n' ? 'Harbour side' : null),
    });
    assert.equal(view.sides.length, 4);
    assert.equal(side(view, 'n').title, 'Harbour side');
    assert.equal(side(view, 'e').title, 'East side');
});

test('nothing is drawn without two modelled sides or usable coordinates', () => {
    assert.equal(sunCompassView({ rooms: rooms.slice(0, 1), venue, now: MORNING }), null);
    assert.equal(sunCompassView({ rooms, venue: { lat: null, lng: 144.9 }, now: MORNING }), null);
    assert.equal(sunCompassView({ rooms, venue: { lat: 'x', lng: 144.9 }, now: MORNING }), null);
    assert.equal(sunCompassView({ rooms: null, venue, now: MORNING }), null);
    assert.equal(sunCompassView(), null);
});

test('arcs sit on the dial with north up and never overlap', () => {
    assert.deepEqual(compassPointAt(0, 50), { x: 0, y: -50 });
    assert.deepEqual(compassPointAt(90, 50), { x: 50, y: 0 });
    assert.deepEqual(compassPointAt(180, 50), { x: 0, y: 50 });
    assert.equal(compassArcPath(90, 30, 50), 'M 43.3 -25 A 50 50 0 0 1 43.3 25');
    assert.equal(sunCompassView({ rooms, venue, now: MORNING }).spread, 36);
    const close = sunCompassView({ rooms: [{ id: 'a', orientation: 0 }, { id: 'b', orientation: 40 }], venue, now: MORNING });
    assert.equal(close.spread, 14);
    assert.equal(sunCompassView({ rooms: [{ id: 'a', orientation: 20 }, { id: 'b', orientation: 110 }], venue, now: MORNING }).buildingRotation, 20);
});
