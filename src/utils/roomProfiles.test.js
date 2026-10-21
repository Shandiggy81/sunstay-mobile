import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomProfiles, compressObstructions, directionName, horizonAround, pointInGeometry, representativeFloorHeight, representativeLevel } from './roomProfiles.js';
import { calculateBalconySunDay } from './balconySunEngine.js';

// 40 m x 24 m block in Melbourne's CBD, long walls facing north and south.
const lat = -37.8136, lng = 144.9631, mPerDegLat = 111132, mPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);
const rect = (cx, cy, w, h) => ({ type: 'Polygon', coordinates: [[[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]]
    .map(([x, y]) => [lng + (cx + x) / mPerDegLng, lat + (cy + y) / mPerDegLat])] });
const own = rect(0, 0, 40, 24);

test('direction names and representative level', () => {
    assert.equal(directionName(0), 'North');
    assert.equal(directionName(359), 'North');
    assert.equal(directionName(250), 'West');
    assert.equal(directionName(135), 'South-east');
    assert.equal(representativeLevel(101.5), 19);
    assert.equal(representativeLevel(25.5), 5);
    assert.equal(representativeLevel(6), 1);
    assert.throws(() => representativeLevel(0), RangeError);
});

test('compression is conservative: never less shade than the detailed horizon', () => {
    const detailed = [{ start: 10.2, end: 11.1, minAltitude: 41.3 }, { start: 200, end: 230, minAltitude: 12.2 }];
    const compressed = compressObstructions(detailed);
    const at = (ranges, b) => Math.max(0, ...ranges.filter(r => r.start <= r.end ? b >= r.start && b <= r.end : b >= r.start || b <= r.end).map(r => r.minAltitude));
    for (let b = 0; b < 360; b += 0.5) assert.ok(at(compressed, b) >= at(detailed, b), `bearing ${b}`);
    assert.ok(compressed.length <= 3);
    assert.deepEqual(compressObstructions([]), []);
});

test('compression keeps ranges that wrap through north', () => {
    const compressed = compressObstructions([{ start: 350, end: 10, minAltitude: 20 }]);
    assert.equal(compressed.length, 1);
    assert.equal(compressed[0].start, 348);
    assert.equal(compressed[0].end, 12);
});

test('builds one room per main facade, shaded only by neighbours', () => {
    const rooms = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [] });
    assert.equal(rooms.length, 4);
    assert.deepEqual(rooms.map(r => r.name.split('-facing')[0]).sort(), ['East', 'North', 'South', 'West']);
    assert.ok(rooms.every(r => r.source === 'estimated-buildings' && r.floorLevel === 8 && r.obstructions.length === 0));
});

test('a wall pressed against an adjoining building is not offered as rooms', () => {
    const adjoining = { g: rect(0, 24, 40, 24), h: 120 };   // shares the north wall
    const rooms = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [adjoining] });
    assert.ok(!rooms.some(r => r.name.startsWith('North')), rooms.map(r => r.name).join(', '));
    assert.ok(rooms.some(r => r.name.startsWith('South')));
});

test('each direction appears once', () => {
    const lShape = { type: 'Polygon', coordinates: [[[0, 0], [40, 0], [40, 12], [20, 12], [20, 24], [0, 24], [0, 0]]
        .map(([x, y]) => [lng + (x - 20) / mPerDegLng, lat + (y - 12) / mPerDegLat])] };
    const names = buildRoomProfiles({ venueId: 'v', own: lShape, top: 40, neighbours: [] }, { minWallMetres: 4 }).map(r => r.name);
    assert.equal(new Set(names).size, names.length, names.join(', '));
});

test('pointInGeometry handles polygons and holes', () => {
    const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
    assert.equal(pointInGeometry([2, 2], square), true);
    assert.equal(pointInGeometry([5, 5], square), false);
    assert.equal(pointInGeometry([12, 2], square), false);
});

test('a wall whose midpoint sits inside a taller neighbour is a party wall', () => {
    const overlapping = { g: rect(0, 13, 40, 4), h: 120 };   // thin slab overlapping the north wall
    const rooms = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [overlapping] });
    assert.ok(!rooms.some(r => r.name.startsWith('North')), rooms.map(r => r.name).join(', '));
});

test('a tall tower across a narrow street is not mistaken for a party wall', () => {
    const tower = { g: rect(0, 27, 40, 6), h: 200 };   // 3 m gap, very steep view
    const rooms = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [tower] });
    assert.ok(rooms.some(r => r.name.startsWith('North')), rooms.map(r => r.name).join(', '));
});

test('horizonAround reads the horizon straight ahead, including across north', () => {
    assert.equal(horizonAround([{ start: 355, end: 5, minAltitude: 70 }], 0), 70);
    assert.equal(horizonAround([{ start: 100, end: 120, minAltitude: 70 }], 0), 0);
});

test('a tall tower across the street to the north takes away the north rooms\' winter sun', () => {
    const tower = { g: rect(0, 45, 40, 30), h: 120 };
    const open = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [] }).find(r => r.name.startsWith('North'));
    const shaded = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [tower] }).find(r => r.name.startsWith('North'));
    const minutes = room => calculateBalconySunDay({ lat, lng, facing: room.orientation, obstructions: room.obstructions, date: '2027-06-21' }).totalMinutes;
    assert.ok(minutes(open) > 400, `open north room gets most of the winter day (${minutes(open)} min)`);
    assert.ok(minutes(shaded) < minutes(open) / 2, `tower removes most of it (${minutes(shaded)} min)`);
});

test('rooms above a podium use the tower outline, not the podium edge', () => {
    // 80 x 80 m podium (20 m) with a 24 x 24 m tower (100 m) in the middle.
    // A 120 m neighbour stands 4 m east of the podium edge, so 32 m east of the tower.
    const podium = rect(0, 0, 80, 80), tower = rect(0, 0, 24, 24);
    const neighbour = { g: rect(52, 0, 16, 80), h: 120 };
    const floorHeight = representativeFloorHeight(100);
    assert.ok(floorHeight > 20 && floorHeight < 100);
    const east = rooms => rooms.find(r => r.name.startsWith('East'));
    const eastPeak = room => Math.max(...room.obstructions.filter(r => r.start <= 90 && r.end >= 90).map(r => r.minAltitude));
    const whole = east(buildRoomProfiles({ venueId: 'v', own: podium, top: 100, neighbours: [neighbour] }));
    const atLevel = east(buildRoomProfiles({ venueId: 'v', own: podium, ownAtLevel: tower, top: 100, neighbours: [neighbour] }));
    assert.equal(atLevel.wallMetres, 24);
    // From the podium edge the neighbour looks almost vertical; from the tower it does not.
    assert.ok(eastPeak(whole) > 80, `whole outline: ${eastPeak(whole)}`);
    assert.ok(eastPeak(atLevel) < 65, `tower outline: ${eastPeak(atLevel)}`);
});

test('a missing or empty ownAtLevel falls back to the whole outline', () => {
    const base = buildRoomProfiles({ venueId: 'v', own, top: 40, neighbours: [] });
    assert.deepEqual(buildRoomProfiles({ venueId: 'v', own, ownAtLevel: null, top: 40, neighbours: [] }), base);
    assert.deepEqual(buildRoomProfiles({ venueId: 'v', own, ownAtLevel: { type: 'Polygon', coordinates: [] }, top: 40, neighbours: [] }), base);
});
