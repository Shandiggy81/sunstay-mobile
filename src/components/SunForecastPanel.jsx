import React, { useCallback, useEffect, useRef, useState } from 'react';
import HourlyForecastStrip from './HourlyForecastStrip';
import LiveSunTimeline from './LiveSunTimeline';
import ForecastErrorBoundary from './common/ForecastErrorBoundary';
import SunPathCard from './SunPathCard';
import { resolveForecastView } from '../utils/resolveForecastView';
import { noteSunForecast } from '../utils/sunForecastDiagnostics';
import { traceMapOperation } from '../utils/mapOperationTrace';
import { useDeferredForecastReady } from '../hooks/useDeferredForecastReady';

export default function SunForecastPanel({
  lat,
  lng,
  enabled = true,
  sunWindow,
  venue,
  contextIsRaining,
  contextCloudCover,
  sunData,
  hourlyData,
  cloudcover,
  displaySunrise,
  displaySunset,
  peakStart,
  peakEnd,
  children,
}) {
  const [stripState, setStripState] = useState({
    loading: true,
    error: false,
    view: 'loading',
    itemCount: 0,
    dataPresent: false,
  });

  const handleViewState = useCallback((next) => {
    setStripState(next);
    if (import.meta.env.DEV) {
      console.info('[sun-forecast]', {
        activeTab: 'Sun Forecast',
        forecastLoading: next.loading,
        forecastDataPresent: next.dataPresent,
        forecastItemCount: next.itemCount,
        renderedBranch: 'sun-forecast',
        view: next.view,
      });
    }
  }, []);

  const seenRef = useRef(new Set());
  const venueId = venue?.id ?? '';
  // Shimmer until the map camera is still. An active flyTo must not share
  // the frame with the hourly or auxiliary forecast requests.
  const isReadyToFetch = useDeferredForecastReady(enabled, venueId);
  const view = stripState.view || resolveForecastView({
    loading: stripState.loading,
    error: stripState.error,
    items: stripState.dataPresent ? [{}] : [],
  });
  const itemCount = Number.isFinite(stripState.itemCount) ? stripState.itemCount : 0;
  const dataPresent = Boolean(stripState.dataPresent);

  useEffect(() => {
    const seen = seenRef.current;
    traceMapOperation('sun-forecast-open', { venueId, at: Date.now() });
    noteSunForecast(seen, 'sun-forecast-tab-enter', { venueId, state: 'enter' });
    return () => {
      traceMapOperation('sun-forecast-close', { venueId, at: Date.now() });
      noteSunForecast(seen, 'sun-forecast-tab-exit', { venueId, state: 'exit' });
      noteSunForecast(seen, 'sun-forecast-cleanup', { venueId, state: 'cleanup' });
    };
  }, [venueId]);

  useEffect(() => {
    if (view === 'loading') return;
    noteSunForecast(seenRef.current, 'sun-forecast-rendered', {
      venueId,
      count: itemCount,
      state: view,
    });
  }, [venueId, view, itemCount]);

  return (
    <div
      data-render-branch="sun-forecast"
      data-active-tab="Sun Forecast"
      data-forecast-state={view}
      data-forecast-count={String(itemCount)}
      data-forecast-data={dataPresent ? 'yes' : 'no'}
      data-forecast-fetch={isReadyToFetch ? 'ready' : 'settling'}
      className="flex w-full min-h-0 flex-col gap-4"
    >
      {import.meta.env.DEV ? (
        <p
          data-venue-tab-debug="sun-forecast"
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-slate-600"
        >
          tab=Sun Forecast · branch=sun-forecast · state={view} · count={itemCount} · data={dataPresent ? 'yes' : 'no'}
        </p>
      ) : null}

      <ForecastErrorBoundary key={venueId || 'venue'}>
        <SunPathCard
          lat={lat}
          lng={lng}
          venue={venue}
          sunWindow={sunWindow}
          contextIsRaining={contextIsRaining}
          contextCloudCover={contextCloudCover}
        />

        <LiveSunTimeline
          sunData={sunData}
          hourlyData={hourlyData}
          cloudcover={cloudcover}
          displaySunrise={displaySunrise}
          displaySunset={displaySunset}
          peakStart={peakStart}
          peakEnd={peakEnd}
        />

        <HourlyForecastStrip
          lat={lat}
          lng={lng}
          enabled={enabled}
          fetchReady={isReadyToFetch}
          venueId={venueId}
          onViewState={handleViewState}
        />

        {children}
      </ForecastErrorBoundary>
    </div>
  );
}
