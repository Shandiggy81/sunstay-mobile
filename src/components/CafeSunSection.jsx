import React, { useEffect, useMemo, useState } from 'react';
import ClayIcon from './common/ClayIcon';
import { Armchair, Check, Wind } from 'lucide-react';
import { VenueSunCaption } from './VenueCardSections.jsx';
import { formatHour } from '../utils/sunForecastState.js';
import { venueHour } from '../utils/venueTime.js';
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
export function CafeSunMonths({ venue, daily, horizon, timeZone }) {
  const sun = useMemo(() => cardSunWindows(daily), [daily]);
  const bestFor = useMemo(() => bestForMoment(sun), [sun]);
  const months = useSunniestMonths({ lat: Number(venue?.lat), lng: Number(venue?.lng), horizon, year: Number(sun?.date?.slice(0, 4)), timeZone });
  const monthNames = Array.isArray(months) ? sunniestMonthsInOrder(months).map(monthShortName) : [];
  if (!sun || (months !== null && !monthNames.length && !bestFor)) return null;
  return <div className="ss-venue-summary-row" data-cafe-sunniest>
    <ClayIcon name="sun-calendar" size={32} /><div className="min-w-0">
      {months === null ? <p>Working out the sunniest months…</p> : monthNames.length ? <h3>Sunniest months: <span aria-label="Sunniest months">{monthNames.join(', ')}</span></h3> : null}
      {bestFor ? <p data-cafe-best-for>{bestFor.text}</p> : null}
      {monthNames.length ? <span className="sr-only">Calculated · average direct sun per day, sampled weekly</span> : null}
    </div>
  </div>;
}

export function CafeSunFacts({ venue, microclimateEntry, now }) {
  const tiles = cafeCardTiles(venue, { microclimate: microclimateEntry, now });
  if (!tiles.length) return null;
  return <ul aria-label="At this café">{tiles.map(tile => {
    const Icon = tile.key === 'outdoor-tables' ? Armchair : tile.key === 'wind-sheltered' ? Wind : Check;
    return <li key={tile.key} data-cafe-tile={tile.key} className="ss-venue-fact">
      <Icon size={22} aria-hidden="true" /><div><span>{tile.label}</span>
        {tile.detail ? <p className="ss-venue-fact-detail">{tile.detail}</p> : null}
        {tile.kind ? <span className="ss-venue-fact-source">Estimated</span> : null}
      </div>
    </li>;
  })}</ul>;
}

export default function CafeSunSection({
  venue, daily, horizon, geometryConfidence, microclimateEntry, forecast, now, timeZone, showDetails = true,
}) {
  const sun = useMemo(() => cardSunWindows(daily), [daily]);
  const layout = useMemo(() => {
    if (!sun) return null;
    try { return layoutSunWindows(sun); } catch { return null; }
  }, [sun]);
  const sky = useMemo(() => forecastForSunWindows({ forecast, sun }), [forecast, sun]);
  const source = sunSourceConfidence({ horizon, geometryConfidence, dataSource: venue?.data_source });
  if (!sun || !layout) return null;

  return <section aria-label="Outdoor Table Sun" data-cafe-sun className="ss-cafe-sun">
    <SunWindowsGraph {...sun} now={now} showSummary={false} className="ss-card-sun-graph" />
    <div className="ss-venue-sun-window">
      <ClayIcon name="sun" size={22} />
      <span>{layout.windowCount ? layout.windows.map(w => w.rangeLabel).join(' · ') : 'No direct sun today'}</span>
      <strong data-cafe-sun-total>{layout.windowCount ? layout.totalLabel : '0m'}</strong>
    </div>
    <VenueSunCaption source={source} buildingData sunrise={sun.sunrise != null ? formatHour(venueHour(sun.sunrise, timeZone)) : null}
      sunset={sun.sunset != null ? formatHour(venueHour(sun.sunset, timeZone)) : null}
      timeZoneLabel={timeZone === 'Australia/Melbourne' ? 'Melbourne time' : 'Venue local time'} />
    {sky && (sky.kind === 'cloud' || sky.kind === 'mixed') ? <p data-cafe-forecast className="ss-venue-sun-caption">{sky.text}</p> : null}
    {showDetails ? <>
      <CafeSunMonths venue={venue} daily={daily} horizon={horizon} timeZone={timeZone} />
      <CafeSunFacts venue={venue} microclimateEntry={microclimateEntry} now={now} />
    </> : null}
  </section>;
}
