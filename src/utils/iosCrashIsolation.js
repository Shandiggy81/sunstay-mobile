/**
 * TEMPORARY iOS Safari crash isolation.
 * Delete this file, its test, DebugStaticSunny, and every import after the
 * crash matrix is finished. Do not treat these as product feature flags.
 *
 * Reload Safari between rows. Query params override localStorage, which
 * overrides VITE_IOS_* env values. Unset means the product default.
 *
 * Card-count matrix (leading hypothesis only — 59 cards are not a confirmed
 * cause). `venueLimit` does not change filtering, ordering, or the total
 * count. With no override the product list is a progressive window
 * (15, then Load more). `?venueLimit=15|30|45|59` is a diagnostic hard cap
 * with no Load more button. `?venueLimit=all` shows every filtered venue,
 * also with no Load more button. Demo data has 48 venues, so 59 still
 * renders every demo card; a larger Supabase payload is capped at 59.
 *
 * | Test | Mapbox | Render limit | Sheet motion | URL |
 * |------|-------:|-------------:|-------------:|-----|
 * | A    | On     | 59           | On           | ?matrixHud=1&venueLimit=59 |
 * | B    | Off    | 59           | On           | ?matrixHud=1&mapbox=0&venueLimit=59 |
 * | C    | On     | 15           | On           | ?matrixHud=1&venueLimit=15 |
 * | D    | On     | 59           | Off          | ?matrixHud=1&venueLimit=59&sheetMotion=0 |
 * | E    | Off    | 15           | Off          | ?matrixHud=1&mapbox=0&venueLimit=15&sheetMotion=0 |
 *
 * Also compare 15 / 30 / 45 / 59 with Mapbox and sheet motion left on:
 * ?matrixHud=1&venueLimit=15|30|45|59
 *
 * Record for each row: Safari terminated (yes/no); exact action before
 * failure; map failed first (yes/no, only with a context-loss signal);
 * mascot stuck first (yes/no); repetitions before failure; reload restored
 * the app (yes/no). A blank map is not WebGL loss without that signal.
 *
 * Sheet compositing, tested separately while sheet motion is on:
 * - ?sheetWillChange=off
 * - ?sheetWillChange=drag          (default: will-change only while dragging)
 * - ?sheetBackdrop=drag            (default: backdrop-filter none while dragging)
 * - ?sheetBackdrop=always          (keep blur while dragging)
 *
 * Mascot timeout check, separate from the crash matrix:
 * ?refreshHang=1  (user refresh waits until the 5s abort; Updating must clear)
 *
 * localStorage keys: ss-mapbox, ss-sheet-motion, ss-pull-refresh,
 * ss-venue-render-limit, ss-sheet-will-change, ss-sheet-backdrop,
 * ss-matrix-hud, ss-refresh-hang, ss-map-lifecycle. Values are 0/1, off/drag,
 * 15/30/45/59/all, or keep/unmount-expanded.
 *
 * Do not change Mapbox init or unmount while running this matrix.
 *
 * Map lifecycle is a separate opt-in. It does not change Mapbox constructor
 * options. Unset, `keep`, and any unknown value leave the map mounted:
 * ?matrixHud=1&mapLifecycle=keep
 * ?matrixHud=1&mapLifecycle=unmount-expanded
 * The second URL unmounts Mapbox only while the venue sheet is stably fully
 * expanded. Drag frames do not mount or unmount it.
 */

import { classifyVenueRenderLimit } from './venueRenderLimit.js';
import { parseMapLifecycle } from './mapLifecycle.js';

function parseEnabled(value, fallback) {
    if (value == null || value === '') return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    return fallback;
}

function parseWillChangeMode(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['off', 'none', '0', 'false'].includes(normalized)) return 'off';
    return 'while-dragging';
}

function parseBackdropMode(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['always', 'on', 'keep', '1'].includes(normalized)) return 'always';
    return 'none-while-dragging';
}

function readOverride(search, storage, env, queryKey, storageKey, envValue) {
    if (search.has(queryKey)) return search.get(queryKey);
    if (storage && typeof storage.getItem === 'function') {
        try {
            const stored = storage.getItem(storageKey);
            if (stored != null && stored !== '') return stored;
        } catch {
            // Private mode can throw on storage access.
        }
    }
    if (envValue != null && envValue !== '') return String(envValue);
    return null;
}

export function resolveIosIsolation(source = {}) {
    const search = new URLSearchParams(source.search || '');
    const storage = source.storage ?? null;
    const env = source.env || {};
    const read = (queryKey, storageKey, envValue) => readOverride(search, storage, env, queryKey, storageKey, envValue);
    const venueWindow = classifyVenueRenderLimit(read('venueLimit', 'ss-venue-render-limit', env.VITE_IOS_VENUE_RENDER_LIMIT));
    const venueLimit = venueWindow.limit;
    const mapbox = parseEnabled(read('mapbox', 'ss-mapbox', env.VITE_IOS_MAPBOX), true);
    const sheetMotion = parseEnabled(read('sheetMotion', 'ss-sheet-motion', env.VITE_IOS_SHEET_MOTION), true);
    return {
        debugMascot: parseEnabled(read('debugMascot', 'ss-debug-mascot', env.VITE_IOS_DEBUG_MASCOT), false),
        mapbox,
        sheetMotion,
        pullRefresh: parseEnabled(read('pullRefresh', 'ss-pull-refresh', env.VITE_IOS_PULL_REFRESH), true),
        venueRenderLimit: venueLimit,
        venueRenderMode: venueWindow.mode,
        sheetWillChange: parseWillChangeMode(read('sheetWillChange', 'ss-sheet-will-change', env.VITE_IOS_SHEET_WILL_CHANGE)),
        sheetBackdrop: parseBackdropMode(read('sheetBackdrop', 'ss-sheet-backdrop', env.VITE_IOS_SHEET_BACKDROP)),
        matrixHud: parseEnabled(read('matrixHud', 'ss-matrix-hud', env.VITE_IOS_MATRIX_HUD), false),
        refreshHang: parseEnabled(read('refreshHang', 'ss-refresh-hang', env.VITE_IOS_REFRESH_HANG), false),
        mapLifecycle: parseMapLifecycle(read('mapLifecycle', 'ss-map-lifecycle', env.VITE_IOS_MAP_LIFECYCLE)),
        sunForecast: parseEnabled(read('sunForecast', 'ss-sun-forecast', env.VITE_IOS_SUN_FORECAST), true),
        renderMatrix: renderMatrixTestId({ map: mapbox, limit: venueLimit, motion: sheetMotion }),
    };
}

function browserIsolationSource() {
    const env = import.meta.env ?? {};
    if (typeof window === 'undefined') {
        return { search: '', storage: null, env };
    }
    let storage = null;
    try { storage = window.localStorage; } catch { storage = null; }
    return { search: window.location?.search || '', storage, env };
}

const resolvedIsolation = resolveIosIsolation(browserIsolationSource());

export const DEBUG_MASCOT_RENDER = resolvedIsolation.debugMascot;
export const ENABLE_MAPBOX = resolvedIsolation.mapbox;
export const ENABLE_SHEET_MOTION = resolvedIsolation.sheetMotion;
export const ENABLE_MASCOT_PULL_REFRESH = resolvedIsolation.pullRefresh;
export const VENUE_RENDER_LIMIT = resolvedIsolation.venueRenderLimit;
export const VENUE_RENDER_MODE = resolvedIsolation.venueRenderMode;
export const SHEET_WILL_CHANGE_MODE = resolvedIsolation.sheetWillChange;
export const SHEET_BACKDROP_MODE = resolvedIsolation.sheetBackdrop;
export const MATRIX_HUD = resolvedIsolation.matrixHud;
export const VENUE_REFRESH_HANG = resolvedIsolation.refreshHang;
export const MAP_LIFECYCLE = resolvedIsolation.mapLifecycle;
export const ENABLE_SUN_FORECAST = resolvedIsolation.sunForecast;

export function renderMatrixTestId({ map, limit, motion }) {
    if (limit == null) return 'default';
    if (map && limit === 59 && motion) return 'A';
    if (!map && limit === 59 && motion) return 'B';
    if (map && limit === 15 && motion) return 'C';
    if (map && limit === 59 && !motion) return 'D';
    if (!map && limit === 15 && !motion) return 'E';
    return 'custom';
}

export function crashTestId({ map, motion, pull }) {
    if (map && motion && pull) return 'A';
    if (!map && motion && pull) return 'B';
    if (map && !motion && pull) return 'C';
    if (map && motion && !pull) return 'D';
    if (!map && !motion && !pull) return 'E';
    return 'custom';
}

export function venueListMode(enablePullRefresh = ENABLE_MASCOT_PULL_REFRESH) {
    return enablePullRefresh ? 'mascot-pull' : 'plain';
}

export function mapSurfaceMode(enableMapbox = ENABLE_MAPBOX) {
    return enableMapbox ? 'mapbox' : 'static-fallback';
}

export function sheetSurfaceMode(enableSheetMotion = ENABLE_SHEET_MOTION) {
    return enableSheetMotion ? 'framer-motion' : 'static-div';
}
