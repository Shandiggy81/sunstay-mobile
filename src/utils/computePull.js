export const PULL_MAX_DISTANCE = 80;
export const PULL_THRESHOLD = 70;
export const PULL_RESISTANCE = 0.45;
export const PULL_MAX_SCALE = 1.15;

/**
 * Map a raw downward finger delta into a resisted pull.
 * Distance is capped at 80px; scale eases from 1 to 1.15.
 */
export function computePull(deltaY) {
    const resisted = Math.max(0, Number(deltaY) || 0) * PULL_RESISTANCE;
    const distance = Math.min(PULL_MAX_DISTANCE, resisted);
    const progress = PULL_MAX_DISTANCE === 0 ? 0 : distance / PULL_MAX_DISTANCE;
    const scale = 1 + (PULL_MAX_SCALE - 1) * progress;
    return {
        distance,
        scale,
        ready: distance >= PULL_THRESHOLD,
    };
}
