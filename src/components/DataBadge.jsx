import React, { useEffect, useState } from 'react';
import { CloudSun, FlaskConical } from 'lucide-react';
import { getBadgeDisplayText, getBadgeRefreshDelay, getBadgeState } from '../utils/dataBadgeState.js';

const TONES = Object.freeze({
  live: {
    pill: 'border-accent bg-surface text-ink',
    marker: <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />,
  },
  cached: {
    pill: 'border-accent bg-surface text-ink',
    marker: <span className="h-2 w-2 rounded-full border-2 border-amber-600" />,
  },
  forecast: {
    pill: 'border-sky-300 bg-surface text-ink',
    marker: <CloudSun className="h-3 w-3 text-sky-700" />,
  },
  calculated: {
    pill: 'border-slate-300 bg-surface text-ink',
    marker: <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />,
  },
  estimated: {
    pill: 'border-dotted border-slate-400 bg-surface text-ink',
    marker: <span className="text-sm leading-none text-slate-600">≈</span>,
  },
  demo: {
    pill: 'border-dashed border-slate-500 bg-slate-200 text-ink',
    marker: <FlaskConical className="h-3 w-3 text-slate-600" />,
  },
  unavailable: { pill: 'border-slate-300 bg-surface text-slate-600', marker: null },
});

/** Informational provenance pill. Opaque tokens retain contrast on either surface. */
export default function DataBadge({ kind, updatedAt, source, size = 'md' }) {
  const [now, setNow] = useState(Date.now);
  const state = getBadgeState({ kind, updatedAt, now });
  const text = getBadgeDisplayText(state);
  const tone = TONES[state.tone];

  useEffect(() => {
    let timer;
    const tick = () => {
      window.clearTimeout(timer);
      const currentNow = Date.now();
      setNow(currentNow);
      const delay = getBadgeRefreshDelay({ kind, updatedAt, now: currentNow });
      if (delay != null) timer = window.setTimeout(tick, Math.min(delay, 2_147_483_647));
    };
    // One clock reading drives both the rendered state and the next deadline.
    tick();
    if (timer === undefined) return undefined;
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [kind, updatedAt]);

  const description = [text.accessibleLabel, source ? `Source ${source}` : null].filter(Boolean).join(', ');
  return (
    <span role="img" aria-label={description} title={description} data-tone={state.tone}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold leading-snug ${tone.pill} ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]'}`}>
      {tone.marker && <span aria-hidden="true" data-marker={state.tone} className="flex h-3 w-3 shrink-0 items-center justify-center">{tone.marker}</span>}
      <span aria-hidden="true" className="min-w-0 break-words">
        {text.visibleLabel}
      </span>
    </span>
  );
}
