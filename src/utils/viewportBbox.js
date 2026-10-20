/**
 * The geographic box the map canvas actually shows, as the plain
 * `{ minLng, minLat, maxLng, maxLat }` object `setBbox` and "Search this area" use.
 *
 * mapbox-gl's `getBounds()` leaves out the camera padding, and `fitBounds` and
 * `flyTo` keep their `padding` on the map after the move. The first-load
 * `fitBounds` pads 100px top and 200px bottom, so on a 303px-tall canvas
 * `getBounds()` described a 3px strip. Unprojecting the canvas corners ignores
 * the padding.
 *
 * @module utils/viewportBbox
 */

/**
 * The narrowest ground aspect (height / width, or its inverse) a real viewport
 * box may have, as a share of the container's own. Top-down, a box around the
 * canvas (rotated or not) is never narrower than the canvas, and pitch only
 * makes it taller, so a box under half of that is a wrong reading.
 */
const MIN_ASPECT_SHARE = 0.5;
const DEG_TO_RAD = Math.PI / 180;

/** Smallest box around `[lng, lat]` or `{ lng, lat }` points, or null without a valid one. */
export function bboxFromLngLats(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const point of points) {
        const lng = Number(Array.isArray(point) ? point[0] : point?.lng);
        const lat = Number(Array.isArray(point) ? point[1] : point?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
    }
    return { minLng, minLat, maxLng, maxLat };
}

/**
 * True when `bbox` could be the view of a `width` x `height` container: both
 * spans are positive and its ground aspect is not far narrower than the
 * container's. Ground distances use an equirectangular approximation at the
 * box's middle latitude, plenty at city scale.
 */
export function bboxMatchesContainer(bbox, width, height) {
    if (!bbox || !(width >= 1) || !(height >= 1)) return false;
    const { minLng, minLat, maxLng, maxLat } = bbox;
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return false;
    if (maxLng <= minLng || maxLat <= minLat) return false;

    const groundWidth = (maxLng - minLng) * Math.cos(((minLat + maxLat) / 2) * DEG_TO_RAD);
    const groundHeight = maxLat - minLat;
    if (!(groundWidth > 0)) return false;

    const boxAspect = groundHeight / groundWidth;
    const containerAspect = height / width;
    const narrowest = Math.min(containerAspect, 1 / containerAspect) * MIN_ASPECT_SHARE;
    return Math.min(boxAspect, 1 / boxAspect) >= narrowest;
}

/**
 * The box under the whole `width` x `height` canvas. `unproject([x, y])`
 * returns `{ lng, lat }` (mapbox `map.unproject`). Null when the canvas has no
 * size, a corner cannot be read, or the box fails `bboxMatchesContainer`.
 */
export function viewportBboxFromCanvas(width, height, unproject) {
    if (!(width >= 1) || !(height >= 1) || typeof unproject !== 'function') return null;
    const corners = [[0, 0], [width, 0], [width, height], [0, height]].map((corner) => unproject(corner));
    const bbox = bboxFromLngLats(corners);
    return bboxMatchesContainer(bbox, width, height) ? bbox : null;
}
