import { directionalLightShadowProps } from './mapGpuGuard.js';

/** One lighting owner: Standard at night, the existing sun curve in Sun mode. */
export function mapLightMode({ nightMode = false, mapLoaded = false, generation, currentGeneration, stale = false } = {}) {
    if (!mapLoaded || stale || generation == null || generation !== currentGeneration) {
        return { preset: null, customLights: false };
    }
    return { preset: nightMode ? 'night' : 'day', customLights: !nightMode };
}

/** Restore Standard expressions without restoring expensive mobile shadows. */
export function standardLightsForPreset(lights, isMobile = false) {
    if (!Array.isArray(lights)) return null;
    return JSON.parse(JSON.stringify(lights)).map(light => isMobile && light.type === 'directional'
        ? { ...light, properties: { ...light.properties, ...directionalLightShadowProps(true) } }
        : light);
}
