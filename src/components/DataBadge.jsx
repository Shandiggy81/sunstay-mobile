import React, { useEffect, useState } from 'react';
import { getBadgeRefreshDelay, getBadgeState } from '../utils/dataBadgeState.js';

const TONES = Object.freeze({
  live: 'border-accent',
  cached: 'border-accent',
  forecast: 'border-slate-300',
  calculated: 'border-slate-300',
  estimated: 'border-accent',
  demo: 'border-slate-300',
  unavailable: 'border-slate-300',
});

/** Informational provenance pill. Opaque tokens retain contrast on either surface. */
export default function DataBadge({ kind, updatedAt, source, size = 'md' }) {
  const [revision, refresh] = useState(0);
  const now = Date.now();
  const state = getBadgeState({ kind, updatedAt, now });

  useEffect(() => {
    const delay = getBadgeRefreshDelay({ kind, updatedAt, now });
    if (delay == null) return undefined;
    const tick = () => refresh(value => value + 1);
    const timer = window.setTimeout(tick, Math.min(delay, 2_147_483_647));
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [kind, updatedAt, now, revision]);

  const description = [state.label, state.sublabel, source ? `Source ${source}` : null].filter(Boolean).join(', ');
  return (
    <span role="img" aria-label={description} title={description} data-tone={state.tone}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border bg-surface font-semibold leading-snug text-ink ${TONES[state.tone]} ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]'}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-ink ${state.isLive ? 'motion-safe:animate-pulse' : ''}`} />
      <span aria-hidden="true" className="min-w-0 break-words">
        {state.label}{state.tone === 'cached' ? ` · ${state.sublabel}` : ''}
      </span>
    </span>
  );
}
