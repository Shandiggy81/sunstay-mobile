/**
 * Map pins show the venue's own icon and the existing rounded sun score.
 * Tier colours and selection rings are presentation only.
 *
 * Pure, so the look of every pin state is testable without a map.
 */

export const SUN_PIN_TIERS = Object.freeze({
    full:     { bg: '#ffffff', border: '#f59e0b', text: '#0f172a' },
    part:     { bg: '#ffffff', border: '#f59e0b', text: '#0f172a' },
    low:      { bg: '#ffffff', border: '#d6d3ce', text: '#475569' },
    unknown:  { bg: '#ffffff', border: '#d6d3ce', text: '#475569' },
    selected: { bg: '#ffffff', border: '#f59e0b', text: '#0f172a' },
});

export function sunTier(score) {
    if (!Number.isFinite(score)) return 'unknown';
    if (score >= 75) return 'full';
    if (score >= 50) return 'part';
    return 'low';
}

/**
 * @param {{ pinKey?: string, score?: number|null, emoji?: string|null, iconUrl?: string|null, selected?: boolean, highlighted?: boolean }} input
 *   iconUrl: the venue's clay pin image (utils/clayVenuePins); the pin shows
 *   it in place of the emoji, which stays as the fallback if it fails to load.
 *   highlighted: the list row for this venue is hovered or focused (list ↔ map
 *   pairing). It raises the pin above every other, the selected one included.
 */
export function sunPinView({ pinKey = 'default', score = null, emoji = null, iconUrl = null, selected = false, highlighted = false } = {}) {
    const n = Number.isFinite(score) ? Math.round(score) : null;
    const tier = selected ? 'selected' : sunTier(n);
    const style = SUN_PIN_TIERS[tier];
    const icon = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '📍';
    const scoreText = n == null ? '' : String(n);
    return {
        tier,
        icon,
        iconUrl: typeof iconUrl === 'string' && iconUrl ? iconUrl : null,
        scoreText,
        bg: style.bg,
        border: style.border,
        text: style.text,
        label: n == null ? 'Sun score unknown' : `Sun score ${n}`,
        // A selected or highlighted pin also gets a ring, so the cue is a
        // shape and not colour alone; highlighted also grows a little.
        ring: Boolean(selected || highlighted),
        raised: Boolean(highlighted),
        zIndex: highlighted ? 4 : tier === 'selected' ? 3 : tier === 'full' ? 2 : 1,
    };
}

/** Cluster bubbles grow a little with the count so busy areas read as busy. */
export function clusterSize(count) {
    const n = Number.isFinite(count) && count > 0 ? count : 1;
    if (n < 5) return 36;
    if (n < 15) return 42;
    return 48;
}
