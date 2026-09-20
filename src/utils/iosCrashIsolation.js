/**
 * TEMPORARY iOS Safari crash isolation.
 * Delete this file, its test, DebugStaticSunny, and every import after the
 * crash matrix is finished. Do not treat these as product feature flags.
 *
 * Flip one const at a time, then reload Safari between groups.
 *
 * | Test | Mapbox | Sheet motion | Pull refresh |
 * |------|-------:|-------------:|-------------:|
 * | A    | On     | On           | On           |
 * | B    | Off    | On           | On           |
 * | C    | On     | Off          | On           |
 * | D    | On     | On           | Off          |
 * | E    | Off    | Off          | Off          |
 *
 * Same Safari sequence for every row: fresh reload, expand the venue sheet,
 * open Railway Hotel, switch Overview / Sun Forecast / Amenities, scroll,
 * close and reopen, repeat. Do not unmount the map or change Mapbox init
 * while running this matrix.
 */

export const DEBUG_MASCOT_RENDER = false;

export const ENABLE_MAPBOX = true;
export const ENABLE_SHEET_MOTION = true;
export const ENABLE_MASCOT_PULL_REFRESH = true;

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
