/**
 * Map pin as a label: the venue's own icon plus its sun score, coloured by
 * how much sun it gets (EatClub-style label pins, SunStay data).
 *
 * Pure, so the look of every pin state is testable without a map.
 */

export const SUN_PIN_TIERS = Object.freeze({
    full:     { bg: '#fbbf24', border: '#d97706', text: '#0f172a', glyph: '☀' },
    part:     { bg: '#ffffff', border: '#f59e0b', text: '#0f172a', glyph: '⛅' },
    low:      { bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b', glyph: '☁' },
    unknown:  { bg: '#ffffff', border: '#cbd5e1', text: '#475569', glyph: '' },
    selected: { bg: '#0f172a', border: '#0f172a', text: '#fbbf24', glyph: '☀' },
});

// Weather states that matter more than the sun reading itself. They keep the
// tier colour from the score but swap the glyph so the reason is visible.
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
 * @param {{ pinKey?: string, score?: number|null, emoji?: string|null, iconUrl?: string|null, selected?: boolean }} input
 *   iconUrl: the venue's clay pin image (utils/clayVenuePins); the pin shows
 *   it in place of the emoji, which stays as the fallback if it fails to load.
 */
export function sunPinView({ pinKey = 'default', score = null, emoji = null, iconUrl = null, selected = false } = {}) {
    const n = Number.isFinite(score) ? Math.round(score) : null;
    const tier = selected ? 'selected' : sunTier(n);
    const style = SUN_PIN_TIERS[tier];
    const condition = CONDITION_GLYPHS[pinKey] ?? null;
    let glyph = condition ?? style.glyph;
    if (selected && !condition) glyph = SUN_PIN_TIERS[sunTier(n)].glyph || '☀';
    const icon = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '📍';
    const scoreText = n == null ? '' : `${glyph ? `${glyph} ` : ''}${n}`;
    return {
        tier,
        icon,
        iconUrl: typeof iconUrl === 'string' && iconUrl ? iconUrl : null,
        scoreText,
        bg: style.bg,
        border: style.border,
        text: style.text,
        label: n == null ? 'Sun score unknown' : `Sun score ${n}`,
    };
}

/** Cluster bubbles grow a little with the count so busy areas read as busy. */
export function clusterSize(count) {
    const n = Number.isFinite(count) && count > 0 ? count : 1;
    if (n < 5) return 36;
    if (n < 15) return 42;
    return 48;
}
