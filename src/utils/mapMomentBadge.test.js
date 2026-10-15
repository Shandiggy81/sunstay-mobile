import test from 'node:test';
import assert from 'node:assert/strict';
import { mapMomentBadge } from './mapMomentBadge.js';

for (const [moment, icon, label] of [
    ['coffee', 'coffee', 'sun for morning coffee'],
    ['lunch', 'dining', 'sun for long lunch'],
    ['sunset', 'cocktail', 'sun for sunset drinks'],
]) {
    test(`${moment} uses its clay icon and accessible moment description`, () => {
        const moments = new Map([['venue', [moment]]]);
        assert.deepEqual(mapMomentBadge('venue', moment, moments), { moment, icon, label });
    });
}

test('no active or unsupported moment leaves even a matching venue unchanged', () => {
    const moments = new Map([['venue', ['coffee', 'afternoon', 'sunset']]]);
    for (const active of [undefined, null, '', 'afternoon', 'moment-coffee', 'unknown']) {
        assert.equal(mapMomentBadge('venue', active, moments), null);
    }
});

test('only the active moment on the requested venue receives a badge', () => {
    const moments = new Map([['coffee-only', ['coffee']], ['sunset-only', ['sunset']], ['none', []]]);
    assert.equal(mapMomentBadge('coffee-only', 'sunset', moments), null);
    assert.equal(mapMomentBadge('sunset-only', 'coffee', moments), null);
    assert.equal(mapMomentBadge('none', 'coffee', moments), null);
    assert.equal(mapMomentBadge('missing', 'coffee', moments), null);
});

test('missing or malformed map data never produces a badge', () => {
    for (const moments of [undefined, null, {}, { venue: ['coffee'] }, []]) {
        assert.equal(mapMomentBadge('venue', 'coffee', moments), null);
    }
    for (const entry of [undefined, null, 'coffee', new Set(['coffee']), {}]) {
        assert.equal(mapMomentBadge('venue', 'coffee', new Map([['venue', entry]])), null);
    }
});

test('normalizes numeric venue ids, including zero, and rejects absent ids', () => {
    const moments = new Map([['42', ['coffee']], ['0', ['sunset']], ['null', ['coffee']], ['undefined', ['coffee']]]);
    assert.equal(mapMomentBadge(42, 'coffee', moments)?.moment, 'coffee');
    assert.equal(mapMomentBadge('42', 'coffee', moments)?.moment, 'coffee');
    assert.equal(mapMomentBadge(0, 'sunset', moments)?.moment, 'sunset');
    assert.equal(mapMomentBadge(null, 'coffee', moments), null);
    assert.equal(mapMomentBadge(undefined, 'coffee', moments), null);
});

test('does not mutate the source map, moment arrays or shared badge descriptors', () => {
    const keys = Object.freeze(['coffee', 'lunch', 'sunset']);
    const moments = new Map([['venue', keys]]);
    const before = [...moments.entries()];
    const coffee = mapMomentBadge('venue', 'coffee', moments);
    assert.ok(Object.isFrozen(coffee));
    assert.throws(() => { coffee.icon = 'cocktail'; }, TypeError);
    assert.deepEqual(mapMomentBadge('venue', 'lunch', moments), {
        moment: 'lunch', icon: 'dining', label: 'sun for long lunch',
    });
    assert.strictEqual(mapMomentBadge('venue', 'coffee', moments), coffee);
    assert.deepEqual([...moments.entries()], before);
    assert.strictEqual(moments.get('venue'), keys);
    assert.deepEqual(keys, ['coffee', 'lunch', 'sunset']);
});
