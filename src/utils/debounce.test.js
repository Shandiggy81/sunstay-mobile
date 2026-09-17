import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_DEBOUNCE_MS, createDebouncer, searchDebounceWait } from './debounce.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('search debounce', () => {
    it('keeps the settle delay in the 150–300ms band', () => {
        assert.ok(SEARCH_DEBOUNCE_MS >= 150);
        assert.ok(SEARCH_DEBOUNCE_MS <= 300);
    });

    it('flushes immediately when the query is cleared', () => {
        assert.equal(searchDebounceWait('', SEARCH_DEBOUNCE_MS), 0);
        assert.equal(searchDebounceWait('   ', SEARCH_DEBOUNCE_MS), 0);
        assert.equal(searchDebounceWait('cafe', SEARCH_DEBOUNCE_MS), SEARCH_DEBOUNCE_MS);
    });

    it('does not fire on each keystroke, only after typing settles', async () => {
        const calls = [];
        const debounced = createDebouncer((value) => calls.push(value), 40);

        debounced('c');
        debounced('ca');
        debounced('caf');
        await wait(20);
        assert.deepEqual(calls, []);

        debounced('cafe');
        await wait(60);
        assert.deepEqual(calls, ['cafe']);
        debounced.cancel();
    });

    it('cancel prevents a pending filter/score/fitBounds run', async () => {
        const calls = [];
        const debounced = createDebouncer((value) => calls.push(value), 40);
        debounced('bar');
        debounced.cancel();
        await wait(60);
        assert.deepEqual(calls, []);
    });
});
