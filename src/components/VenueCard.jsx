import { venueSourceNote } from '../utils/venueSource';
import React, { memo, useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { X, Wind, ExternalLink, Navigation, Share2, ChevronDown, Crosshair } from 'lucide-react';
import VenueDetailErrorBoundary from './VenueDetailErrorBoundary';
import ForecastErrorBoundary from './common/ForecastErrorBoundary';
import WindComfortPanel from './WindComfortPanel';
import RoomSunCard from './RoomSunCard';
import SunMomentsPanel from './SunMomentsPanel.jsx';
import { useVenueSunHorizon } from '../hooks/useVenueSunHorizon';
import { outdoorSunDay, roomsBySunToday, sunMomentsFromDay } from '../utils/sunMoments.js';
import { outdoorSunSummary } from '../utils/outdoorSunSummary.js';
import { DEFAULT_TIME_ZONE, venueLocalDate } from '../utils/balconySunEngine.js';
import ClayIcon from './common/ClayIcon';
import {
  AboutAndHours,
  VenueSourceNote,
  ConditionsGrid,
  HappyHourSection,
  HourByHour,
  TodaysSun,
  VenueHero,
  VenueInfoHeader,
  VenueOfferingsList,
  VenueStatRow,
  VibeSection,
  formatScore,
  scoreTone,
  SECTION_TITLE,
} from './VenueCardSections';
import { useOpenAQ } from '../hooks/useOpenAQ';
import { useTomorrowRain } from '../hooks/useTomorrowRain';
import { useOpenUV } from '../hooks/useOpenUV';
import { useDeferredForecastReady } from '../hooks/useDeferredForecastReady';
import { checkIsAccommodation } from '../utils/accommodation';
import { useWeather } from '../context/WeatherContext';
import { useMicroclimateState } from '../context/MicroclimateContext';
import { formatReadingTime, lookupMicroclimateEntry, readMicroclimate } from '../utils/microclimate';
import { formatHour } from '../utils/sunForecastState';
import { canUsePointerTilt } from '../utils/canUsePointerTilt';
import { resolveOverviewScore } from '../utils/resolveOverviewScore';
import { errorBoundaryRemountKey, resetVenueDetailScroller, venueOverlayPresenceKey } from '../utils/venueDetailTabs';
import { feelsLikeIconName, venueIcon, weatherIconName } from '../utils/clayIcons';
import { venueStatTiles } from '../utils/venueStatTiles.js';
import { venueCardSunSection } from '../utils/venueCardSunFlow.js';
import { canShowHotelSunReport } from '../utils/hotelSunReportRoute.js';
import { hourlyStrip, sunSentence, venueFeelsLike, venueSunForecast } from '../utils/venueSun';
import { venueOfferings } from '../utils/venueOfferings';
import { keyAmenities } from '../utils/venueAmenities';
import { venuePerfectFor } from '../utils/venuePerfectFor.js';
import { venueHoursView, verifiedHappyHour } from '../utils/venueHours';
import { venueTypeLabel } from '../utils/venueTypeLabel';

const MICRO_LABEL = 'text-[12px] font-semibold text-slate-600';

// Past this scroll offset the hero is mostly gone, so the compact header
// takes over with the name and score.
const COMPACT_HEADER_AT = 210;

const finite = (value) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

// ── Live microclimate panel ────────────────────────────────
// Surfaces the cached venues_in_bbox readings: sun_now / sun_hour_fraction
// (Melbourne-local hour), effective_sun, wind_shelter_score (exposure),
// effective_wind (m/s at the venue) and comfort_hint.
// Rendered only when the venue actually has a profile row.
const MicroclimatePanel = memo(function MicroclimatePanel({ reading, atLabel }) {
  if (!reading?.available) return null;

  const pct = reading.sunFraction == null ? 0 : Math.round(reading.sunFraction * 100);
  const isEstimate = reading.confidence != null && reading.confidence < 0.5;

  return (
    <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-50 to-white p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={MICRO_LABEL}>Microclimate at {atLabel}</span>
        {reading.isLiveSun ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
            Live
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[26px] font-bold leading-none tabular-nums tracking-[-0.02em] text-slate-900">
          {reading.sunPercent}
        </span>
        {reading.sunLabel ? (
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-700">
            {reading.sunLabel}
          </span>
        ) : null}
      </div>

      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/[0.08]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Sun availability at ${atLabel}`}
      >
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
      </div>

      {(reading.windLabel || reading.comfortHint) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {reading.windLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[12px] font-semibold text-sky-800">
              <Wind size={12} aria-hidden="true" />
              {reading.windLabel}
            </span>
          ) : null}
          {reading.comfortHint ? (
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-600">
              {reading.comfortHint}
            </span>
          ) : null}
        </div>
      )}

      {isEstimate ? (
        <p className="mt-2.5 text-[12px] font-medium leading-snug text-slate-600">
          Modelled from street geometry, not measured on site.
        </p>
      ) : null}
    </div>
  );
});

const ShieldBar = ({ label, value, color }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between">
      <span className={MICRO_LABEL}>{label}</span>
      <span className="text-[12px] font-bold tabular-nums text-slate-700">{Math.round(value * 100)}%</span>
    </div>
    <div className="h-1.5 rounded-full bg-slate-900/[0.07]">
      <div className="h-full rounded-full" style={{ width: `${value * 100}%`, background: color }} />
    </div>
  </div>
);

const RoomIntelligencePanel = ({ roomIntelligence }) => {
  if (!roomIntelligence) return null;
  const items = [
    roomIntelligence.sunriseView && { icon: 'morning-sun', label: 'Sunrise view' },
    roomIntelligence.floorLevel && { icon: 'hotel-views', label: `Floor ${roomIntelligence.floorLevel}` },
    roomIntelligence.poolAccess && { icon: 'beach', label: 'Pool access' },
    roomIntelligence.balcony && { icon: 'rooftop-terrace', label: 'Private balcony' },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex min-w-0 items-center gap-2.5">
          <ClayIcon name={item.icon} size={32} />
          <span className="truncate text-[14px] font-semibold text-slate-700">{item.label}</span>
        </li>
      ))}
    </ul>
  );
};

// ── More weather detail ─────────────────────────────────────
// UV, air quality, rain radar and wind comfort come from rate-limited
// third-party APIs, so they load only when someone opens this section.
const MoreWeatherDetail = ({ open, onToggle, venueId, uvIndex, aqLabel, rainArrivalMins, rainArrivalLabel, venue, microclimate, microclimateAtLabel, shielding }) => {
  const panelId = `venue-more-weather-${venueId ?? 'panel'}`;
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-900/[0.08] bg-slate-50 px-4 py-2.5 text-left text-[15px] font-semibold text-slate-800 transition-colors active:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        UV, air quality and wind comfort
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div id={panelId} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-slate-900/[0.08] bg-white p-3.5">
              <span className={MICRO_LABEL}>UV index</span>
              <span className="mt-0.5 block text-[18px] font-bold tabular-nums text-slate-900">
                {uvIndex == null ? '–' : `${Math.round(uvIndex)} · ${uvIndex >= 8 ? 'Very high' : uvIndex >= 6 ? 'High' : uvIndex >= 3 ? 'Moderate' : 'Low'}`}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-900/[0.08] bg-white p-3.5">
              <span className={MICRO_LABEL}>Air quality</span>
              <span className="mt-0.5 block truncate text-[18px] font-bold text-slate-900">{aqLabel ?? '–'}</span>
            </div>
          </div>
          {rainArrivalMins !== null && rainArrivalMins <= 45 && rainArrivalLabel ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-50 p-3.5" role="status">
              <ClayIcon name="rain" size={36} />
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-snug text-slate-900">{rainArrivalLabel}</p>
                <p className="text-[13px] font-medium text-slate-700">Rain nearby on radar. Covered seating is the safer bet.</p>
              </div>
            </div>
          ) : null}
          <MicroclimatePanel reading={microclimate} atLabel={microclimateAtLabel} />
          {shielding ? (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-900/[0.08] bg-white p-3.5">
              <span className={MICRO_LABEL}>Shelter</span>
              {shielding.windbreak != null && <ShieldBar label="Windbreak" value={Math.min(1, Math.max(0, Number(shielding.windbreak)))} color="#64748B" />}
              {shielding.rainCover != null && <ShieldBar label="Rain cover" value={Math.min(1, Math.max(0, Number(shielding.rainCover)))} color="#94A3B8" />}
              {shielding.shade != null && <ShieldBar label="Shade" value={Math.min(1, Math.max(0, Number(shielding.shade)))} color="#F59E0B" />}
            </div>
          ) : null}
          <ForecastErrorBoundary>
            <WindComfortPanel venue={venue} />
          </ForecastErrorBoundary>
        </div>
      ) : null}
    </div>
  );
};

function resolveVenueWebsiteUrl(venue) {
  const raw = venue?.official_website_url || venue?.website_url || venue?.website || venue?.url;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return url || null;
}

// Share sheet when the browser has one, else copy the website link.
function useVenueShare(venue) {
  const [shareLabel, setShareLabel] = useState('Share');
  const copiedTimerRef = useRef(null);
  const websiteUrl = resolveVenueWebsiteUrl(venue);

  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  const share = useCallback(async () => {
    if (!websiteUrl) return;
    const title = venue?.name || venue?.venueName || '';
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title, text: 'Check out this spot on Sunstay!', url: websiteUrl });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(websiteUrl);
        setShareLabel('Copied!');
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setShareLabel('Share'), 2000);
      }
    } catch {
      // Soft fail when clipboard is unavailable.
    }
  }, [websiteUrl, venue?.name, venue?.venueName]);

  return { share, shareLabel, canShare: Boolean(websiteUrl), websiteUrl };
}

// Saved venues live on this device only; there is no account to sync them to.
const SAVED_KEY = 'ss-saved-venues';
function readSaved() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
function useSavedVenue(venueId) {
  const id = venueId == null ? null : String(venueId);
  const [saved, setSaved] = useState(() => (id ? readSaved().includes(id) : false));
  useEffect(() => { setSaved(id ? readSaved().includes(id) : false); }, [id]);
  const toggle = useCallback(() => {
    if (!id) return;
    const list = readSaved().filter((v) => v !== id);
    const next = !saved;
    if (next) list.push(id);
    try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
    setSaved(next);
  }, [id, saved]);
  return [saved, toggle];
}

// Re-read the forecast each minute so "now" moves along the bar.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// iOS toolbar buttons: 50px tall capsules, primary action given more width than
// the two secondary actions so the hierarchy reads at a glance.
const footerActionClass =
  'flex items-center justify-center gap-1.5 min-h-[50px] px-2.5 rounded-2xl text-[13px] font-semibold leading-tight tracking-[-0.01em] text-center transition-transform duration-150 active:scale-[0.97]';
const footerSecondaryClass =
  `${footerActionClass} flex-1 bg-white text-slate-800 border border-slate-900/[0.08] shadow-[0_1px_2px_rgba(15,23,42,0.05)]`;
const footerPrimaryClass =
  `${footerActionClass} flex-[1.5] bg-amber-500 text-slate-950 shadow-[0_2px_10px_rgba(245,158,11,0.35)]`;

function VenueCardFooterActions({ venue, canNavigate, share }) {
  const { share: handleShare, shareLabel, websiteUrl } = share;
  const destLat = Number(venue?.lat);
  const destLng = Number(venue?.lng);
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`
    : null;

  return (
    <div className="flex flex-row gap-2.5">
      {websiteUrl ? (
        <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className={footerSecondaryClass}>
          <ExternalLink size={15} aria-hidden="true" />
          Website
        </a>
      ) : (
        <span className={`${footerSecondaryClass} pointer-events-none opacity-40`} aria-disabled="true">
          <ExternalLink size={15} aria-hidden="true" />
          Website
        </span>
      )}

      {directionsUrl ? (
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={footerPrimaryClass} aria-label="Get Directions">
          <Navigation size={15} aria-hidden="true" />
          Get Directions
        </a>
      ) : (
        <button type="button" disabled className={`${footerPrimaryClass} cursor-not-allowed opacity-40`} aria-label="Get Directions unavailable">
          <Navigation size={15} aria-hidden="true" />
          Get Directions
        </button>
      )}

      <button
        type="button"
        onClick={handleShare}
        disabled={!websiteUrl}
        className={`${footerSecondaryClass} disabled:pointer-events-none disabled:opacity-40`}
        aria-label={shareLabel === 'Copied!' ? 'Copied!' : 'Share venue'}
      >
        <Share2 size={15} aria-hidden="true" />
        {shareLabel}
      </button>
    </div>
  );
}

// ── Main VenueCard ────────────────────────────────────────────
function VenueCard({ venue, weather, onClose, onCenter, onOpenSunReport, setShowOwnerDashboard, setSelectedVenue, liveVenueFeatures, onSheetGesture, stayMatch }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const scrollerRef = useRef(null);
  const now = useMinuteClock();
  const isReadyToFetch = useDeferredForecastReady(moreOpen, venue?.id ?? '');
  const auxEnabled = moreOpen && isReadyToFetch;

  useLayoutEffect(() => {
    setMoreOpen(false);
    compactRef.current = false;
    setCompact(false);
    resetVenueDetailScroller(scrollerRef.current);
  }, [venue?.id]);

  useEffect(() => {
    if (!stayMatch?.bestRoom) return;
    const frame = requestAnimationFrame(() => {
      const target = scrollerRef.current?.querySelector('[data-matching-room="true"]');
      if (target && scrollerRef.current) scrollerRef.current.scrollTo({ top: target.offsetTop - scrollerRef.current.offsetTop - 80, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [venue?.id, stayMatch?.bestRoom]);

  const handleScroll = useCallback((event) => {
    const show = event.currentTarget.scrollTop > COMPACT_HEADER_AT;
    if (show !== compactRef.current) {
      compactRef.current = show;
      setCompact(show);
    }
  }, []);

  // Server-side microclimate for this venue, read at the time-of-day slider's
  // position. Same `venues_in_bbox` row + `todMinutes` the map markers and
  // the list use, so the card score cannot drift from the pin or the list.
  const { todMinutes, byId: microById } = useMicroclimateState();
  const microclimateEntry = useMemo(() => lookupMicroclimateEntry(microById, venue?.id), [microById, venue?.id]);
  const microclimate = useMemo(() => readMicroclimate(microclimateEntry, todMinutes), [microclimateEntry, todMinutes]);
  const microclimateAtLabel = useMemo(() => formatReadingTime(todMinutes), [todMinutes]);

  const dragControls = useDragControls();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), { stiffness: 200, damping: 25 });
  const cardRectRef = useRef(null);
  const enableTilt = useMemo(() => canUsePointerTilt(), []);
  function handlePointerEnter(e) {
    if (!enableTilt) return;
    cardRectRef.current = e.currentTarget.getBoundingClientRect();
  }
  function handlePointerMove(e) {
    const rect = cardRectRef.current;
    if (!enableTilt || !rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }
  function handlePointerLeave() {
    if (!enableTilt) return;
    cardRectRef.current = null;
    mouseX.set(0);
    mouseY.set(0);
  }

  const {
    weather: contextWeather,
    loading: weatherLoading,
    error: weatherError,
    unavailable: weatherUnavailableFlag,
    getSunScoreResult,
  } = useWeather();
  const weatherData = contextWeather ?? weather ?? null;
  const weatherUnavailable = Boolean(
    weatherUnavailableFlag || weatherError || weatherData?.unavailable || weatherData?.source === 'demo',
  );
  // Demo or failed weather must not be drawn as a real forecast.
  const liveWeather = weatherUnavailable ? null : weatherData;

  const safeVenue = venue || {};
  const { lat, lng, vibe, suburb } = safeVenue;
  const shielding = safeVenue.shielding && typeof safeVenue.shielding === 'object' ? safeVenue.shielding : null;
  const displayName = venue?.venueName ?? venue?.name ?? venue?.title ?? 'Unnamed venue';
  const subtitle = useMemo(() => {
    const vibeText = Array.isArray(vibe) ? vibe.filter(Boolean).join(', ') : vibe;
    const type = venueTypeLabel(safeVenue.typeLabel || vibeText);
    return [type, String(suburb ?? '').trim()].filter(Boolean).join(' · ');
  }, [safeVenue.typeLabel, vibe, suburb]);
  const icon = venueIcon(venue);
  const venueImage = venue?.image_url ?? venue?.imageUrl ?? venue?.image ?? venue?.hero_image ?? venue?.photoUrl ?? venue?.photo ?? null;
  const address = String(venue?.address ?? venue?.full_street_address ?? '').trim() || null;
  const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  const hasValidCoordinates = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180;
  const isHotelOrStay = checkIsAccommodation(venue);

  const share = useVenueShare(safeVenue);
  const [saved, toggleSaved] = useSavedVenue(venue?.id);

  const overviewScore = resolveOverviewScore({
    loading: weatherLoading,
    getSunScoreResult,
    venue,
    microclimateEntry,
    todMinutes,
  });
  const score = overviewScore.score;

  // One sun forecast for the stat row, "Today's sun", its bar, the hourly
  // strip and the sunset tile.
  const forecast = useMemo(
    () => venueSunForecast({
      venue: { lat: finite(lat), lng: finite(lng), obstacle_height: venue?.obstacle_height, obstacle_distance: venue?.obstacle_distance },
      weather: liveWeather,
      now,
    }),
    [lat, lng, venue?.obstacle_height, venue?.obstacle_distance, liveWeather, now],
  );
  const hours = useMemo(() => hourlyStrip(liveWeather, { now, forecast }), [liveWeather, now, forecast]);
  const sentence = sunSentence(forecast);
  const nowIcon = hours[0]?.icon ?? weatherIconName(null, { isNight: !forecast.isSunUp });

  const temp = finite(liveWeather?.main?.temp);
  // Sheltered feels-like at this venue: the same number as its list row.
  const feelsLike = venueFeelsLike(venue, liveWeather);
  const rainChance = finite(liveWeather?.precipProbability);
  const uvIndex = finite(liveWeather?.uvi ?? liveWeather?.uvIndex);
  const tiles = [
    {
      label: 'Rain chance',
      value: rainChance != null ? `${Math.round(rainChance)}%` : '–',
      note: rainChance != null ? 'This hour' : null,
      icon: 'umbrella',
    },
    {
      label: 'Feels like',
      value: feelsLike != null ? `${Math.round(feelsLike)}°` : '–',
      note: temp != null ? `Actual ${Math.round(temp)}°` : null,
      icon: feelsLikeIconName(feelsLike),
    },
    {
      label: 'Sunset',
      value: forecast.sunsetHour != null ? formatHour(forecast.sunsetHour) : '–',
      note: forecast.sunriseHour != null ? `Sunrise ${formatHour(forecast.sunriseHour)}` : null,
      icon: 'sunset',
    },
  ];

  const { aqLabel } = useOpenAQ(lat, lng, { enabled: auxEnabled });
  useOpenUV(lat, lng, { enabled: auxEnabled });
  const { rainArrivalMins, rainArrivalLabel } = useTomorrowRain(lat, lng, { enabled: auxEnabled });

  const offerings = useMemo(() => venueOfferings(venue), [venue]);
  const amenities = useMemo(() => keyAmenities(venue), [venue]);
  const liveFeaturesForVenue = venue?.id ? liveVenueFeatures?.[venue.id] : null;
  const liveNotes = [
    liveFeaturesForVenue?.fireplaceOn ? 'Fireplace on now' : null,
    !liveFeaturesForVenue?.fireplaceOn && liveFeaturesForVenue?.heatersOn ? 'Outdoor heaters on now' : null,
  ].filter(Boolean);

  // Room details come from the venue itself. The old catalogue
  // (src/data/venues.js) is not looked up by name: its ids never match ours,
  // and a name match can attach another venue's rooms.
  const roomIntelligence = venue?.roomIntelligence;
  const roomTypes = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  const showStay = isHotelOrStay && (roomIntelligence || roomTypes.length > 0);
  // Bars, cafes and other outdoor venues: today's sun from the buildings
  // around them (stored horizon) plus today's forecast sky.
  const sunHorizon = useVenueSunHorizon(showStay ? null : venue?.id);
  const venueTimeZone = venue?.timeZone ?? DEFAULT_TIME_ZONE;
  let todayKey = null;
  try { todayKey = venueLocalDate(now, venueTimeZone); } catch { /* bad time zone: no section */ }
  // Recomputed when the venue's day changes, not every minute.
  const outdoorDay = useMemo(
    () => (sunHorizon && todayKey ? outdoorSunDay({ lat, lng, horizon: sunHorizon, date: todayKey, timeZone: venueTimeZone }) : null),
    [sunHorizon, lat, lng, todayKey, venueTimeZone],
  );
  const outdoorMoments = useMemo(
    () => (outdoorDay ? sunMomentsFromDay({ daily: outdoorDay, forecast, timeZone: venueTimeZone }) : null),
    [outdoorDay, forecast, venueTimeZone],
  );
  const sunSection = venueCardSunSection({ showStay, outdoorDay, outdoorMoments });
  // With sun moments on screen, the stat row and sentence read the same
  // building-shaded windows as the moments' total, not the open-sky forecast.
  const outdoorSummary = sunSection === 'moments'
    ? outdoorSunSummary({ daily: outdoorDay, forecast, now, timeZone: venueTimeZone })
    : null;
  const happyHour = verifiedHappyHour(venue);
  const hoursView = venueHoursView(venue);
  const description = [venue?.venue_description, venue?.description, venue?.about]
    .find((d) => typeof d === 'string' && d.trim())?.trim() ?? null;

  const handleManage = setShowOwnerDashboard
    ? () => { setShowOwnerDashboard(true); setSelectedVenue?.(venue); }
    : null;

  const overlayMotionProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.25 } };
  const articleMotionProps = {
    drag: 'y',
    dragControls,
    dragListener: false,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: 0.15,
    onDragStart: () => onSheetGesture?.(true),
    onDragEnd: (_, i) => {
      onSheetGesture?.(false);
      if (i.offset.y > 100 || i.velocity.y > 400) onClose();
    },
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: { type: 'spring', damping: 30, stiffness: 280 },
  };

  return (
    <AnimatePresence>
      <motion.div
        key={venueOverlayPresenceKey(venue?.id)}
        {...overlayMotionProps}
        className="absolute inset-0 z-[110] flex flex-col overflow-hidden bg-slate-950/55"
        onClick={onClose}
      >
        <motion.article
          {...articleMotionProps}
          aria-label={displayName}
          onClick={e => e.stopPropagation()}
          style={{
            ...(enableTilt ? { rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1200 } : null),
            boxShadow: '0 -8px 60px rgba(15,23,42,0.14)',
          }}
          className="pointer-events-auto relative z-50 flex h-full min-h-0 w-full select-none flex-col overflow-hidden rounded-t-[28px] bg-white font-sans"
          onPointerEnter={enableTilt ? handlePointerEnter : undefined}
          onPointerMove={enableTilt ? handlePointerMove : undefined}
          onPointerLeave={enableTilt ? handlePointerLeave : undefined}
        >
          {/* Compact header: name + score stay visible once the hero scrolls away. */}
          <div
            className={`absolute inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-slate-900/[0.06] bg-white px-4 py-1.5 shadow-[0_1px_8px_rgba(15,23,42,0.06)] transition-[opacity,transform] duration-200 ${compact ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}
            aria-hidden={!compact}
          >
            <button
              type="button"
              onClick={onClose}
              tabIndex={compact ? 0 : -1}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.06] text-slate-800 active:bg-slate-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Close venue details"
            >
              <X size={19} strokeWidth={2.5} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-[-0.01em] text-slate-900">{displayName}</span>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 py-1 pl-1.5 pr-3">
              <ClayIcon name={nowIcon} size={24} />
              <span className={`text-[16px] font-extrabold tabular-nums ${scoreTone(score)}`}>
                {overviewScore.loading ? '…' : formatScore(score)}
              </span>
              <span className="sr-only">Sun score</span>
            </span>
          </div>

          <div
            ref={scrollerRef}
            data-venue-card-scroller
            onScroll={handleScroll}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white"
          >
            <VenueHero
              name={displayName}
              imageUrl={venueImage}
              icon={icon}
              onClose={onClose}
              onShare={share.share}
              shareLabel={share.shareLabel}
              canShare={share.canShare}
              saved={saved}
              onToggleSave={toggleSaved}
              onDragStart={(e) => dragControls.start(e)}
            />

            <div className="relative z-[1] -mt-10 rounded-t-[28px] bg-white px-5 pb-6 pt-6">
              <VenueDetailErrorBoundary
                key={errorBoundaryRemountKey(venue?.id)}
                venueId={venue?.id}
                onClose={onClose}
              >
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col gap-5">
                    <VenueInfoHeader
                      icon={icon}
                      name={displayName}
                      subtitle={subtitle}
                      websiteUrl={share.websiteUrl}
                      address={address}
                      mapsUrl={mapsUrl}
                      amenities={amenities}
                      perfectFor={venuePerfectFor(outdoorMoments)}
                    />
                    {onCenter && hasValidCoordinates ? (
                      <button
                        type="button"
                        onClick={() => onCenter(venue)}
                        className="-mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full px-1 text-[14px] font-semibold text-slate-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <Crosshair size={16} aria-hidden="true" />
                        Show on map
                      </button>
                    ) : null}
                    <div className="flex flex-col gap-2.5">
                      <p className="text-[12px] font-semibold text-slate-600">Today · sun &amp; weather estimates · {venueTimeZone === DEFAULT_TIME_ZONE ? 'Melbourne time' : 'Venue local time'}</p>
                      <VenueStatRow
                        tiles={venueStatTiles({ venue, weather: liveWeather, forecast, score, scoreLoading: overviewScore.loading, feelsLike, sunNow: outdoorSummary })}
                        sunny={(outdoorSummary?.kind ?? forecast.now?.kind) === 'sun'}
                      />
                      {sunSection !== 'today' ? (
                        <p className="text-[13px] font-medium leading-relaxed text-slate-600">{outdoorSummary?.sentence ?? sentence}</p>
                      ) : null}
                    </div>
                    {weatherUnavailable && !weatherLoading ? (
                      <p className="-mt-2 text-[13px] font-medium text-slate-600" role="status">
                        Live weather is unavailable right now, so the forecast below is limited.
                      </p>
                    ) : null}
                  </div>

                  {sunSection === 'stay' ? (
                    <section aria-labelledby="stay-heading" className="flex flex-col gap-3">
                      <h3 id="stay-heading" className={SECTION_TITLE}>{venue.typeCategory === 'Residential' ? 'Your property' : 'Your stay'}</h3>
                      {onOpenSunReport && canShowHotelSunReport(venue) ? (
                        <button
                          type="button"
                          onClick={() => onOpenSunReport(venue)}
                          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-[14px] font-bold text-amber-900 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:bg-amber-100"
                        >
                          <ClayIcon name="hotel-views" size={32} />
                          See the sun report
                        </button>
                      ) : null}
                      <RoomIntelligencePanel roomIntelligence={roomIntelligence} />
                      {roomsBySunToday(roomTypes, venue, stayMatch?.daily?.date ?? todayKey, stayMatch?.bestRoom).map((room, i) => <RoomSunCard key={room?.id ?? i} room={room} venue={venue} date={stayMatch?.daily?.date} highlighted={stayMatch?.bestRoom === room} forecast={stayMatch?.daily?.date ? null : forecast} />)}
                    </section>
                  ) : null}

                  {sunSection === 'today' ? (
                    <ForecastErrorBoundary>
                      <TodaysSun forecast={forecast} sentence={sentence} />
                    </ForecastErrorBoundary>
                  ) : null}

                  {sunSection === 'moments' ? (
                    <ForecastErrorBoundary>
                      <section aria-labelledby="sun-moments-heading" className="flex flex-col gap-3">
                        <h3 id="sun-moments-heading" className={SECTION_TITLE}>Sun moments today</h3>
                        <SunMomentsPanel daily={outdoorDay} summary={outdoorMoments} timeZone={venueTimeZone} now={now} label="sun at this venue" />
                        <p className="text-[11px] text-slate-500">Estimated from the sun&apos;s path and the buildings around the venue (City of Melbourne / OpenStreetMap data). Sky badges use today&apos;s forecast.</p>
                      </section>
                    </ForecastErrorBoundary>
                  ) : null}

                  <ForecastErrorBoundary>
                    <HourByHour items={hours} />
                  </ForecastErrorBoundary>

                  <ConditionsGrid tiles={tiles}>
                    <MoreWeatherDetail
                      open={moreOpen}
                      onToggle={() => setMoreOpen((v) => !v)}
                      venueId={venue?.id}
                      uvIndex={uvIndex}
                      aqLabel={aqLabel}
                      rainArrivalMins={rainArrivalMins}
                      rainArrivalLabel={rainArrivalLabel}
                      venue={venue}
                      microclimate={microclimate}
                      microclimateAtLabel={microclimateAtLabel}
                      shielding={shielding}
                    />
                  </ConditionsGrid>

                  <VenueOfferingsList key={venue?.id} offerings={offerings} liveNotes={liveNotes} />

                  <AboutAndHours description={description} hours={hoursView} />
                  <VenueSourceNote note={venueSourceNote(venue)} />
                  <HappyHourSection happyHour={happyHour} />
                  <VibeSection onManage={handleManage} />
                </div>
              </VenueDetailErrorBoundary>
            </div>
          </div>

          {/* Sticky Bottom CTA — in-flow so it cannot bleed into the TopBar */}
          <div className="relative z-20 shrink-0 border-t border-slate-900/[0.08] bg-white/98 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <VenueCardFooterActions venue={safeVenue} canNavigate={hasValidCoordinates} share={share} />
          </div>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  );
}

VenueCard.displayName = 'VenueCard';
export default memo(VenueCard);
