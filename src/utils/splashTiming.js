/**
 * When the splash poster may close. The app must be ready and the minimum
 * time up, and the poster gets a moment on screen once it has loaded (or
 * has failed, so a missing image never holds the app). The hard cap
 * (forceReady) always wins, so the splash can never block the app.
 */
export const SPLASH_MIN_MS = 600;
export const SPLASH_POSTER_VIEW_MS = 1600;
export const SPLASH_MAX_WAIT_MS = 5000;

/** Versioned so a new poster is never served stale from cache; preloaded from index.html. */
export const SPLASH_POSTER_SRC = '/splash-poster-v1.webp';

export function splashShouldExit({ minElapsed = false, appReady = false, posterDone = false, forceReady = false } = {}) {
    if (forceReady) return true;
    return Boolean(minElapsed && appReady && posterDone);
}
