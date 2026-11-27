import React, { useMemo } from 'react';
import ClayIcon from './common/ClayIcon';
import SunDayTimeline from './SunDayTimeline.jsx';
import SunWindowsGraph from './SunWindowsGraph.jsx';
import { cardSunWindows, clearSkyTotal } from '../utils/sunWindowsCard.js';
import { formatCompactGuestWindows } from '../utils/comfortDisplay.js';
import { skyNow } from '../utils/skyNow.js';

const SKY = Object.freeze({
  sun: { icon: 'sun', text: 'Some sun forecast', className: 'bg-amber-50 text-amber-900' },
  cloud: { icon: 'cloud', text: 'Cloud forecast', className: 'bg-slate-100 text-slate-700' },
  rain: { icon: 'rain', text: 'Rain forecast', className: 'bg-sky-50 text-sky-900' },
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
 * @param {object|null} [props.forecast] today's deriveSunForecast() result. The
 *   total is clear-sky sun, so when the forecast gives less (or there is none
 *   to check) it reads "on a clear day" with the forecast's amount beneath.
 */
export default function SunMomentsPanel({ daily, summary, timeZone, now, label = 'direct sun', dayLabel = 'today', compact = false, forecast = null }) {
  const total = summary?.totalMinutes ?? 0;
  // The same sun-on-a-hill graph as the cafe and partner views. The flat bar
  // is only a fallback when the day can't be read.
  const sun = useMemo(() => cardSunWindows(daily), [daily]);
  const today = dayLabel === 'today';
  const clear = useMemo(
    () => (today && total > 0 ? clearSkyTotal({ totalMinutes: total, windows: daily?.windows, forecast, timeZone }) : null),
    [today, total, daily, forecast, timeZone],
  );
  const sky = today ? skyNow(forecast) : null;
  return (
    <div className={compact ? "ss-venue-moments" : "flex flex-col gap-3"}>
      <div className={compact ? "ss-venue-moments-summary" : "relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-white px-4 pb-1 pt-4"}>
        {/* The graph has its own smiling sun; the corner icon only marks a shaded day. */}
        {!compact && !(sun && total > 0) && <ClayIcon name={total > 0 ? 'sun' : 'shaded'} size={84} className="pointer-events-none absolute -right-3 -top-3" />}
        <p className={`${sun && total > 0 ? '' : 'pr-20 '}text-title font-extrabold leading-none tracking-normal text-slate-900 tabular-nums`}>
          {total > 0 ? formatDuration(total) : 'In the shade'}
        </p>
        <p className="mt-1.5 pr-20 text-secondary font-semibold text-slate-600">
          {total > 0 ? `of ${label} ${clear?.clearSky ? 'on a clear day' : dayLabel}` : `No ${label} ${dayLabel}`}
        </p>
        {/* Right padding only beside the corner icon, which shows without the graph. */}
        {clear?.forecastText ? <p data-sun-forecast className={`mt-1.5 ${!compact && !sun ? 'pr-20 ' : ''}text-secondary font-semibold text-slate-600`}>{clear.forecastText}</p> : null}
        {sun
          ? <div className="mb-3 mt-3"><SunWindowsGraph {...sun} now={now} sky={sky} showSummary={false} className={compact ? "ss-card-sun-graph ss-card-sun-graph--moments" : ""} /></div>
          : <SunDayTimeline daily={daily} timeZone={timeZone} now={now} label={label} />}
      </div>

      <ul className={compact ? "ss-venue-moment-list" : "grid grid-cols-2 gap-2"} aria-label="Sun moments">
        {summary.moments.map((m) => {
          const sky = m.available ? SKY[m.sky] : null;
          const when = m.available
            ? formatCompactGuestWindows(m.windows, timeZone)
            : m.available === null ? 'Not today' : 'In the shade';
          return (
            <li
              key={m.key}
              className={`flex flex-col gap-1.5 rounded-2xl border p-3 ${m.available
                ? 'border-amber-200/80 bg-white shadow-e2'
                : 'border-slate-200/80 bg-slate-50'}`}
            >
              <ClayIcon name={m.icon} size={compact ? 28 : 44} className={m.available ? '' : 'opacity-45 grayscale'} />
              <span className="text-body font-extrabold leading-tight text-slate-900">{m.title}</span>
              <span className={`text-caption font-semibold leading-snug ${m.available ? 'text-amber-900' : 'text-slate-500'}`}>
                {when}
              </span>
              {sky ? (
                <span className={`inline-flex items-center gap-1 self-start rounded-pill py-0.5 pl-0.5 pr-2 text-caption font-bold ${sky.className}`}>
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
