/**
 * Map pins show the venue's own clay icon, large and on its own: the pin's
 * colour carries the sun level (a sunflower fill for full sun, a gold edge for
 * part sun, a grey edge for low), and the score number lives in the list and
 * on the card. A venue condition (heaters on, cozy, rain, cold, windy) still
 * shows its marker beside the icon, which the partner preview relies on to
 * show a status change, and night shows a moon. The numeric score stays in
 * the accessible label except in After Dark mode.
 *
 * Pure, so the look of every pin state is testable without a map.
 */

export const SUN_PIN_TIERS = Object.freeze({
    full:     { bg: '#FFE7A3', border: '#fbbf24', text: '#0f172a' },
    part:     { bg: '#ffffff', border: '#fbbf24', text: '#0f172a' },
    low:      { bg: '#ffffff', border: '#d6d3ce', text: '#475569' },
    unknown:  { bg: '#ffffff', border: '#d6d3ce', text: '#475569' },
    selected: { bg: '#ffffff', border: '#fbbf24', text: '#0f172a' },
});

// Conditions show their marker beside the icon, for idle and selected pins.
const CONDITION_GLYPHS = Object.freeze({
    heater: '🔥',
    cozy: '🛋️',
    rain: '🌧',
    cold: '🥶',
    windy: '💨',
});

export function sunTier(score) {
    if (!Number.isFinite(score)) return 'unknown';
    if (score >= 75) return 'full';
    if (score >= 50) return 'part';
    return 'low';
}

/**
 * @param {{ pinKey?: string, score?: number|null, emoji?: string|null, iconUrl?: string|null, selected?: boolean, highlighted?: boolean, night?: boolean, nightMode?: boolean }} input
 *   night: the sun is down at the map's time; the pin shows a moon, not 0.
 *   iconUrl: the venue's clay pin image (utils/clayVenuePins); the pin shows
 *   it in place of the emoji, which stays as the fallback if it fails to load.
 *   highlighted: the list row for this venue is hovered or focused (list ↔ map
 *   pairing). It raises the pin above every other, the selected one included.
 */
export function sunPinView({ pinKey = 'default', score = null, emoji = null, iconUrl = null, selected = false, highlighted = false, night = false, nightMode = false } = {}) {
    const n = Number.isFinite(score) ? Math.round(score) : null;
    const tier = selected ? 'selected' : sunTier(n);
    const style = SUN_PIN_TIERS[tier];
    const icon = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '📍';
    // No number on the pin: only a condition marker, or a moon after dark (every score is 0 then).
    const scoreText = n == null ? '' : CONDITION_GLYPHS[pinKey] ?? (night || nightMode ? '🌙' : '');
    return {
        tier,
        icon,
        iconUrl: typeof iconUrl === 'string' && iconUrl ? iconUrl : null,
        scoreText,
        bg: style.bg,
        border: style.border,
        text: style.text,
        label: nightMode ? 'After dark' : n == null ? 'Sun score unknown' : night ? `After dark. Sun score ${n}` : `Sun score ${n}`,
        // A selected or highlighted pin also gets a ring, so the cue is a
        // shape and not colour alone; highlighted also grows a little.
        ring: Boolean(selected || highlighted),
        raised: Boolean(highlighted),
        zIndex: highlighted ? 4 : tier === 'selected' ? 3 : tier === 'full' ? 2 : 1,
    };
}

/**
 * Map pins lie on the tilted map plane (pitchAlignment 'map'), so a box
 * `h` px tall shows h·cos(pitch) px tall on screen: 44 px is ~31 px at the
 * default 45°. This is the box height that keeps 44 px on screen, capped for
 * steep pitches. The extra height is transparent space above the pin.
 */
export const PIN_TOUCH_PX = 44;
export function pinHitHeight(pitch, { max = 96 } = {}) {
    const degrees = Number.isFinite(pitch) ? Math.min(Math.max(pitch, 0), 89) : 0;
    return Math.min(max, Math.ceil(PIN_TOUCH_PX / Math.cos(degrees * Math.PI / 180) - 1e-9));
}

/** Cluster bubbles grow a little with the count so busy areas read as busy. */
export function clusterSize(count) {
    const n = Number.isFinite(count) && count > 0 ? count : 1;
    if (n < 5) return 36;
    if (n < 15) return 42;
    return 48;
}
