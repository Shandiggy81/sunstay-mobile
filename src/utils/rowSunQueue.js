/**
 * One shared, pausable queue for the café rows' sun days, so list rows never
 * compute during a scroll frame. Rows ask for a key; the queue works through
 * them in request order inside idle slices (runWhenIdle), yields when the
 * slice budget is used, and stops entirely while the list is scrolling.
 * Results are cached, so a row scrolled back into view gets its day at once.
 *
 * @module utils/rowSunQueue
 */
import { createLruCache } from './cafeRowSun.js';

/**
 * @param {{
 *   compute: (input: any) => any,  must not throw for a usable result; a throw stores `failed`
 *   schedule: (job: { result: any, run: (shouldYield: () => boolean) => boolean }, options: { onDone: () => void }) => () => void,
 *   failed?: any,
 *   cacheSize?: number,
 * }} options  `schedule` has runWhenIdle's signature and returns a cancel function.
 */
export function createRowSunQueue({ compute, schedule, failed = null, cacheSize = 600 }) {
    const results = createLruCache(cacheSize);
    const pending = new Map(); // key → { input, listeners: Set }
    let paused = false;
    let cancel = null;

    const job = {
        result: null,
        run(shouldYield) {
            while (pending.size > 0 && !paused) {
                const [key, item] = pending.entries().next().value;
                pending.delete(key);
                let value;
                try { value = compute(item.input); } catch { value = failed; }
                results.set(key, value);
                item.listeners.forEach((listener) => listener(value));
                if (pending.size > 0 && !paused && shouldYield()) return false;
            }
            return true;
        },
    };

    function kick() {
        if (cancel || paused || pending.size === 0) return;
        cancel = schedule(job, {
            onDone: () => {
                cancel = null;
                kick();
            },
        });
    }

    return {
        /** A cached result, or undefined. */
        get(key) {
            return results.get(key);
        },
        /**
         * Ask for `key`; `listener(value)` runs when it is ready (at once for a
         * cached result). Returns an unsubscribe that drops the request if no
         * other row still wants it.
         */
        request(key, input, listener) {
            const hit = results.get(key);
            if (hit !== undefined) {
                listener(hit);
                return () => {};
            }
            let item = pending.get(key);
            if (!item) {
                item = { input, listeners: new Set() };
                pending.set(key, item);
            }
            item.listeners.add(listener);
            kick();
            return () => {
                item.listeners.delete(listener);
                if (item.listeners.size === 0 && pending.get(key) === item) pending.delete(key);
            };
        },
        /** Stop computing while the list scrolls; resume when it stops. */
        setPaused(value) {
            paused = Boolean(value);
            if (paused) {
                cancel?.();
                cancel = null;
            } else {
                kick();
            }
        },
        get paused() { return paused; },
        get pendingCount() { return pending.size; },
    };
}
