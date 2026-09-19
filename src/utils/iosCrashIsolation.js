/**
 * TEMPORARY iOS Safari crash isolation.
 * Delete this file, its test, DebugStaticSunny, and every import after the
 * crash matrix is finished. Do not treat these as product feature flags.
 *
 * Flip one const at a time, then reload Safari between groups.
 *
 * | Test | Mascot pull | Mapbox | Sheet motion |
 * |------|------------:|-------:|-------------:|
 * | A    | Off         | On     | On           |
 * | B    | On          | Off    | On           |
 * | C    | On          | On     | Off          |
 * | D    | On          | On     | On           |
 *
 * Also: static Sunny with pull off, repeated sheet open/close, repeated
 * refreshes, and long scrolling. Reload Safari between groups.
 */

export const DEBUG_MASCOT_RENDER = true;

export const ENABLE_MASCOT_PULL_REFRESH = true;
export const ENABLE_MAPBOX = true;
export const ENABLE_SHEET_MOTION = true;

export function crashTestId({ pull, map, motion }) {
    if (!pull && map && motion) return 'A';
    if (pull && !map && motion) return 'B';
    if (pull && map && !motion) return 'C';
    if (pull && map && motion) return 'D';
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
