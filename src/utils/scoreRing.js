/**
 * The sun score as a ring meter: the number sits inside a ring filled to the
 * score out of 100, so it can't be read as a temperature. A single element
 * paints it with two background layers: an inner disc over a conic fill.
 * Used by ScoreRing (React) and the map pins (plain DOM).
 */
export const SCORE_RING_TRACK = '#f1e6cf';

export function clampScore(score) {
    return Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : null;
}

/** Fill and number colours, on the same thresholds as the pins and list. */
export function scoreRingTone(score) {
    const n = clampScore(score);
    if (n == null) return { fill: '#cbd5e1', text: '#475569' };
    // Golds that match the clay sun, not the accent orange.
    if (n >= 75) return { fill: '#fbbf24', text: '#92400e' };
    if (n >= 50) return { fill: '#fcd34d', text: '#92400e' };
    return { fill: '#94a3b8', text: '#334155' };
}

/** CSS `background` for a ring of `size` px with a `stroke` px band. */
export function scoreRingBackground(score, { size = 40, stroke = 4, inner = '#ffffff', track = SCORE_RING_TRACK } = {}) {
    const n = clampScore(score) ?? 0;
    const { fill } = scoreRingTone(score);
    const radius = size / 2;
    const innerPct = Math.max(0, Math.round(((radius - stroke) / radius) * 1000) / 10);
    return `radial-gradient(closest-side, ${inner} ${innerPct}%, transparent ${Math.min(100, innerPct + 1)}%), `
        + `conic-gradient(${fill} ${n}%, ${track} 0)`;
}

/** Plain words for a score, for the card's stat tile. */
export function scoreBand(score) {
    const n = clampScore(score);
    if (n == null) return null;
    if (n >= 75) return 'Great sun';
    if (n >= 50) return 'Good sun';
    if (n >= 25) return 'Some sun';
    if (n > 0) return 'Little sun';
    return 'No direct sun';
}
