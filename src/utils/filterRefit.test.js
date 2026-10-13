import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterChoiceKey, filterRefitNeeded } from './filterRefit.js';

const sunny = filterChoiceKey(['sunny-mode'], '');
const none = filterChoiceKey([], '');

describe('filterRefitNeeded', () => {
    it('treats the first load as the baseline', () => {
        assert.equal(filterRefitNeeded({ prevSetKey: null, nextSetKey: 'a,b', prevFilterKey: undefined, nextFilterKey: none }), false);
    });

    it('refits when the user changes a filter and the set changes', () => {
        assert.equal(filterRefitNeeded({ prevSetKey: 'a,b,c', nextSetKey: 'a', prevFilterKey: none, nextFilterKey: sunny }), true);
    });

    it('does not move the map when sun data or the slider changes the set', () => {
        assert.equal(filterRefitNeeded({ prevSetKey: 'a', nextSetKey: 'a,b', prevFilterKey: sunny, nextFilterKey: sunny }), false);
    });

    it('does nothing when the set is unchanged', () => {
        assert.equal(filterRefitNeeded({ prevSetKey: 'a', nextSetKey: 'a', prevFilterKey: none, nextFilterKey: sunny }), false);
    });

    it('keeps the old behaviour when no filter key is passed', () => {
        assert.equal(filterRefitNeeded({ prevSetKey: 'a', nextSetKey: 'b', prevFilterKey: undefined, nextFilterKey: undefined }), true);
    });
});

describe('filterChoiceKey', () => {
    it('ignores filter order, case and spaces in the search', () => {
        assert.equal(filterChoiceKey(['b', 'a'], ' Fitzroy '), filterChoiceKey(['a', 'b'], 'fitzroy'));
        assert.notEqual(filterChoiceKey(['a'], ''), filterChoiceKey(['a', 'b'], ''));
        assert.equal(filterChoiceKey(null, null), filterChoiceKey([], ''));
    });
});
