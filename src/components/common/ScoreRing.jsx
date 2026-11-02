import React from 'react';
import { clampScore, scoreRingBackground, scoreRingTone } from '../../utils/scoreRing.js';

/**
 * The sun score as a ring meter (src/utils/scoreRing.js): the number inside a
 * ring filled to the score out of 100, so it never reads as degrees.
 */
export default function ScoreRing({ score, size = 40, stroke = 4, inner = '#ffffff', className = '' }) {
    const n = clampScore(score);
    const { text } = scoreRingTone(score);
    return (
        <span
            role="img"
            aria-label={n == null ? 'Sun score unknown' : `Sun score ${n} out of 100`}
            title={n == null ? 'Sun score unknown' : `Sun score ${n} out of 100`}
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums leading-none ${className}`}
            style={{ width: size, height: size, background: scoreRingBackground(score, { size, stroke, inner }), color: text, fontSize: Math.round(size * 0.36) }}
        >
            <span aria-hidden="true">{n ?? '–'}</span>
        </span>
    );
}
