import React from 'react';
import ClayIcon from './common/ClayIcon';
import SunDayTimeline from './SunDayTimeline.jsx';
import { formatCompactGuestWindows } from '../utils/comfortDisplay.js';

const SKY = Object.freeze({
  sun: { icon: 'sun', text: 'Clear', className: 'bg-amber-50 text-amber-900' },
  cloud: { icon: 'cloud', text: 'Cloud likely', className: 'bg-slate-100 text-slate-700' },
  rain: { icon: 'rain', text: 'Rain likely', className: 'bg-sky-50 text-sky-900' },
});

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Sun moments, in the app's 3D clay style: a hero with today's total sun and
 * the day bar, then a 2×2 grid of moments (morning coffee, long lunch,
 * afternoon, sunset drinks), each with its own clay icon, sun times and the
 * forecast sky. Used by hotel rooms (RoomSunCard) and by bars and cafes
 * (VenueCard "Sun moments today").
 *
 * @param {object} props
 * @param {object} props.daily calculateBalconySunDay() result
 * @param {ReturnType<import('../utils/sunMoments.js').sunMomentsFromDay>} props.summary
 * @param {string} props.timeZone
 * @param {Date} props.now
 * @param {string} props.label "sun on the balcony", "sun in the outdoor area", …
 */
export default function SunMomentsPanel({ daily, summary, timeZone, now, label = 'direct sun' }) {
  const total = summary?.totalMinutes ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white px-4 pb-1 pt-4">
        <ClayIcon name={total > 0 ? 'sun' : 'shaded'} size={84} className="pointer-events-none absolute -right-3 -top-3 drop-shadow-sm" />
        <p className="pr-20 text-[32px] font-extrabold leading-none tracking-[-0.02em] text-slate-900 tabular-nums">
          {total > 0 ? formatDuration(total) : 'In the shade'}
        </p>
        <p className="mt-1.5 pr-20 text-[13px] font-semibold text-slate-600">
          {total > 0 ? `of ${label} today` : `No direct ${label} today`}
        </p>
        <SunDayTimeline daily={daily} timeZone={timeZone} now={now} label={label} />
      </div>

      <ul className="grid grid-cols-2 gap-2" aria-label="Sun moments">
        {summary.moments.map((m) => {
          const sky = m.available ? SKY[m.sky] : null;
          const when = m.available
            ? formatCompactGuestWindows(m.windows, timeZone)
            : m.available === null ? 'Not today' : 'In the shade';
          return (
            <li
              key={m.key}
              className={`flex flex-col gap-1.5 rounded-2xl border p-3 ${m.available
                ? 'border-amber-200/80 bg-white shadow-[0_4px_14px_rgba(245,158,11,0.10)]'
                : 'border-slate-200/80 bg-slate-50'}`}
            >
              <ClayIcon name={m.icon} size={44} className={m.available ? '' : 'opacity-45 grayscale'} />
              <span className="text-[14px] font-extrabold leading-tight text-slate-900">{m.title}</span>
              <span className={`text-[12px] font-semibold leading-snug ${m.available ? 'text-amber-900' : 'text-slate-500'}`}>
                {when}
              </span>
              {sky ? (
                <span className={`inline-flex items-center gap-1 self-start rounded-full py-0.5 pl-0.5 pr-2 text-[11px] font-bold ${sky.className}`}>
                  <ClayIcon name={sky.icon} size={16} />
                  {sky.text}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
