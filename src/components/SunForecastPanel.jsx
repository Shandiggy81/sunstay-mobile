import React, { useCallback, useEffect, useState } from 'react';
import HourlyForecastStrip from './HourlyForecastStrip';
import LiveSunTimeline from './LiveSunTimeline';
import ForecastErrorBoundary from './common/ForecastErrorBoundary';
import { checkIfShaded } from '../utils/solarMath.js';
import { resolveForecastView } from '../utils/resolveForecastView';

const CARD =
  'rounded-3xl border border-slate-900/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]';

function SolarPositionCard({ localSunData, sunWindow, venue, contextIsRaining, contextCloudCover }) {
  if (!localSunData) return null;

  const obstacleHeight = venue?.obstacle_height ?? 2;
  const obstacleDistance = venue?.obstacle_distance ?? 1;
  const isShaded = checkIfShaded(localSunData.altitude, obstacleHeight, obstacleDistance);
  let statusText = '☀️ Direct Sun';
  let statusClass = 'bg-amber-50 text-amber-800 border border-amber-500/20';

  if (!localSunData.isSunUp) {
    statusText = '🌙 Night (Sun is Down)';
    statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
  } else if (isShaded) {
    statusText = '🏢 Shaded by Surroundings';
    statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
  } else if (contextIsRaining) {
    statusText = '🌧️ Raining Currently';
    statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
  } else if (contextCloudCover > 75) {
    statusText = '☁️ Overcast (Geometrically clear)';
    statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
  } else if (sunWindow) {
    const timeStr = sunWindow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    statusText = `☀️ Direct Sun (Until ${timeStr})`;
  }

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Live 2D Solar Position</h3>
      <div className="flex items-center justify-between gap-3 text-[15px]">
        <span className="font-medium text-slate-600">Altitude (Elevation Angle)</span>
        <span className="font-semibold tabular-nums text-slate-900">{localSunData.altitude?.toFixed(1) ?? '–'}°</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-[15px]">
        <span className="font-medium text-slate-600">Azimuth (Compass Angle)</span>
        <span className="font-semibold tabular-nums text-slate-900">{localSunData.azimuth?.toFixed(1) ?? '–'}°</span>
      </div>
      <div className={`mt-1 flex min-h-11 items-center justify-center rounded-2xl px-3 text-center text-[15px] font-semibold ${statusClass}`}>
        {statusText}
      </div>
    </div>
  );
}

export default function SunForecastPanel({
  lat,
  lng,
  enabled = true,
  localSunData,
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

  const view = stripState.view || resolveForecastView({
    loading: stripState.loading,
    error: stripState.error,
    items: stripState.dataPresent ? [{}] : [],
  });
  const itemCount = Number.isFinite(stripState.itemCount) ? stripState.itemCount : 0;
  const dataPresent = Boolean(stripState.dataPresent);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    console.info('[sun-forecast] mount', { enabled, hasCoords: Number.isFinite(Number(lat)) });
    return () => console.info('[sun-forecast] unmount');
  }, [enabled, lat]);

  return (
    <div
      data-render-branch="sun-forecast"
      data-active-tab="Sun Forecast"
      data-forecast-state={view}
      data-forecast-count={String(itemCount)}
      data-forecast-data={dataPresent ? 'yes' : 'no'}
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

      <ForecastErrorBoundary>
        <SolarPositionCard
          localSunData={localSunData}
          sunWindow={sunWindow}
          venue={venue}
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
          onViewState={handleViewState}
        />

        {children}
      </ForecastErrorBoundary>
    </div>
  );
}
