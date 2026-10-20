import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoShowSunnyTip } from './sunnyTipVisibility.js';

test('first usable live advice or venue tip can show automatically', () => {
    for (const basis of ['live', 'tip']) {
        assert.equal(shouldAutoShowSunnyTip({ basis, hasShown: false, isChatOpen: false }), true);
    }
});
test('loading and unavailable advice wait without consuming the session', () => {
    for (const basis of ['loading', 'unavailable', undefined]) {
        assert.equal(shouldAutoShowSunnyTip({ basis, hasShown: false, isChatOpen: false }), false);
    }
});
test('shown advice stays dismissed for the session and chat suppresses all automatic advice', () => {
    for (const basis of ['live', 'tip', 'loading', 'unavailable']) {
        assert.equal(shouldAutoShowSunnyTip({ basis, hasShown: true, isChatOpen: false }), false);
        assert.equal(shouldAutoShowSunnyTip({ basis, hasShown: false, isChatOpen: true }), false);
    }
});
