import React from 'react';
import { normalizeBearing } from '../../utils/compass';

/**
 * Small compass used by the sun and wind panels.
 *
 * variant="sun"  – a sun glyph sits on the ring at `bearing` (where the sun is).
 * variant="wind" – an arrow through the centre shows the wind blowing FROM
 *                  `bearing` towards the opposite side.
 * `muted` greys the marker (sun below the horizon, calm air).
 */
export default function CompassDial({ bearing, variant = 'sun', size = 64, muted = false, label }) {
    const b = normalizeBearing(bearing);
    const r = 40;
    const c = 50;
    const accent = muted ? '#94a3b8' : variant === 'sun' ? '#f59e0b' : '#0ea5e9';

    const ticks = [];
    for (let i = 0; i < 36; i += 1) {
        const major = i % 9 === 0;
        const a = (i * 10 * Math.PI) / 180;
        const r1 = major ? r - 6 : r - 3;
        ticks.push(
            <line
                key={i}
                x1={c + Math.sin(a) * r1}
                y1={c - Math.cos(a) * r1}
                x2={c + Math.sin(a) * r}
                y2={c - Math.cos(a) * r}
                stroke={major ? '#64748b' : '#cbd5e1'}
                strokeWidth={major ? 1.6 : 1}
                strokeLinecap="round"
            />,
        );
    }

    return (
        <svg
            viewBox="0 0 100 100"
            width={size}
            height={size}
            role="img"
            aria-label={label}
            className="shrink-0"
        >
            <circle cx={c} cy={c} r={r + 6} fill="#f8fafc" stroke="rgba(15,23,42,0.06)" />
            {ticks}
            {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([t, deg]) => {
                const a = (deg * Math.PI) / 180;
                return (
                    <text
                        key={t}
                        x={c + Math.sin(a) * (r - 15)}
                        y={c - Math.cos(a) * (r - 15) + 3.6}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight={t === 'N' ? 800 : 600}
                        fill={t === 'N' ? '#0f172a' : '#94a3b8'}
                    >
                        {t}
                    </text>
                );
            })}

            {b !== null && variant === 'sun' && (
                <g transform={`rotate(${b} ${c} ${c})`}>
                    <line x1={c} y1={c} x2={c} y2={c - r + 2} stroke={accent} strokeWidth="1.5" strokeDasharray="2 3" />
                    <circle cx={c} cy={c - r} r="8" fill={accent} opacity="0.2" />
                    <circle cx={c} cy={c - r} r="5" fill={accent} stroke="#fff" strokeWidth="1.5" />
                </g>
            )}

            {b !== null && variant === 'wind' && (
                // Arrow points downwind: tail at the FROM bearing, head on the far side.
                <g transform={`rotate(${b} ${c} ${c})`}>
                    <line x1={c} y1={c - r + 8} x2={c} y2={c + r - 12} stroke={accent} strokeWidth="3" strokeLinecap="round" />
                    <path d={`M ${c - 6} ${c + r - 16} L ${c} ${c + r - 6} L ${c + 6} ${c + r - 16} Z`} fill={accent} />
                    <circle cx={c} cy={c - r + 8} r="3.2" fill="#fff" stroke={accent} strokeWidth="2" />
                </g>
            )}

            <circle cx={c} cy={c} r="2" fill="#0f172a" />
        </svg>
    );
}
