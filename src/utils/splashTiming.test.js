import test from 'node:test';
import assert from 'node:assert/strict';
import { splashShouldExit, SPLASH_MIN_MS, SPLASH_POSTER_VIEW_MS, SPLASH_MAX_WAIT_MS, SPLASH_POSTER_SRC } from './splashTiming.js';

test('the splash waits for the app, the minimum time and a look at the poster', () => {
    assert.equal(splashShouldExit({ minElapsed: true, appReady: true, posterDone: true }), true);
    assert.equal(splashShouldExit({ minElapsed: true, appReady: true, posterDone: false }), false, 'poster still on screen');
    assert.equal(splashShouldExit({ minElapsed: true, appReady: false, posterDone: true }), false, 'app not ready');
    assert.equal(splashShouldExit({ minElapsed: false, appReady: true, posterDone: true }), false, 'too soon');
    assert.equal(splashShouldExit(), false);
});

test('the hard cap always wins, so a slow image or app never blocks', () => {
    assert.equal(splashShouldExit({ forceReady: true }), true);
    assert.ok(SPLASH_MIN_MS < SPLASH_POSTER_VIEW_MS && SPLASH_POSTER_VIEW_MS < SPLASH_MAX_WAIT_MS);
});

test('the poster path is versioned and matches the preload in index.html', async () => {
    assert.match(SPLASH_POSTER_SRC, /^\/splash-poster-v\d+\.webp$/);
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes(SPLASH_POSTER_SRC), 'index.html preloads the same file');
});
