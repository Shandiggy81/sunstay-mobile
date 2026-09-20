import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOD_SCRUB_DEBOUNCE_MS, resolveTodScrubPublish } from './todScrub.js';
import { createDebouncer } from './debounce.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('time-of-day scrub debounce', () => {
    it('keeps the live slider on the thumb and delays cluster rebuilds by 150ms', () => {
        assert.equal(TOD_SCRUB_DEBOUNCE_MS, 150);
        const view = resolveTodScrubPublish({ liveMinutes: 720, publishedMinutes: 600 });
        assert.equal(view.sliderMinutes, 720);
        assert.equal(view.clusterRebuildMinutes, 600);
        assert.notEqual(view.sliderMinutes, view.clusterRebuildMinutes);
    });

    it('coalesces rapid scrub samples onto one publish after 150ms of quiet', async () => {
        const calls = [];
        const publish = createDebouncer((mins) => calls.push(mins), TOD_SCRUB_DEBOUNCE_MS);
        publish(610);
        publish(640);
        publish(700);
        await wait(40);
        assert.deepEqual(calls, []);
        await wait(TOD_SCRUB_DEBOUNCE_MS);
        assert.deepEqual(calls, [700]);
        publish.cancel();
    });
});
