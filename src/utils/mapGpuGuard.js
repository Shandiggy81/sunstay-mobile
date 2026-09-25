/**
 * Mobile Mapbox GPU guards. Public Mapbox GL JS 3.17 options only.
 * `optimizeForTerrain` is not a Map constructor option in this version.
 */

export const MOBILE_MAX_TILE_CACHE_SIZE = 10;
export const DESKTOP_MAX_TILE_CACHE_SIZE = 20;
export const MAP_CONTEXT_LOSS_COOLDOWN_MS = 5000;

let lockHeld = false;
let contextLostAt = null;

export function resetMapGpuGuard() {
    lockHeld = false;
    contextLostAt = null;
}

export function claimMapboxMount(now = Date.now()) {
    if (lockHeld) return { ok: false, reason: 'locked' };
    if (contextLostAt != null && now - contextLostAt < MAP_CONTEXT_LOSS_COOLDOWN_MS) {
        return { ok: false, reason: 'context-loss-cooldown' };
    }
    lockHeld = true;
    return { ok: true, reason: 'claimed' };
}

export function releaseMapboxMount() {
    lockHeld = false;
}

export function noteMapboxContextLost(now = Date.now()) {
    contextLostAt = now;
}

export function clearMapboxContextLoss() {
    contextLostAt = null;
}

/**
 * Directional light shadows. Mobile forces them off on every update.
 * Desktop keeps the caller's requested value. `cast-shadows` is a public
 * Mapbox GL JS 3.17 `setLights` property, not a Map constructor option.
 */
export function directionalCastShadows(isMobile, requested = true) {
    if (isMobile) return false;
    return requested !== false;
}

export function directionalLightShadowProps(isMobile, requested = true) {
    const shadows = directionalCastShadows(isMobile, requested);
    return {
        'cast-shadows': shadows,
        'shadow-intensity': shadows ? 1 : 0,
    };
}

export function mapMemoryOptions(isMobile) {
    const options = {
        maxTileCacheSize: isMobile ? MOBILE_MAX_TILE_CACHE_SIZE : DESKTOP_MAX_TILE_CACHE_SIZE,
        antialias: !isMobile,
    };
    if (isMobile) {
        options.config = { basemap: { show3dObjects: false } };
    }
    return options;
}

/** Hide Standard-style 3D objects, terrain draping, and any extrusion layers. */
export function suppressMobileGpuLayers(map) {
    const result = { objects: false, terrain: false, extrusion: 0 };
    if (!map) return result;
    try {
        if (typeof map.setConfigProperty === 'function') {
            map.setConfigProperty('basemap', 'show3dObjects', false);
            result.objects = true;
        }
    } catch {
        result.objects = false;
    }
    try {
        if (typeof map.setTerrain === 'function') {
            map.setTerrain(null);
            result.terrain = true;
        }
    } catch {
        result.terrain = false;
    }
    try {
        const layers = map.getStyle?.()?.layers || [];
        for (const layer of layers) {
            if (layer?.type !== 'fill-extrusion' || typeof map.setLayoutProperty !== 'function') continue;
            map.setLayoutProperty(layer.id, 'visibility', 'none');
            result.extrusion += 1;
        }
    } catch {
        // Style can still be loading. style.load retries this.
    }
    return result;
}
