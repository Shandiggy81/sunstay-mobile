import test from 'node:test';
import assert from 'node:assert/strict';
import { mapMomentBadge, momentBadgeDescriptor } from './mapMomentBadge.js';
import {
    CLUSTER_MOMENT_PROPERTIES,
    pointMomentMatches,
    clusterMomentBadge,
    clusterMomentFeatureSignature,
} from './clusterMomentBadge.js';

const NO_MATCHES = { sunCoffeeMatch: 0, sunLunchMatch: 0, sunSunsetMatch: 0 };

test('point match flags include each supported moment independently', () => {
    const moments = new Map([
        ['coffee', ['coffee']], ['lunch', ['lunch']], ['sunset', ['sunset']],
        ['all', ['coffee', 'lunch', 'sunset', 'afternoon']],
    ]);
    assert.deepEqual(pointMomentMatches('coffee', moments), { ...NO_MATCHES, sunCoffeeMatch: 1 });
    assert.deepEqual(pointMomentMatches('lunch', moments), { ...NO_MATCHES, sunLunchMatch: 1 });
    assert.deepEqual(pointMomentMatches('sunset', moments), { ...NO_MATCHES, sunSunsetMatch: 1 });
    assert.deepEqual(pointMomentMatches('all', moments), {
        sunCoffeeMatch: 1, sunLunchMatch: 1, sunSunsetMatch: 1,
    });
});

test('points without usable venue moments contribute zero to every aggregate', () => {
    for (const moments of [undefined, null, {}, [], new Map(),
        new Map([['venue', null]]), new Map([['venue', 'coffee']]),
        new Map([['venue', ['afternoon']]])]) {
        assert.deepEqual(pointMomentMatches('venue', moments), NO_MATCHES);
    }
    const moments = new Map([['null', ['coffee']], ['undefined', ['sunset']]]);
    assert.deepEqual(pointMomentMatches(null, moments), NO_MATCHES);
    assert.deepEqual(pointMomentMatches(undefined, moments), NO_MATCHES);
});

test('point flags normalize numeric ids and never mutate source moments', () => {
    const keys = Object.freeze(['coffee', 'sunset']);
    const moments = new Map([['0', keys]]);
    assert.deepEqual(pointMomentMatches(0, moments), {
        sunCoffeeMatch: 1, sunLunchMatch: 0, sunSunsetMatch: 1,
    });
    assert.deepEqual([...moments], [['0', ['coffee', 'sunset']]]);
    assert.strictEqual(moments.get('0'), keys);
});

// Evaluate the Mapbox expressions against point data, then apply their reducers.
function evaluate(expression, properties) {
    if (!Array.isArray(expression)) return expression;
    const [operator, ...args] = expression;
    if (operator === 'get') return properties[args[0]];
    if (operator === '+') return args.reduce((sum, arg) => sum + evaluate(arg, properties), 0);
    throw new Error(`Unsupported expression: ${operator}`);
}

function aggregate(points) {
    return Object.fromEntries(Object.entries(CLUSTER_MOMENT_PROPERTIES).map(([key, [operator, expression]]) => [
        key, evaluate([operator, ...points.map((properties) => evaluate(expression, properties))], {}),
    ]));
}

test('clusterProperties sum each point flag, counting venues once even with repeated moment keys', () => {
    const moments = new Map([
        ['a', ['coffee', 'coffee', 'sunset']], ['b', ['coffee', 'lunch', 'sunset']],
        ['c', ['sunset']], ['d', ['afternoon']], ['e', []],
    ]);
    const properties = [...moments.keys()].map((id) => pointMomentMatches(id, moments));
    assert.deepEqual(aggregate(properties), { sunCoffeeCount: 2, sunLunchCount: 1, sunSunsetCount: 3 });
    assert.deepEqual(aggregate([]), { sunCoffeeCount: 0, sunLunchCount: 0, sunSunsetCount: 0 });
    assert.ok(Object.isFrozen(CLUSTER_MOMENT_PROPERTIES));
});

for (const [moment, countProperty] of [
    ['coffee', 'sunCoffeeCount'], ['lunch', 'sunLunchCount'], ['sunset', 'sunSunsetCount'],
]) {
    test(`${moment} clusters reuse the pin's frozen clay badge and accessible description`, () => {
        const properties = Object.freeze({ point_count: 5, [countProperty]: 2 });
        const result = clusterMomentBadge(properties, moment);
        assert.equal(result.matchCount, 2);
        assert.strictEqual(result.badge, mapMomentBadge('venue', moment, new Map([['venue', [moment]]])));
        assert.strictEqual(result.badge, momentBadgeDescriptor(moment));
        assert.ok(Object.isFrozen(result.badge));
    });
}

test('chip off or unsupported moments never decorate a cluster with matches', () => {
    const properties = { point_count: 5, sunCoffeeCount: 2, sunLunchCount: 3, sunSunsetCount: 4 };
    for (const moment of [undefined, null, '', 'afternoon', 'moment-coffee', 'unknown']) {
        assert.deepEqual(clusterMomentBadge(properties, moment), { badge: null, matchCount: 0 });
        assert.equal(momentBadgeDescriptor(moment), null);
    }
});

test('only the active moment aggregate counts when chips switch', () => {
    const properties = { point_count: 5, sunCoffeeCount: 3, sunLunchCount: 0, sunSunsetCount: 2 };
    assert.equal(clusterMomentBadge(properties, 'coffee').matchCount, 3);
    assert.deepEqual(clusterMomentBadge(properties, 'lunch'), { badge: null, matchCount: 0 });
    assert.equal(clusterMomentBadge(properties, 'sunset').matchCount, 2);
    assert.deepEqual(clusterMomentBadge({ point_count: 5, sunCoffeeCount: 3 }, 'sunset'), {
        badge: null, matchCount: 0,
    });
});

test('missing, malformed or impossible counts cannot produce a badge or misleading aria count', () => {
    for (const count of [undefined, null, '', '2', true, -1, 0, 0.5, NaN, Infinity, 6, Number.MAX_SAFE_INTEGER + 1]) {
        assert.deepEqual(clusterMomentBadge({ point_count: 5, sunCoffeeCount: count }, 'coffee'), {
            badge: null, matchCount: 0,
        });
    }
    for (const total of [undefined, null, '', '5', true, -1, 0, 1.5, NaN, Infinity]) {
        assert.deepEqual(clusterMomentBadge({ point_count: total, sunCoffeeCount: 1 }, 'coffee'), {
            badge: null, matchCount: 0,
        });
    }
    for (const properties of [undefined, null, {}, []]) {
        assert.deepEqual(clusterMomentBadge(properties, 'coffee'), { badge: null, matchCount: 0 });
    }
    assert.equal(clusterMomentBadge({ point_count: 5, sunCoffeeCount: 5 }, 'coffee').matchCount, 5);
});

function feature(properties) {
    return { type: 'Feature', properties: { cluster: true, cluster_id: 42, point_count: 5, ...properties },
        geometry: { type: 'Point', coordinates: [144.96, -37.81] } };
}

test('signature detects changed cluster sun counts with unchanged identity, total and centroid', () => {
    const before = [feature({ sunSunsetCount: 1 })];
    const after = [feature({ sunSunsetCount: 2 })];
    assert.notEqual(clusterMomentFeatureSignature(before, 'sunset'), clusterMomentFeatureSignature(after, 'sunset'));
    assert.notEqual(clusterMomentFeatureSignature(after, 'sunset'), clusterMomentFeatureSignature(after, 'coffee'));
    assert.notEqual(clusterMomentFeatureSignature(before, 'sunset'),
        clusterMomentFeatureSignature([feature({ sunSunsetCount: 0 })], 'sunset'));
    assert.equal(clusterMomentFeatureSignature(before, null), clusterMomentFeatureSignature(after, null));
});

test('signature ignores unrelated moments and noncluster features, and accepts missing features safely', () => {
    const before = [feature({ sunCoffeeCount: 2, sunSunsetCount: 1 })];
    const after = [feature({ sunCoffeeCount: 2, sunSunsetCount: 3 }),
        { properties: { id: 'venue', sunCoffeeMatch: 1 } }, null];
    assert.equal(clusterMomentFeatureSignature(before, 'coffee'), clusterMomentFeatureSignature(after, 'coffee'));
    for (const features of [undefined, null, {}, [], [null, {}]]) {
        assert.equal(typeof clusterMomentFeatureSignature(features, 'coffee'), 'string');
        assert.equal(clusterMomentFeatureSignature(features, null), 'none');
    }
});
