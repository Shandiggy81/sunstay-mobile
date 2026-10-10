import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSunHeight } from './sunWords.js';

describe('describeSunHeight', () => {
    it('uses words, not degrees', () => {
        assert.match(describeSunHeight({ isSunUp: true, altitude: 8 }), /^Low in the sky/);
        assert.match(describeSunHeight({ isSunUp: true, altitude: 25 }), /^Halfway up/);
        assert.match(describeSunHeight({ isSunUp: true, altitude: 55 }), /^High in the sky/);
    });

    it('handles night and missing data', () => {
        assert.equal(describeSunHeight({ isSunUp: false, altitude: -10 }), 'The sun has set.');
        assert.equal(describeSunHeight(null), 'The sun has set.');
        assert.equal(describeSunHeight({ isSunUp: true }), 'The sun is up.');
    });
});
