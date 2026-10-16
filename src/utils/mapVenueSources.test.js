import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterSourceFeatures, heatmapSourceData, HEATMAP_DEFAULT_WEIGHT } from './mapVenueSources.js';
import { geojsonPayloadKey } from './mapMarkerLifecycle.js';

const venues = [
    { id: 'a', lat: -37.81, lng: 144.96 },
    { id: 'b', lat: '-37.82', lng: '144.97' },
];

test('cluster features carry id, position and moment flags only', () => {
    const features = clusterSourceFeatures(venues, (id) => (id === 'a' ? { sunCoffeeMatch: 1 } : {}));
    assert.deepEqual(features[0], {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [144.96, -37.81] },
        properties: { id: 'a', sunCoffeeMatch: 1 },
    });
    assert.deepEqual(features[1].geometry.coordinates, [144.97, -37.82]);
    assert.equal('score' in features[0].properties, false);
});

test('a score change updates the heatmap but leaves the cluster payload alone', () => {
    const moments = () => ({});
    const before = { a: 40, b: 90 };
    const after = { a: 85, b: 10 };
    // The cluster source takes no scores at all, so its payload key (which
    // decides whether setData runs) cannot move with them.
    assert.equal(clusterSourceFeatures.length, 2);
    const clusterKey = geojsonPayloadKey(clusterSourceFeatures(venues, moments));
    assert.equal(clusterKey, geojsonPayloadKey(clusterSourceFeatures(venues, moments)));
    const heatBefore = heatmapSourceData(venues, (v) => before[v.id]);
    const heatAfter = heatmapSourceData(venues, (v) => after[v.id]);
    assert.deepEqual(heatBefore.features.map((f) => f.properties.score), [0.4, 0.9]);
    assert.deepEqual(heatAfter.features.map((f) => f.properties.score), [0.85, 0.1]);
});

test('a moment change does change the cluster payload', () => {
    const k = (flag) => geojsonPayloadKey(clusterSourceFeatures(venues, () => ({ sunCoffeeMatch: flag })));
    assert.notEqual(k(0), k(1));
});

test('heatmap weights are clamped to 0–1 and default when the score is missing', () => {
    const scores = [150, -20, null, undefined, NaN, '80'];
    const many = scores.map((_, i) => ({ id: `v${i}`, lat: -37.8, lng: 144.9 }));
    const data = heatmapSourceData(many, (v) => scores[Number(v.id.slice(1))]);
    assert.equal(data.type, 'FeatureCollection');
    assert.deepEqual(data.features.map((f) => f.properties.score),
        [1, 0, HEATMAP_DEFAULT_WEIGHT, HEATMAP_DEFAULT_WEIGHT, HEATMAP_DEFAULT_WEIGHT, HEATMAP_DEFAULT_WEIGHT]);
});

test('empty input gives empty sources', () => {
    assert.deepEqual(clusterSourceFeatures(null, () => ({})), []);
    assert.deepEqual(heatmapSourceData(undefined, () => 50).features, []);
});
