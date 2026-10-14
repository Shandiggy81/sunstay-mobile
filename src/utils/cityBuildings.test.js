import test from 'node:test';
import assert from 'node:assert/strict';
import { chunk, cityBuildingRow, cityBuildingRows, CITY_BUILDINGS_ATTRIBUTION } from './cityBuildings.js';

const square = { type: 'Polygon', coordinates: [[[144.96, -37.81], [144.9601, -37.81], [144.9601, -37.8101], [144.96, -37.8101], [144.96, -37.81]]] };
const feature = (props, geometry = square) => ({
    type: 'Feature', geometry,
    properties: { objectid: '1', footprint_type: 'Structure', structure_min_elevation: 27.5,
        footprint_min_elevation: 91.5, footprint_max_elevation: 97.5, footprint_extrusion: 6, ...props },
});

test('height is the top of the component above the structure base, not its extrusion', () => {
    const row = cityBuildingRow(feature({}));
    assert.equal(row.height_m, 70);   // 97.5 - 27.5, the real sample from the dataset
    assert.equal(row.base_m, 64);     // 91.5 - 27.5: this component sits on a podium
    assert.equal(row.source_ref, 'com2023:1');
    assert.deepEqual(JSON.parse(row.geom_geojson), square);
});

test('a ground-level component has base 0', () => {
    const row = cityBuildingRow(feature({ footprint_min_elevation: 3, footprint_max_elevation: 7.5, structure_min_elevation: 3 }));
    assert.equal(row.height_m, 4.5);
    assert.equal(row.base_m, 0);
});

test('skips non-buildings, bad heights, bad geometry and missing ids', () => {
    assert.equal(cityBuildingRow(feature({ footprint_type: 'Tram Stop' })), null);
    assert.equal(cityBuildingRow(feature({ footprint_type: 'Bridge' })), null);
    assert.equal(cityBuildingRow(feature({ footprint_max_elevation: 27.6 })), null);        // 0.1 m
    assert.equal(cityBuildingRow(feature({ footprint_max_elevation: 527.5 })), null);       // 500 m
    assert.equal(cityBuildingRow(feature({ structure_min_elevation: null })), null);
    assert.equal(cityBuildingRow(feature({ objectid: '' })), null);
    assert.equal(cityBuildingRow(feature({}, { type: 'Point', coordinates: [144.96, -37.81] })), null);
    assert.equal(cityBuildingRow(feature({}, { type: 'Polygon', coordinates: [[[144.96, -37.81], [144.97, -37.81]]] })), null);
    assert.equal(cityBuildingRow(feature({}, { type: 'Polygon', coordinates: [[[200, -37.81], [144.97, -37.81], [144.97, -37.82], [200, -37.81]]] })), null);
});

test('accepts MultiPolygon footprints', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates] };
    assert.ok(cityBuildingRow(feature({}, multi)));
});

test('base never exceeds height', () => {
    const row = cityBuildingRow(feature({ footprint_min_elevation: 200 }));
    assert.equal(row.base_m, row.height_m);
});

test('collection conversion counts what it skipped and drops duplicate ids', () => {
    const { rows, skipped } = cityBuildingRows({ features: [
        feature({ objectid: 'a' }), feature({ objectid: 'a' }), feature({ objectid: 'b', footprint_type: 'Jetty' }),
        feature({ objectid: 'c', footprint_max_elevation: null }), null,
    ] });
    assert.equal(rows.length, 1);
    assert.deepEqual(skipped, { notStructure: 2, invalid: 1, duplicate: 1 });
});

test('chunk splits into batches and rejects bad sizes', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 3), []);
    assert.throws(() => chunk([1], 0), RangeError);
});

test('attribution names the licence', () => {
    assert.match(CITY_BUILDINGS_ATTRIBUTION, /City of Melbourne/);
    assert.match(CITY_BUILDINGS_ATTRIBUTION, /CC BY 4\.0/);
});
