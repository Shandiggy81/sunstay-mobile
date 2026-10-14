/**
 * LiveSunTimeline.jsx
 * Today's sun as one bar: amber for direct sun, light slate for cloud, rain
 * or shade, dark for night, and a ring for now.
 *
 * Props
 * ─────
 * forecast  deriveSunForecast() result. The card's "Today's sun" sentence
 *           and stat row read the same object, so the bar cannot disagree.
 */

import React, { useMemo } from 'react';
import { formatHour } from '../utils/sunForecastState.js';

const TIMELINE_START = 5;   // 5am left edge
const TIMELINE_END   = 22;  // 10pm right edge
const SPAN = TIMELINE_END - TIMELINE_START;

const HOUR_LABELS = [6, 9, 12, 15, 18, 21];

function pct(hour) {
  return Math.max(0, Math.min(100, ((hour - TIMELINE_START) / SPAN) * 100));
}

// 'day' is daylight with no forecast for that hour.
const KIND_TO_SEGMENT = { night: 'night', rain: 'shade', cloud: 'shade', sun: 'sun', day: 'day' };

function buildSegments(hours) {
  const segments = [];
  for (let h = TIMELINE_START; h < TIMELINE_END; h++) {
    const type = KIND_TO_SEGMENT[hours?.[h]?.kind] ?? 'night';
    const last = segments[segments.length - 1];
    if (last && last.type === type) last.end = h + 1;
    else segments.push({ start: h, end: h + 1, type });
  }
  return segments;
}

const SEGMENT_STYLE = {
  sun:   { bg: '#F59E0B', label: 'Direct sun' },
  shade: { bg: '#CBD5E1', label: 'Shade or cloud' },
  day:   { bg: '#E2E8F0', label: 'Daylight' },
  night: { bg: '#1E293B', label: 'Night' },
};

export default function LiveSunTimeline({ forecast }) {
  const nowH = forecast?.nowHour ?? 12;
  const segments = useMemo(() => buildSegments(forecast?.hours), [forecast?.hours]);
  const presentTypes = useMemo(
    () => ['sun', 'shade', 'day', 'night'].filter((t) => segments.some((s) => s.type === t)),
    [segments],
  );
  const showNow = nowH >= TIMELINE_START && nowH <= TIMELINE_END;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-4" role="img" aria-label={`Sun timeline for today. Now ${formatHour(nowH)}.`}>
        <div className="absolute inset-0 overflow-hidden rounded-full bg-slate-800">
          {segments.map((seg) => (
            <div
              key={seg.start}
              className="absolute inset-y-0"
              style={{ left: `${pct(seg.start)}%`, right: `${100 - pct(seg.end)}%`, background: SEGMENT_STYLE[seg.type].bg }}
            />
          ))}
        </div>
        {showNow ? (
          <span
            aria-hidden="true"
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-slate-900 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.35)]"
            style={{ left: `${pct(nowH)}%` }}
          />
        ) : null}
      </div>

      <div className="relative h-4" aria-hidden="true">
        {HOUR_LABELS.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 text-[11px] font-semibold tabular-nums text-slate-600"
            style={{ left: `${pct(h)}%` }}
          >
            {formatHour(h)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {presentTypes.map((type) => (
          <span key={type} className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: SEGMENT_STYLE[type].bg }} aria-hidden="true" />
            {SEGMENT_STYLE[type].label}
          </span>
        ))}
        {showNow ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-white" aria-hidden="true" />
            Now {formatHour(nowH)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
