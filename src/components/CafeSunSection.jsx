import React, { useEffect, useMemo, useState } from 'react';
import ClayIcon from './common/ClayIcon';
import DataBadge from './DataBadge';
import SunWindowsGraph from './SunWindowsGraph.jsx';
import { cardSunWindows, forecastForSunWindows } from '../utils/sunWindowsCard.js';
import { layoutSunWindows } from '../utils/sunWindowsGraph.js';
import { sunSourceConfidence } from '../utils/sunSourceConfidence.js';
import { bestForMoment } from '../utils/bestForMoment.js';
import { cafeCardTiles } from '../utils/cafeCardTiles.js';
import { createMonthlySunAverageJob, monthShortName, sunniestMonthsInOrder } from '../utils/monthlySunAverage.js';
import { horizonToObstructions } from '../utils/sunMoments.js';
import { runWhenIdle } from '../utils/idleJob.js';

/**
 * Sunniest months for this spot, worked out after first paint in idle slices
 * (53 engine days). null while working, [] when no month gets direct sun.
 */
function useSunniestMonths({ lat, lng, horizon, year, timeZone }) {
  const [months, setMonths] = useState(null);
  useEffect(() => {
    setMonths(null);
    const obstructions = horizonToObstructions(horizon);
    if (!obstructions || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isInteger(year)) return undefined;
    let job;
    try {
      job = createMonthlySunAverageJob({ lat, lng, facing: null, obstructions, timeZone, year });
    } catch {
      return undefined;
    }
    // The engine validates per day, so a bad input surfaces mid-run: stop quietly.
    let failed = false;
    const guarded = {
      get result() { return failed ? null : job.result; },
      run(shouldYield) {
        try { return job.run(shouldYield); } catch { failed = true; return true; }
      },
    };
    return runWhenIdle(guarded, { onDone: (result) => setMonths(result?.sunniest ?? []) });
  }, [lat, lng, horizon, year, timeZone]);
  return months;
}

/**
 * The café sun card (docs/design/venue-sun-cards-brief.md §2–3): today's
 * direct sun at the venue's mapped point from the building horizon, as
 * minute-rounded windows. Every number comes from the same `daily`, and the
 * headline is the graph's own total.
 */
export default function CafeSunSection({
  venue, daily, horizon, geometryConfidence, microclimateEntry, forecast, weatherFetchedAt, now, timeZone,
}) {
  const sun = useMemo(() => cardSunWindows(daily), [daily]);
  const layout = useMemo(() => {
    if (!sun) return null;
    try { return layoutSunWindows(sun); } catch { return null; }
  }, [sun]);
  const bestFor = useMemo(() => bestForMoment(sun), [sun]);
  const sky = useMemo(() => forecastForSunWindows({ forecast, sun }), [forecast, sun]);
  const source = sunSourceConfidence({ horizon, geometryConfidence, dataSource: venue?.data_source });
  const tiles = cafeCardTiles(venue, { microclimate: microclimateEntry, now });
  const months = useSunniestMonths({
    lat: Number(venue?.lat), lng: Number(venue?.lng), horizon, year: Number(sun?.date?.slice(0, 4)), timeZone,
  });

  if (!sun || !layout) return null;
  const headline = layout.windowCount > 0 ? layout.totalLabel : 'No direct sun today';
  const monthNames = Array.isArray(months) ? sunniestMonthsInOrder(months).map(monthShortName) : [];

  return (
    <section aria-labelledby="cafe-sun-heading" data-cafe-sun className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h3 id="cafe-sun-heading" className="text-[22px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900">
          Outdoor Table Sun <span aria-hidden="true" className="text-slate-400">·</span>{' '}
          <span data-cafe-sun-total className="tabular-nums">{headline}</span>
        </h3>
        <p className="text-[13px] font-medium leading-snug text-slate-600">
          on a clear day · at the venue&apos;s mapped point, buildings within 150 m
        </p>
        {source ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <DataBadge kind={source.kind} source={source.basis} size="sm" />
            <p data-cafe-sun-source className="text-[12px] font-medium leading-snug text-slate-600">{source.line}</p>
          </div>
        ) : null}
      </div>

      <SunWindowsGraph
        {...sun}
        now={now}
        showSummary={false}
        footer={<p>Awnings, umbrellas and trees aren&apos;t included, so covered tables may get less sun.</p>}
      />

      {months === null ? (
        <p className="text-[12px] font-medium text-slate-500">Working out the sunniest months…</p>
      ) : monthNames.length > 0 ? (
        <div data-cafe-sunniest className="flex items-center gap-3">
          <ClayIcon name="sun-calendar" size={56} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-bold text-slate-900">Sunniest months</p>
              <DataBadge kind="calculated" source="Average direct sun per day, sampled weekly" size="sm" />
            </div>
            <ul aria-label="Sunniest months" className="flex flex-wrap gap-1.5">
              {monthNames.map((name) => (
                <li key={name} className="rounded-full bg-amber-50 px-3 py-1 text-[13px] font-bold text-amber-900">{name}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {bestFor ? (
        <p data-cafe-best-for className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-[14px] font-bold leading-snug text-amber-900">
          <ClayIcon name="sun" size={28} />
          {bestFor.text}
        </p>
      ) : null}

      {sky ? (
        <div data-cafe-forecast className="flex flex-wrap items-center gap-2">
          <DataBadge kind="forecast" updatedAt={weatherFetchedAt} source="Open-Meteo" size="sm" />
          <p className="text-[13px] font-semibold text-slate-700">{sky.text}</p>
        </div>
      ) : null}

      {tiles.length > 0 ? (
        <ul aria-label="At this café" className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <li key={tile.key} data-cafe-tile={tile.key}
              className="flex min-w-0 flex-col items-start gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <ClayIcon name={tile.icon} size={56} />
              <span className="text-[14px] font-bold leading-snug text-slate-900">{tile.label}</span>
              {tile.detail ? <span className="text-[12px] leading-snug text-slate-600">{tile.detail}</span> : null}
              {tile.kind ? <DataBadge kind={tile.kind} size="sm" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
