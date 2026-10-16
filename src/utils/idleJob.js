/**
 * Run a resumable job in short slices while the page is idle, so a large
 * calculation never blocks taps or scrolling for long.
 *
 * A job has `run(shouldYield) → done` and `result` (see createSunMomentsJob).
 * Each slice works for at most `sliceMs` (less if the browser's idle period is
 * shorter), then yields. Browsers without requestIdleCallback (iOS Safari)
 * get a short timer between slices instead.
 *
 * The first slice waits up to IDLE_TIMEOUT_MS for an idle moment, so the job
 * doesn't compete with page start-up. Later slices wait at most
 * IDLE_NEXT_TIMEOUT_MS: a page that is never idle (a map redrawing) would
 * otherwise get one slice every IDLE_TIMEOUT_MS and take minutes to finish.
 */
export const IDLE_SLICE_MS = 8;
export const IDLE_FALLBACK_DELAY_MS = 50;
export const IDLE_TIMEOUT_MS = 2000;
export const IDLE_NEXT_TIMEOUT_MS = 100;

function defaultEnv() {
    const g = globalThis;
    const hasIdle = typeof g.requestIdleCallback === 'function' && typeof g.cancelIdleCallback === 'function';
    return {
        requestIdle: hasIdle ? (cb, opts) => g.requestIdleCallback(cb, opts) : null,
        cancelIdle: hasIdle ? (h) => g.cancelIdleCallback(h) : null,
        setTimer: (cb, ms) => g.setTimeout(cb, ms),
        clearTimer: (h) => g.clearTimeout(h),
        now: () => (g.performance?.now ? g.performance.now() : Date.now()),
    };
}

/**
 * Start `job` in idle slices. Calls `onDone(job.result)` once it finishes.
 * Returns a cancel function; after cancel nothing more runs and onDone is
 * never called.
 */
export function runWhenIdle(job, { onDone, env = defaultEnv(), sliceMs = IDLE_SLICE_MS } = {}) {
    let cancelled = false;
    let handle = null;
    let viaIdle = false;
    let first = true;

    const step = (deadline) => {
        handle = null;
        if (cancelled) return;
        const start = env.now();
        const idleLeft = deadline && !deadline.didTimeout && typeof deadline.timeRemaining === 'function'
            ? deadline.timeRemaining()
            : sliceMs;
        const budget = Math.max(1, Math.min(sliceMs, idleLeft));
        const done = job.run(() => env.now() - start >= budget);
        if (cancelled) return;
        if (done) onDone?.(job.result);
        else schedule();
    };

    const schedule = () => {
        if (env.requestIdle) {
            viaIdle = true;
            handle = env.requestIdle(step, { timeout: first ? IDLE_TIMEOUT_MS : IDLE_NEXT_TIMEOUT_MS });
        } else {
            viaIdle = false;
            handle = env.setTimer(() => step(null), IDLE_FALLBACK_DELAY_MS);
        }
        first = false;
    };

    schedule();
    return () => {
        cancelled = true;
        if (handle == null) return;
        if (viaIdle) env.cancelIdle?.(handle);
        else env.clearTimer(handle);
        handle = null;
    };
}
