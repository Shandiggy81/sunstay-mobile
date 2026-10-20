import { useEffect, useState, useSyncExternalStore } from 'react';
import { runWhenIdle } from '../utils/idleJob.js';
import { rowSunDay, rowSunKey } from '../utils/cafeRowSun.js';
import { createRowSunQueue } from '../utils/rowSunQueue.js';
import { DEFAULT_TIME_ZONE, venueLocalDate } from '../utils/balconySunEngine.js';

/** The row could not get a sun day (bad position or horizon): show the usual row. */
export const ROW_SUN_FAILED = Object.freeze({ failed: true });

// One queue for every café row: idle slices only, never while the list scrolls.
const queue = createRowSunQueue({
    compute: (input) => rowSunDay(input) ?? ROW_SUN_FAILED,
    schedule: runWhenIdle,
    failed: ROW_SUN_FAILED,
});

// If a list unmounts mid-scroll its "stopped" report never comes; resume anyway.
const SCROLL_PAUSE_LIMIT_MS = 3000;
let resumeTimer = null;

/** Virtuoso's isScrolling callback: pause row sun work while the list moves. */
export function setCafeRowSunScrolling(scrolling) {
    clearTimeout(resumeTimer);
    queue.setPaused(scrolling);
    if (scrolling) resumeTimer = setTimeout(() => queue.setPaused(false), SCROLL_PAUSE_LIMIT_MS);
}

// "Today" for a time zone, worked out once a minute rather than on every row
// render (Intl formatting showed up in the scroll profile).
const todayCache = new Map();
function venueToday(timeZone) {
    const minute = Math.floor(Date.now() / 60_000);
    const cached = todayCache.get(timeZone);
    if (cached && cached.minute === minute) return cached.date;
    let date = null;
    try { date = venueLocalDate(new Date(minute * 60_000), timeZone); } catch { date = null; }
    todayCache.set(timeZone, { minute, date });
    return date;
}

/**
 * Today's sun for one café list row (see utils/cafeRowSun). Virtuoso only
 * mounts visible rows; each asks the shared queue, which computes in idle
 * slices after paint and not at all while the list scrolls. Leaving the row
 * first drops its request.
 *
 * @returns {null | typeof ROW_SUN_FAILED | ReturnType<typeof rowSunDay>}
 *   null while pending
 */
export function useCafeRowSun({ venueId, lat, lng, horizon, timeZone = DEFAULT_TIME_ZONE }) {
    const date = horizon ? venueToday(timeZone) : null;
    const key = horizon && date && venueId != null ? rowSunKey(venueId, date) : null;
    const [entry, setEntry] = useState(() => (key ? queue.get(key) ?? null : null));

    useEffect(() => {
        if (!key) { setEntry(null); return undefined; }
        const hit = queue.get(key);
        if (hit !== undefined) { setEntry(hit); return undefined; }
        setEntry(null);
        return queue.request(key, { lat: Number(lat), lng: Number(lng), horizon, date, timeZone }, setEntry);
        // `date` is part of `key`.
    }, [key, lat, lng, horizon, timeZone]);

    return entry;
}

// One shared minute clock for every row's "Now" marker, instead of a timer per row.
const minuteListeners = new Set();
let minuteTimer = null;
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
let minuteValue = currentMinute();

function subscribeMinute(listener) {
    minuteListeners.add(listener);
    if (minuteTimer == null) {
        minuteTimer = setInterval(() => {
            const next = currentMinute();
            if (next === minuteValue) return;
            minuteValue = next;
            minuteListeners.forEach((l) => l());
        }, 15_000);
    }
    return () => {
        minuteListeners.delete(listener);
        if (minuteListeners.size === 0 && minuteTimer != null) {
            clearInterval(minuteTimer);
            minuteTimer = null;
        }
    };
}

/** Epoch ms at the start of the current minute, shared by all subscribers. */
export function useMinuteNow() {
    return useSyncExternalStore(subscribeMinute, () => {
        if (minuteTimer == null) minuteValue = currentMinute();
        return minuteValue;
    });
}
