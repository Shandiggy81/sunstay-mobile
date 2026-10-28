import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDisplayState } from './scoreDisplay.js';

test('night beats rain; only rain hides the number by day', () => {
    assert.equal(scoreDisplayState(), 'score');
    assert.equal(scoreDisplayState({ skyKind: 'sun' }), 'score');
    assert.equal(scoreDisplayState({ skyKind: 'cloud' }), 'score');
    assert.equal(scoreDisplayState({ skyKind: 'shaded' }), 'score');
    assert.equal(scoreDisplayState({ skyKind: 'rain' }), 'rain');
    assert.equal(scoreDisplayState({ isNight: true, skyKind: 'rain' }), 'night');
    assert.equal(scoreDisplayState({ isNight: true }), 'night');
});
