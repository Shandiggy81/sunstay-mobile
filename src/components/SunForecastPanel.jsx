import React, { useCallback, useEffect, useMemo, useState } from 'react';
import HourlyForecastStrip from './HourlyForecastStrip';
import LiveSunTimeline from './LiveSunTimeline';
import ForecastErrorBoundary from './common/ForecastErrorBoundary';
import { checkIfShaded } from '../utils/solarMath.js';
import { describeSunHeight } from '../utils/sunWords.js';
import { resolveForecastView } from '../utils/resolveForecastView';
import { deriveSunForecast, formatHour, toWallHour } from '../utils/sunForecastState.js';
import { useDeferredForecastReady } from '../hooks/useDeferredForecastReady';
import { useWeather } from '../hooks/useWeather';

const CARD =
  'rounded-3xl border border-slate-900/[0.06] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_28px_-16px_rgba(15,23,42,0.18)]';

function SolarPositionCard({ localSunData, sunWindow, forecast }) {
  if (!localSunData) return null;

  let statusText = '☀️ Direct Sun';
  let statusClass = 'bg-amber-50 text-amber-800 border border-amber-500/20';
  const kind = forecast?.now.kind;

  if (!localSunData.isSunUp || kind === 'night') {
    statusText = '🌙 Night';
    statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
  } else if (kind === 'shaded') {
    statusText = '🏢 Shaded by Surroundings';
    statusClass = 'bg-slate-50 text-slate-700 border border-slate-900/[0.08]';
  } else if (kind === 'rain') {
    statusText = '🌧️ Rain this hour';
    statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
  } else if (kind === 'cloud') {
    statusText = '☁️ Overcast — the sun is behind cloud';
    statusClass = 'bg-slate-100 text-slate-700 border border-slate-900/[0.08]';
  } else {
    // Direct sun ends at whichever comes first: the sun dropping behind the
    // surroundings (sunWindow) or the forecast turning cloudy or wet.
    const shadeHour = toWallHour(sunWindow, forecast?.utcOffsetSeconds);
    const ends = [shadeHour, forecast?.sunUntil].filter(Number.isFinite);
    if (ends.length) statusText = `☀️ Direct Sun (Until ${formatHour(Math.min(...ends))})`;
  }

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <h3 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">Sun right now</h3>
      <p className="text-[15px] font-medium text-slate-700">
        {describeSunHeight(localSunData)}
        {Number.isFinite(localSunData.altitude) && localSunData.isSunUp ? (
          <span className="ml-1 text-[13px] text-slate-500">({Math.round(localSunData.altitude)}° up)</span>
        ) : null}
      </p>
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

  // One forecast read for the card, the timeline and the strip's badge. The
  // Melbourne hourly forecast from WeatherContext is the source; the hourly
  // props VenueCard passes are usually empty.
  const { weather } = useWeather();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const shaded = localSunData?.isSunUp
    ? checkIfShaded(localSunData.altitude, venue?.obstacle_height ?? 2, venue?.obstacle_distance ?? 1)
    : false;
  const forecast = useMemo(() => deriveSunForecast({
    hourly: weather?.hourly ?? hourlyData,
    utcOffsetSeconds: weather?.utcOffsetSeconds,
    now,
    sunrise: sunData?.sunriseDate,
    sunset: sunData?.sunsetDate,
    shaded,
    current: { cloudCover: contextCloudCover, isRaining: contextIsRaining },
  }), [weather?.hourly, weather?.utcOffsetSeconds, hourlyData, now, sunData, shaded, contextCloudCover, contextIsRaining]);

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
        <SolarPositionCard
          localSunData={localSunData}
          sunWindow={sunWindow}
          forecast={forecast}
        />

        <LiveSunTimeline
          forecast={forecast}
          displaySunrise={displaySunrise}
          displaySunset={displaySunset}
        />

        <HourlyForecastStrip
          lat={lat}
          lng={lng}
          enabled={enabled}
          fetchReady={isReadyToFetch}
          venueId={venueId}
          onViewState={handleViewState}
          sunMinutesToday={forecast.sunMinutesToday}
        />

        {children}
      </ForecastErrorBoundary>
    </div>
  );
}
