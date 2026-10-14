import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFacadeSun, estimateRoomTypesFromFacades } from './facadeSun.js';
import { calculateBalconySunDay } from './balconySunEngine.js';

const lat = -37.8136, lng = 144.9631, metresPerDegree = 6371008.8 * Math.PI / 180;
const coordinate = ([east, north]) => [lng + east / (metresPerDegree * Math.cos(lat * Math.PI / 180)), lat + north / metresPerDegree];
const polygon = points => ({ type: 'Polygon', coordinates: [[...points, points[0]].map(coordinate)] });
const square = polygon([[-10, -10], [10, -10], [10, 10], [-10, 10]]);
const north = facades => facades.find(f => Math.abs(f.bearing) < 1e-6);

test('square footprint produces outward N/E/S/W facades in metres for either winding order', () => {
    const reversed = { ...square, coordinates: [[...square.coordinates[0]].reverse()] };
    const copy = structuredClone(square);
    for (const footprint of [square, reversed, { type: 'Feature', geometry: square }]) {
        const facades = calculateFacadeSun(footprint);
        assert.deepEqual(facades.map(f => Math.round(f.bearing)), [0, 90, 180, 270]);
        facades.forEach(f => assert.ok(Math.abs(f.length - 20) < 0.001));
        assert.ok(north(facades).wallMidpoints[0][1] > lat);
        assert.deepEqual(facades.flatMap(f => f.obstructions), []);
    }
    assert.deepEqual(square, copy, 'input geometry is not mutated');
});

test('near-parallel wall sections merge across north and walls below 4m are ignored', () => {
    const bent = polygon([[-10, -10], [10, -10], [10, 10], [0, 10], [-10, 9]]);
    const facades = calculateFacadeSun(bent);
    assert.equal(facades.length, 4);
    const merged = facades.find(f => f.bearing > 350);
    assert.ok(merged.length > 20);
    assert.equal(merged.wallMidpoints.length, 2);
    assert.deepEqual(calculateFacadeSun(polygon([[0, 0], [3, 0], [3, 3], [0, 3]])), []);
});

test('40m neighbour 20m north blocks low sun at ground level, but not Level 20 at 60m', () => {
    const neighbour = { footprint: polygon([[-10, 30], [10, 30], [10, 50], [-10, 50]]), height_m: 40 };
    const ground = north(calculateFacadeSun(square, [neighbour], 0));
    const crossingNorth = ground.obstructions.find(range => range.start > range.end);
    assert.ok(crossingNorth, 'northern obstruction crosses 0 degrees');
    assert.ok(Math.abs(crossingNorth.minAltitude - Math.atan(40 / 20) * 180 / Math.PI) < 0.11);
    assert.deepEqual(calculateFacadeSun(square, [neighbour], 60).flatMap(f => f.obstructions), []);
    const south = calculateFacadeSun(square, [neighbour]).find(f => Math.round(f.bearing) === 180);
    assert.deepEqual(south.obstructions, [], 'neighbour behind a facade does not enter its view');
});

test('nearest ray intersection determines shade, and overlapping neighbours use the maximum horizon', () => {
    const footprint = polygon([[-10, 30], [10, 30], [10, 50], [-10, 50]]);
    const short = { footprint, height_m: 10 }, tall = { footprint, height_m: 40 };
    const ground = north(calculateFacadeSun(square, [short, tall]));
    assert.deepEqual(ground.obstructions, north(calculateFacadeSun(square, [tall])).obstructions);
    const raised = north(calculateFacadeSun(square, [tall], 20));
    assert.ok(Math.abs(Math.max(...raised.obstructions.map(r => r.minAltitude)) - 45) < 0.11);
});

test('sub-degree neighbours still appear in the conservative obstruction horizon', () => {
    const narrow = { footprint: polygon([[0.1, 100], [0.2, 100], [0.2, 104], [0.1, 104]]), height_m: 40 };
    assert.ok(north(calculateFacadeSun(square, [narrow])).obstructions.length > 0);
});

test('facade horizons are accepted by the balcony engine and correctly reduce direct sun', () => {
    const neighbour = { footprint: polygon([[-100, 30], [100, 30], [100, 50], [-100, 50]]), height_m: 40 };
    const opts = { lat, lng, facing: 0, timeZone: 'Australia/Melbourne', date: '2027-06-21' };
    const open = calculateBalconySunDay(opts);
    const ground = calculateBalconySunDay({ ...opts, obstructions: north(calculateFacadeSun(square, [neighbour])).obstructions });
    const raised = calculateBalconySunDay({ ...opts, obstructions: north(calculateFacadeSun(square, [neighbour], 60)).obstructions });
    assert.ok(open.totalMinutes > 500);
    assert.equal(ground.totalMinutes, 0);
    assert.deepEqual(raised.windows, open.windows);
});

test('MultiPolygon input and unknown neighbour heights are handled without invented shading', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates] };
    assert.deepEqual(calculateFacadeSun(multi), calculateFacadeSun(square));
    assert.deepEqual(calculateFacadeSun(square, [{ footprint: square }, { footprint: {}, height_m: 40 }]), calculateFacadeSun(square));
    assert.throws(() => calculateFacadeSun({ type: 'Point', coordinates: [lng, lat] }), /Polygon/);
    assert.throws(() => calculateFacadeSun(square, [], -1), /height/);
    assert.throws(() => calculateFacadeSun(polygon([[0, 0], [1, 0], [2, 0]])), /area/);
});

test('one estimated room per main facade preserves bearing/horizon, with no price or balcony claim', () => {
    const facades = calculateFacadeSun(square, [], 36);
    const rooms = estimateRoomTypesFromFacades(facades, [0, 12]);
    assert.equal(rooms.length, 4);
    assert.equal(rooms[0].name, 'City side · North-facing · Level 12');
    rooms.forEach(room => {
        assert.equal(room.source, 'estimated');assert.equal(room.floorLevel, 12);assert.equal(room.floorHeight, 36);
        assert.equal('baseNightlyRateDemo' in room, false);assert.equal('hasBalcony' in room, false);
    });
    const obstructed = [{ bearing: 0, length: 10, obstructions: [{ start: 350, end: 20, minAltitude: 25 }] }];
    const copy = estimateRoomTypesFromFacades(obstructed, 1);
    copy[0].obstructions[0].minAltitude = 90;
    assert.equal(obstructed[0].obstructions[0].minAltitude, 25);
    assert.throws(() => estimateRoomTypesFromFacades(facades, -1), /floor/);
});
