/**
 * SunshineScoreBadge.jsx
 * ─────────────────────────────────────────────────
 * Compact Sunshine Score™ badge for VenueCard and map markers.
 * Three sizes: 'sm' (map pin), 'md' (card chip), 'lg' (detail panel)
 *
 * Usage:
 *   import SunshineScoreBadge from './SunshineScoreBadge';
 *   <SunshineScoreBadge venue={venue} weather={weather} size="md" />
 */

import { useMemo } from 'react';
import { calculateSunshineScore } from '../data/sunshineIntelligence';

export default function SunshineScoreBadge({ venue, weather = {}, size = 'md', showLabel = true }) {
  const score = useMemo(
    () => calculateSunshineScore(venue, weather),
    [venue, weather]
  );

  if (size === 'sm') {
    // Tiny dot for map markers — just the coloured score number
    return (
      <span
        className="inline-flex items-center justify-center rounded-full font-bold leading-none"
        style={{
          backgroundColor: score.gradeColor,
          color: '#fff',
          fontSize: '9px',
          width: '20px',
          height: '20px',
        }}
        title={`Sunshine Score: ${score.score}/100`}
      >
        {score.score}
      </span>
    );
  }

  if (size === 'lg') {
    // Full breakdown card for VenueDetail
    return (
      <div
        className="rounded-2xl p-4 border"
        style={{ backgroundColor: score.gradeBg, borderColor: score.gradeColor + '33' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sunshine Score™</p>
            <p className="text-2xl font-black" style={{ color: score.gradeColor }}>
              {score.gradeEmoji} {score.score}<span className="text-sm font-normal text-gray-400">/100</span>
            </p>
            <p className="text-sm font-semibold" style={{ color: score.gradeColor }}>{score.gradeLabel}</p>
          </div>
          <div
            className="text-4xl font-black"
            style={{ color: score.gradeColor, opacity: 0.15 }}
          >
            {score.grade}
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="space-y-1.5">
          {[
            { label: 'Sun Window', key: 'sunWindow', max: 25 },
            { label: 'Direct Exposure', key: 'sunExposure', max: 25 },
            { label: 'Comfort', key: 'comfort', max: 20 },
            { label: 'Wind Shelter', key: 'wind', max: 15 },
            { label: 'UV Quality', key: 'uv', max: 10 },
            { label: 'Golden Hour', key: 'goldenHour', max: 5 },
          ].map(({ label, key, max }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/60">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(score.breakdown[key] / max) * 100}%`,
                    backgroundColor: score.gradeColor,
                  }}
                />
              </div>
              <span className="text-xs font-semibold w-8 text-right" style={{ color: score.gradeColor }}>
                {score.breakdown[key]}/{max}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: 'md' chip for VenueCard
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{
        backgroundColor: score.gradeBg,
        color: score.gradeColor,
        border: `1px solid ${score.gradeColor}33`,
      }}
    >
      {score.gradeEmoji} {score.score}
      {showLabel && <span className="font-normal opacity-80">· {score.gradeLabel}</span>}
    </span>
  );
}
