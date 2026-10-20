import React, { useId, useMemo } from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import { layoutSunWindows } from '../utils/sunWindowsGraph.js';

// 480px wide at most: axis labels then render at roughly 11–15px from 390px phones up.
const MAX_WIDTH = 'max-w-[480px]';

/**
 * Static, venue-local sun geometry. Callers supply engine windows and a clock.
 * `showSummary={false}` drops the caption and total for a caller that shows
 * its own headline from layoutSunWindows on the same input.
 * The SVG's text scales with its width, so the graph is capped at MAX_WIDTH
 * (left-aligned) to keep labels readable on a desktop-width sheet.
 */
export default function SunWindowsGraph({
  windows, date, timezone = 'Australia/Melbourne', now, axisStart, axisEnd, sunrise, sunset,
  variant = 'full', footer, className = '', showSummary = true,
}) {
  const id = `sun-windows-${useId().replace(/:/g, '')}`;
  const mini = variant === 'mini';
  const layout = useMemo(() => {
    try { return layoutSunWindows({ windows, date, timezone, now, axisStart, axisEnd, sunrise, sunset }); }
    catch { return null; }
  }, [windows, date, timezone, now, axisStart, axisEnd, sunrise, sunset]);
  const unavailable = !layout || (layout.invalidWindowCount > 0 && layout.windowCount === 0);
  const noSun = !unavailable && layout.windowCount === 0;
  const noSunText = layout?.clippedByAxis ? 'No direct sun in the shown hours' : 'No direct sun on this date';
  const incomplete = !unavailable && layout.invalidWindowCount > 0;
  const summary = unavailable ? 'Sun times unavailable' : layout.accessibleSummary;
  const marker = !unavailable && layout.now;

  const graph = (
    <svg role="img" aria-label={summary} data-sun-graph={variant}
      viewBox={mini ? '0 12 360 104' : '0 -8 360 154'}
      className="block h-auto w-full overflow-visible font-sans">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-sky-100)" />
          <stop offset="0.65" stopColor="var(--color-surface)" />
          <stop offset="1" stopColor="var(--color-amber-50)" />
        </linearGradient>
        <linearGradient id={`${id}-hill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-amber-200)" />
          <stop offset="1" stopColor="var(--color-accent)" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-slate-200)" />
          <stop offset="1" stopColor="var(--color-slate-300)" />
        </linearGradient>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-slate-400)" />
          <stop offset="1" stopColor="var(--color-slate-500)" />
        </linearGradient>
        <radialGradient id={`${id}-sun`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="var(--color-amber-100)" />
          <stop offset="0.5" stopColor="var(--color-amber-300)" />
          <stop offset="1" stopColor="var(--color-accent)" />
        </radialGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor="var(--color-amber-100)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--color-amber-100)" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-clay`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="var(--color-ink)" floodOpacity="0.12" />
        </filter>
        <clipPath id={`${id}-band`}><rect x="0" y="12" width="360" height="104" rx="18" /></clipPath>
        <g id={`${id}-sun-shape`}>
          <circle r="23" fill={`url(#${id}-glow)`} />
          <g stroke="var(--color-amber-400)" strokeWidth="2.8" strokeLinecap="round">
            {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => (
              <path key={angle} d="M 0 -16 L 0 -19" transform={`rotate(${angle})`} />
            ))}
          </g>
          <circle r="12" fill={`url(#${id}-sun)`} filter={`url(#${id}-clay)`} />
          <ellipse cx="-3" cy="-4" rx="5" ry="3" fill="var(--color-surface)" opacity="0.35" />
        </g>
      </defs>
      <g aria-hidden="true" clipPath={`url(#${id}-band)`}>
        <rect x="0" y="12" width="360" height="104" fill={`url(#${id}-sky)`} />
        {unavailable ? <rect x="0" y="96" width="360" height="20" fill={`url(#${id}-shade)`} /> : (
          <>
            {layout.gaps.map((gap, index) => (
              <path key={index} data-gap={gap.kind ?? 'gap'} d={gap.path}
                fill={`url(#${id}-${gap.kind === 'night' ? 'night' : 'shade'})`} />
            ))}
            {layout.windows.map(window => (
              <path key={window.start} data-sun-hill="true" d={window.path} fill={`url(#${id}-hill)`} />
            ))}
          </>
        )}
        {marker?.withinAxis && (
          <g data-now-marker="true">
            <path d={`M ${marker.x} 20 V 116`} stroke="var(--color-ink)" strokeWidth="1.5" strokeDasharray="4 4" />
            <circle cx={marker.x} cy="112" r="3" fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth="1.5" />
          </g>
        )}
        {!unavailable && layout.windows.map(window => (
          <use key={window.start} data-window-sun="true" href={`#${id}-sun-shape`}
            transform={`translate(${window.sun.x} ${window.sun.y}) scale(${window.sun.radius / 12})`} />
        ))}
      </g>
      {marker?.withinAxis && !mini && (
        <g aria-hidden="true" transform={`translate(${marker.labelX} 4)`}>
          <rect x="-21" y="-11" width="42" height="22" rx="11" fill="var(--color-ink)" />
          <text textAnchor="middle" y="4" fontSize="12" fontWeight="700" fill="var(--color-surface)">Now</text>
        </g>
      )}
      {!mini && !unavailable && layout.ticks.map((tick, index) => (
        <g key={tick.time} aria-hidden="true">
          <path d={`M ${tick.x} 118 V 123`} stroke="var(--color-slate-300)" />
          <text x={tick.x} y="140" textAnchor={index === 0 ? 'start' : index === layout.ticks.length - 1 ? 'end' : 'middle'}
            fontSize="12" fontWeight="500" fill="var(--color-slate-600)">{tick.label}</text>
        </g>
      ))}
    </svg>
  );

  if (mini) return <div className={`w-full ${MAX_WIDTH} ${className}`}>{graph}</div>;

  return (
    <section className={`w-full min-w-0 ${MAX_WIDTH} rounded-3xl border border-slate-200 bg-surface p-4 font-sans text-ink ${className}`}>
      {showSummary && (
        <>
          <p className="text-[12px] font-semibold text-slate-600">
            {incomplete ? 'Known direct sun on a clear day' : layout?.clippedByAxis ? 'Direct sun in shown hours on a clear day' : 'Direct sun on a clear day'}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            {noSun ? (
              <p data-sun-total="none" className="text-[20px] font-extrabold leading-tight tracking-tight">{noSunText}</p>
            ) : (
              <p data-sun-total="true" className="text-[32px] font-extrabold leading-tight tracking-tight tabular-nums">
                {unavailable ? '—' : layout.totalLabel}
              </p>
            )}
            {!unavailable && !noSun && (
              <p className="inline-flex items-center gap-1.5 text-[13px] font-bold text-amber-900">
                <ClayIcon name="sun" size={22} />
                {layout.windowCount} sun {layout.windowCount === 1 ? 'window' : 'windows'}
              </p>
            )}
          </div>
        </>
      )}
      {layout && (
        <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-600 ${showSummary ? 'mt-1' : ''}`}>
          <p><time dateTime={layout.date}>{layout.dateLabel}</time> · {layout.timezoneLabel}</p>
          {marker && <span data-now-pill="true" className={`rounded-full px-2 py-1 font-semibold ${marker.inWindow ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'}`}>
            {marker.withinAxis ? `Now · ${marker.inWindow ? 'in sun' : 'in shade'}` : 'Now · outside shown hours'}
          </span>}
        </div>
      )}
      {graph}
      {unavailable ? (
        <p className="mt-2 text-[13px] font-semibold text-slate-600">Sun times unavailable</p>
      ) : noSun ? null : (
        <ul aria-label="Direct sun windows" className="mt-2 flex flex-wrap gap-2">
          {layout.windows.map(window => (
            <li key={window.start} className="flex min-h-11 min-w-0 flex-1 basis-[230px] items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
              <ClayIcon name="sun" size={24} />
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                <span className="break-words text-[13px] font-bold">{window.rangeLabel}</span>
                <span className="text-[12px] font-medium">{window.durationLabel}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {incomplete && <p className="mt-2 text-[12px] font-medium text-slate-600">Some invalid sun times could not be shown.</p>}
      {footer != null && <div className="mt-3 min-w-0 text-[12px] leading-relaxed text-slate-600">{footer}</div>}
    </section>
  );
}
