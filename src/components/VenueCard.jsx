import { venueSourceNote } from '../utils/venueSource';
import { footerPrimaryAction, websiteHostLabel } from '../utils/venueFooterActions.js';
import React, { memo, useState, useMemo, useRef, useId, useLayoutEffect, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { X, Wind, Globe, Navigation, ExternalLink, ChevronDown, MapPin } from 'lucide-react';
import VenueDetailErrorBoundary from './VenueDetailErrorBoundary';
import ForecastErrorBoundary from './common/ForecastErrorBoundary';
import WindComfortPanel from './WindComfortPanel';
import OutsideToday, { OutsideVerdict } from './OutsideToday.jsx';
import RoomSunCard from './RoomSunCard';
import SunCompass from './SunCompass.jsx';
import { stayRoomTypesDisplay } from '../utils/stayRoomTypes.js';
import SunMomentsPanel from './SunMomentsPanel.jsx';
import CafeSunSection, { CafeSunMonths, CafeSunFacts } from './CafeSunSection.jsx';
import { useVenueSunProfile } from '../hooks/useVenueSunProfile';
import { cafeCardTiles, isCafeVenue } from '../utils/cafeCardTiles.js';
import { cardSunWindows, forecastForSunWindows, rainDuringSun, roundedSunDay } from '../utils/sunWindowsCard.js';
import { outdoorSunDay, roomsBySunToday, sunMomentsFromDay } from '../utils/sunMoments.js';
import { outdoorSunSummary } from '../utils/outdoorSunSummary.js';
import { DEFAULT_TIME_ZONE, venueDayBounds, venueLocalDate } from '../utils/balconySunEngine.js';
import { outsideToday, rowsForLocalDay, shadeByHour } from '../utils/outsideToday.js';
import { localTimeToSliderMinutes } from '../utils/todMinutes.js';
import { windFactorView } from '../utils/windComfortView.js';
import { describeWindExposure } from '../utils/windExposure.js';
import { windChip } from '../utils/venueConditionChips.js';
import { generateHourlyForecast, getVenueWindExposure, getWindProfile, measuredWindOptions, resolveVenueWindFactor } from '../data/windIntelligence.js';
import ClayIcon from './common/ClayIcon';
import {
  AboutAndHours,
  VenueSourceNote,
  HappyHourSection,
  PartnerExtrasSection,
  HourByHour,
  TodaysSun,
  TonightFeelSection,
  VenueHero,
  VenueInfoHeader,
  VenueOfferingsList,
  VenueSunNow,
  VenueWeatherNow,
  VenueSunCaption,
  VibeSection,
  AccessSection,
  formatScore,
  SECTION_TITLE,
} from './VenueCardSections';
import { useOpenAQ } from '../hooks/useOpenAQ';
import { useTomorrowRain } from '../hooks/useTomorrowRain';
import { useOpenUV } from '../hooks/useOpenUV';
import { useDeferredForecastReady } from '../hooks/useDeferredForecastReady';
import { checkIsAccommodation } from '../utils/accommodation';
import { useWeather } from '../context/WeatherContext';
import { useMicroclimateActions, useMicroclimateState } from '../context/MicroclimateContext';
import { formatReadingTime, lookupMicroclimateEntry, readMicroclimate } from '../utils/microclimate';
import { formatHour } from '../utils/sunForecastState';
import { canUsePointerTilt } from '../utils/canUsePointerTilt';
import { resolveOverviewScore } from '../utils/resolveOverviewScore';
import { errorBoundaryRemountKey, resetVenueDetailScroller, venueOverlayPresenceKey } from '../utils/venueDetailTabs';
import { venueIcon, weatherIconName } from '../utils/clayIcons';
import { venueStatTiles } from '../utils/venueStatTiles.js';
import ScoreRing from './common/ScoreRing.jsx';
import { venueCardSunSection } from '../utils/venueCardSunFlow.js';
import { canShowHotelSunReport } from '../utils/hotelSunReportRoute.js';
import { hourlyStrip, isNightAt, sunSentence, venueFeelsLike, venueSunForecast } from '../utils/venueSun';
import { forecastKindAt } from '../utils/venueFilters';
import { scoreDisplayState } from '../utils/scoreDisplay.js';
import { venueAccessFacts } from '../utils/venueAccess.js';
import { liveWarmthNote } from '../utils/venueFeaturePin.js';
import { venueShareMessage, venueShareUrl } from '../utils/venueLink.js';
import { usePublicAccessibleToilet } from '../hooks/usePublicAccessibleToilet.js';
import { usePartnerTools } from '../hooks/usePartnerTools.js';
import { outdoorChips, partnerClock, upcomingPartnerEvents, withPartnerAccess } from '../utils/partnerTools.js';
import { offeringsBesideCafeFacts, venueOfferings } from '../utils/venueOfferings';
import { tonightFeel } from '../utils/tonightFeel.js';
import { sunSourceConfidence } from '../utils/sunSourceConfidence.js';
import { getBadgeDisplayText, getBadgeState } from '../utils/dataBadgeState.js';
import { keyAmenities } from '../utils/venueAmenities';
import { venuePerfectFor } from '../utils/venuePerfectFor.js';
import { venueHoursView, verifiedHappyHour } from '../utils/venueHours';
import { venueTypeLabel } from '../utils/venueTypeLabel';

const MICRO_LABEL = 'text-[12px] font-semibold text-slate-600';

// Keep the name and score visible once the compact top row scrolls away.
const COMPACT_HEADER_AT = 140;

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
    <div className="rounded-2xl border border-amber-500/15 bg-white p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={MICRO_LABEL}>Microclimate at {atLabel}</span>
        {reading.isLiveSun ? (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden="true" />
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
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
const MoreWeatherDetail = ({ open, onToggle, venueId, uvIndex, aqLabel, rainArrivalMins, rainArrivalLabel, venue, microclimate, microclimateEntry = null, microclimateAtLabel, shielding, shelterShownAbove = false }) => {
  const panelId = `venue-more-weather-${venueId ?? 'panel'}`;
  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="ss-venue-more-weather"
      >
        <Wind size={22} aria-hidden="true" /><span className="flex-1">UV, air quality and wind comfort</span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div id={panelId} className="ss-venue-weather-details flex flex-col gap-3">
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
            <WindComfortPanel venue={venue} microclimate={microclimateEntry} showFactor={!shelterShownAbove} />
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

  // Share SunStay's own link to this venue (?venue=<id>), so the person it's
  // sent to lands on the venue in SunStay, not on the venue's website.
  const venueId = venue?.id;
  const share = useCallback(async () => {
    if (venueId == null || typeof window === 'undefined') return;
    const url = venueShareUrl(window.location.href, venueId);
    const { title, text } = venueShareMessage(venue);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        setShareLabel('Link copied');
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setShareLabel('Share'), 2000);
      }
    } catch {
      // Soft fail when clipboard is unavailable.
    }
  }, [venueId, venue]);

  return { share, shareLabel, canShare: venueId != null, websiteUrl };
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
    let timer;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    };
    // Align with real minute boundaries, including the 11pm evening cutoff.
    timer = setTimeout(tick, 60_000 - Date.now() % 60_000);
    return () => clearTimeout(timer);
  }, []);
  return now;
}

function VenueCardFooterActions({ venue, canNavigate, share }) {
  const captionId = useId();
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${Number(venue?.lat)},${Number(venue?.lng)}` : null;
  if (footerPrimaryAction({ venue, websiteUrl: share.websiteUrl }) === 'website') {
    return <div className="ss-venue-stay-footer-actions">
      {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-stay-directions"><Navigation size={18} aria-hidden="true" />Get directions<ExternalLink size={16} aria-hidden="true" /></a>
        : <button type="button" disabled className="ss-venue-stay-directions" aria-label="Get directions unavailable"><Navigation size={18} aria-hidden="true" />Get directions<ExternalLink size={16} aria-hidden="true" /></button>}
      <a href={share.websiteUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-property-website" aria-describedby={captionId}><Globe size={18} aria-hidden="true" />Visit property website<ExternalLink size={16} aria-hidden="true" /></a>
      <p id={captionId}>Opens {websiteHostLabel(share.websiteUrl)}</p>
    </div>;
  }
  return <div className="ss-venue-footer-actions">
    {share.websiteUrl ? <a href={share.websiteUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-website"><Globe size={18} aria-hidden="true" />Website</a> : null}
    {directionsUrl ? <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-directions" aria-label="Get directions"><Navigation size={18} aria-hidden="true" />Get directions</a>
      : <button type="button" disabled className="ss-venue-directions" aria-label="Get directions unavailable"><Navigation size={18} aria-hidden="true" />Get directions</button>}
  </div>;
}

// ── Main VenueCard ────────────────────────────────────────────
function VenueCard({ venue, weather, onClose, onCenter, onOpenSunReport, setShowOwnerDashboard, setSelectedVenue, liveVenueFeatures, onSheetGesture, stayMatch }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const scrollerRef = useRef(null);
  const dialogRef = useRef(null);
  const compactCloseRef = useRef(null);
  const openerRef = useRef(null);
  const returnFocusFrame = useRef(null);
  const now = useMinuteClock();
  const isReadyToFetch = useDeferredForecastReady(moreOpen, venue?.id ?? '');
  const auxEnabled = moreOpen && isReadyToFetch;

  useLayoutEffect(() => {
    setMoreOpen(false);
    compactRef.current = false;
    setCompact(false);
    resetVenueDetailScroller(scrollerRef.current);
  }, [venue?.id]);

  useLayoutEffect(() => {
    cancelAnimationFrame(returnFocusFrame.current);
    if (!openerRef.current) openerRef.current = document.activeElement;
    const panel = dialogRef.current;
    scrollerRef.current?.querySelector('[aria-label="Close venue details"]')?.focus({ preventScroll: true });
    return () => {
      // The list collapses when a venue opens, so its row may no longer be visible.
      // Wait for that render before returning to the opener or the list handle.
      returnFocusFrame.current = requestAnimationFrame(() => {
        if ([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some(element => element !== panel)) return;
        const canFocus = element => element instanceof HTMLElement && element.isConnected && element.tabIndex >= 0 && !element.disabled && !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
        const previous = openerRef.current;
        // An exiting mobile list row can still be mounted during its animation.
        const opener = !previous?.closest('.ss-mobile-sheet') && canFocus(previous) ? previous
          : [...document.querySelectorAll('.ss-home-summary-copy'), document.querySelector('.ss-map-first-search-pill input')].find(canFocus);
        opener?.focus({ preventScroll: true });
      });
    };
  }, []);

  const handleDialogKeyDown = event => {
    // Sun Report and partner preview are separate, portalled dialogs.
    if (event.defaultPrevented || !dialogRef.current?.contains(event.target)) return;
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter(element => element.tabIndex >= 0 && !element.disabled && !element.closest('[aria-hidden="true"], [inert]') && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

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

  useLayoutEffect(() => {
    if (compact && document.activeElement?.closest('.ss-venue-toolbar')) compactCloseRef.current?.focus({ preventScroll: true });
    else if (!compact && document.activeElement === compactCloseRef.current) scrollerRef.current?.querySelector('[aria-label="Close venue details"]')?.focus({ preventScroll: true });
  }, [compact]);

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
    fetchedAt: weatherFetchedAt,
    setScorePreviewMinutes,
  } = useWeather();
  const { setTodMinutes } = useMicroclimateActions();
  // The card's slider moves the app's one time of day: the same minutes the
  // map pins, the list and this card's score read. The map normally forwards
  // them to the weather score; the card does it too in case the map never loaded.
  // "Now" is the slider's own position for the current time, as the map's Now button sets it.
  const selectOutsideMinutes = useCallback((minutes) => {
    const value = minutes == null ? localTimeToSliderMinutes(new Date()) : minutes;
    setTodMinutes(value);
    if (typeof setScorePreviewMinutes === 'function') setScorePreviewMinutes(value);
  }, [setTodMinutes, setScorePreviewMinutes]);
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
  const venueTimeZone = venue?.timeZone ?? venue?.timezone ?? DEFAULT_TIME_ZONE;

  // One sun forecast for the stat row, "Today's sun", its bar, the hourly
  // strip and the sunset tile.
  const forecast = useMemo(
    () => venueSunForecast({
      venue: { lat: finite(lat), lng: finite(lng), timeZone: venueTimeZone, obstacle_height: venue?.obstacle_height, obstacle_distance: venue?.obstacle_distance },
      weather: liveWeather,
      now,
    }),
    [lat, lng, venueTimeZone, venue?.obstacle_height, venue?.obstacle_distance, liveWeather, now],
  );
  const hours = useMemo(() => hourlyStrip(liveWeather, { now, forecast, timeZone: venueTimeZone }), [liveWeather, now, forecast, venueTimeZone]);
  const tonight = useMemo(() => tonightFeel({ venue, weather: liveWeather, now }), [venue, liveWeather, now]);
  const sentence = sunSentence(forecast);
  const nowIcon = hours[0]?.icon ?? weatherIconName(null, { isNight: !forecast.isSunUp });
  // Sun down at the score's time (the scrubber, like the list): show "Night", not 0.
  const nightAtScoreTime = isNightAt(forecast, todMinutes);
  const publicToilet = usePublicAccessibleToilet(venue);
  // Raining at the score's time: the direct-sun number is near 0, so say "Rain".
  const skyAtScoreTime = forecastKindAt(forecast, todMinutes);
  const scoreState = scoreDisplayState({ isNight: nightAtScoreTime, skyKind: skyAtScoreTime });

  // Sheltered feels-like and wind remain the same values as the list.
  const feelsLike = venueFeelsLike(venue, liveWeather, microclimateEntry);
  const rainChance = finite(liveWeather?.precipProbability);
  const uvIndex = finite(liveWeather?.uvi ?? liveWeather?.uvIndex);

  const { aqLabel } = useOpenAQ(lat, lng, { enabled: auxEnabled });
  useOpenUV(lat, lng, { enabled: auxEnabled });
  const { rainArrivalMins, rainArrivalLabel } = useTomorrowRain(lat, lng, { enabled: auxEnabled });

  const offerings = useMemo(() => venueOfferings(venue), [venue]);
  const amenities = useMemo(() => keyAmenities(venue), [venue]);
  const liveFeaturesForVenue = venue?.id ? liveVenueFeatures?.[venue.id] : null;
  const liveNote = liveWarmthNote(liveFeaturesForVenue);

  // Room details come from the venue itself. The old catalogue
  // (src/data/venues.js) is not looked up by name: its ids never match ours,
  // and a name match can attach another venue's rooms.
  const roomIntelligence = venue?.roomIntelligence;
  const roomTypes = Array.isArray(venue?.roomTypes) ? venue.roomTypes : [];
  const showStay = isHotelOrStay && (roomIntelligence || roomTypes.length > 0);
  // Today's roomTypes are modelled facade sides, so the section names sides, not rooms.
  const stayDisplay = roomTypes.length > 0 ? stayRoomTypesDisplay(venue) : null;
  // Bars, cafes and other outdoor venues: today's sun from the buildings
  // around them (stored horizon) plus today's forecast sky.
  const { horizon: sunHorizon, geometryConfidence } = useVenueSunProfile(showStay ? null : venue?.id);
  // Cafés get the café sun card, whose windows are rounded to whole minutes
  // so the stat row, the sentence and the headline all show the same total.
  const isCafe = !showStay && isCafeVenue(venue);
  let todayKey = null;
  try { todayKey = venueLocalDate(now, venueTimeZone); } catch { /* bad time zone: no section */ }
  // Recomputed when the venue's day changes, not every minute.
  const outdoorDay = useMemo(() => {
    const day = sunHorizon && todayKey ? outdoorSunDay({ lat, lng, horizon: sunHorizon, date: todayKey, timeZone: venueTimeZone }) : null;
    return day && isCafe ? roundedSunDay(day) : day;
  }, [sunHorizon, lat, lng, todayKey, venueTimeZone, isCafe]);
  const outdoorMoments = useMemo(
    () => (outdoorDay ? sunMomentsFromDay({ daily: outdoorDay, forecast, timeZone: venueTimeZone }) : null),
    [outdoorDay, forecast, venueTimeZone],
  );
  const sunSection = venueCardSunSection({ showStay, outdoorDay, outdoorMoments, cafe: isCafe });
  // With sun moments on screen, the stat row and sentence read the same
  // building-shaded windows as the moments' total, not the open-sky forecast.
  const outdoorSummary = sunSection === 'moments' || sunSection === 'cafe'
    ? outdoorSunSummary({ daily: outdoorDay, forecast, now, timeZone: venueTimeZone })
    : null;
  // Partner preview data (this device only) fills in what the listing lacks, labelled as such.
  const { tools: partnerTools } = usePartnerTools(venue?.id);
  const verifiedHH = verifiedHappyHour(venue);
  const happyHour = verifiedHH ?? partnerTools?.happyHour ?? null;
  const partnerClockNow = partnerClock(now, venueTimeZone);
  const partnerEvents = upcomingPartnerEvents(partnerTools?.events, partnerClockNow);
  const partnerOutdoor = outdoorChips(partnerTools?.outdoor);
  const hoursView = venueHoursView(venue);
  const description = [venue?.venue_description, venue?.description, venue?.about]
    .find((d) => typeof d === 'string' && d.trim())?.trim() ?? null;

  const statTiles = venueStatTiles({ venue, microclimate: microclimateEntry, weather: liveWeather, forecast, score, scoreLoading: overviewScore.loading, feelsLike, sunNow: outdoorSummary, isNight: nightAtScoreTime, skyKindAtScore: skyAtScoreTime });
  // Sun and wind together, for bars, cafes and other outdoor venues: the sky
  // from this card's forecast, the venue's own shade, and the wind rows the
  // Wind & comfort panel shows, lined up by local hour (utils/outsideToday.js).
  const dayWind = useMemo(() => {
    if (showStay || !liveWeather?.hourly || !todayKey) return null;
    const temp = finite(liveWeather.main?.temp);
    if (temp == null) return null;
    const windMs = finite(liveWeather.wind?.speed) ?? 0;
    const direction = finite(liveWeather.windDirection ?? liveWeather.wind?.deg);
    const gustKmh = finite(liveWeather.windGusts);
    const gustMs = gustKmh == null ? null : gustKmh / 3.6;
    const measured = measuredWindOptions(microclimateEntry, direction);
    let dayStart;
    try { dayStart = venueDayBounds(todayKey, venueTimeZone).start; } catch { return null; }
    const rows = generateHourlyForecast(temp, windMs, finite(liveWeather.main?.humidity), venue, direction, gustMs,
      { hourly: liveWeather.hourly, utcOffsetSeconds: liveWeather.utcOffsetSeconds, now: dayStart, ...measured });
    return {
      // Only today's hours: a forecast that starts mid-day runs on into tomorrow.
      rows: rowsForLocalDay(rows, todayKey, venueTimeZone),
      direction,
      openAirKmh: Math.round(windMs * 3.6),
      factor: resolveVenueWindFactor(venue, { direction, ...measured }),
      exposure: getVenueWindExposure(windMs, venue, direction, gustMs, measured),
    };
  }, [showStay, liveWeather, todayKey, venueTimeZone, venue, microclimateEntry]);
  const windNow = liveWeather ? windChip(venue, liveWeather, microclimateEntry) : null;
  const outside = dayWind ? outsideToday({
    forecast,
    shade: shadeByHour({ windows: outdoorDay?.windows ?? null, curve: microclimateEntry?.sun_hour_fraction ?? null, timeZone: venueTimeZone }),
    windRows: dayWind.rows,
    // What the tiles show for this moment, so "now" cannot disagree with them.
    live: { sunKind: (outdoorSummary ?? forecast.now)?.kind ?? null, windKmh: windNow?.kmh ?? null, feelsLike, windFrom: dayWind.direction, windSource: dayWind.factor?.source ?? null },
    selectedMinutes: todMinutes,
    nowSliderMinutes: localTimeToSliderMinutes(now),
  }) : null;
  const outsideFactor = outside && dayWind.factor ? windFactorView({
    ...dayWind.factor, note: dayWind.factor.note ?? getWindProfile(venue).venueNote, illustrative: Boolean(venue?.comfortProfilesIllustrative),
  }) : null;
  const outsideShelter = outsideFactor ? {
    ...outsideFactor,
    example: windNow?.kmh != null ? `${dayWind.openAirKmh} km/h in the open is about ${windNow.kmh} km/h here` : null,
    tunnel: dayWind.exposure?.tunnel ? describeWindExposure(dayWind.exposure, 'now') : null,
  } : null;
  // The wind word beside the sun score: the chosen hour's, or now's.
  const scoreWindWord = outside ? outside.readout.windWord : windNow?.text ?? null;
  const sunNowSentence = outdoorSummary?.sentence ?? sentence;
  const outsideSentence = !outside ? sunNowSentence
    : outside.isNow ? [sunNowSentence, outside.verdict?.feelsSentence].filter(Boolean).join(' ')
    : outside.verdict ? `${outside.verdict.sunSentence} ${outside.verdict.feelsSentence}`
    : 'The forecast does not cover this hour yet.';
  // The weather row follows the chosen hour.
  const outsideTiles = outside && !outside.isNow ? [
    statTiles[0],
    { ...statTiles[1], value: outside.readout.windWord ?? 'Unavailable', note: outside.readout.windKmh != null ? `${outside.readout.windKmh} km/h` : null },
    { ...statTiles[2], value: outside.readout.feelsLike != null ? `${outside.readout.feelsLike}°` : '–' },
  ] : statTiles;
  const cardSun = outdoorDay ? cardSunWindows(outdoorDay) : null;
  // Stay cards can show another date's rooms, so today's rain only goes on outdoor sun cards.
  const rain = sunSection === 'stay' ? null : rainDuringSun({ forecast: liveWeather ? forecast : null, sun: cardSun });
  const cafeFactKeys = sunSection === 'cafe' ? cafeCardTiles(venue, { microclimate: microclimateEntry, now }).map((tile) => tile.key) : [];
  const sky = forecastForSunWindows({ forecast: liveWeather ? forecast : null, sun: cardSun });
  const sunSource = sunSourceConfidence({ horizon: sunHorizon, geometryConfidence: geometryConfidence ?? microclimateEntry?.geometry_confidence ?? null, dataSource: venue?.data_source });
  const forecastLabel = getBadgeDisplayText(getBadgeState({ kind: 'forecast', updatedAt: weatherFetchedAt, now })).visibleLabel;

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} details`}
        onKeyDown={handleDialogKeyDown}
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
          className="ss-venue-detail-card pointer-events-auto relative z-50 flex h-full min-h-0 w-full select-none flex-col overflow-hidden rounded-t-[28px] bg-white font-sans"
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
              ref={compactCloseRef}
              type="button"
              onClick={onClose}
              tabIndex={compact ? 0 : -1}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.06] text-slate-800 active:bg-slate-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Close venue details"
            >
              <X size={19} strokeWidth={2.5} />
            </button>
            <span className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-[-0.01em] text-slate-900">{displayName}</span>
            {!overviewScore.loading && scoreState === 'score' && Number.isFinite(score) ? (
              <ScoreRing score={score} size={38} />
            ) : (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 py-1 pl-1.5 pr-3">
                <ClayIcon name={nowIcon} size={24} />
                <span className="text-[14px] font-extrabold tabular-nums text-slate-700">
                  {overviewScore.loading ? '…' : scoreState === 'night' ? 'Night' : scoreState === 'rain' ? 'Rain' : formatScore(score)}
                </span>
                <span className="sr-only">{overviewScore.loading ? 'Sun score' : scoreState === 'night' ? 'Sun score not shown after dark' : scoreState === 'rain' ? 'Sun score not shown while it rains' : 'Sun score'}</span>
              </span>
            )}
          </div>

          <div
            ref={scrollerRef}
            data-venue-card-scroller
            onScroll={handleScroll}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white"
          >
            <VenueHero
              compact={compact}
              onClose={onClose}
              onShare={share.share}
              shareLabel={share.shareLabel}
              canShare={share.canShare}
              saved={saved}
              onToggleSave={toggleSaved}
              onDragStart={(e) => dragControls.start(e)}
            />

            <div className="relative z-[1] bg-white pb-4">
              <VenueDetailErrorBoundary
                key={errorBoundaryRemountKey(venue?.id)}
                venueId={venue?.id}
                onClose={onClose}
              >
                <div className="ss-venue-card-content">
                  <VenueInfoHeader icon={icon} name={displayName} subtitle={subtitle}>
                    <span className="ss-venue-score-pair">
                      {!overviewScore.loading && scoreState === 'score' && Number.isFinite(score) ? <ScoreRing score={score} size={56} /> : <span className="ss-venue-score-state">
                        <ClayIcon name={nowIcon} size={28} />
                        <strong>{overviewScore.loading ? '…' : scoreState === 'night' ? 'Night' : scoreState === 'rain' ? 'Rain' : formatScore(score)}</strong>
                        <span className="sr-only">{overviewScore.loading ? 'Sun score loading' : scoreState === 'night' ? 'Sun score not shown after dark' : scoreState === 'rain' ? 'Sun score not shown while it rains' : 'Sun score'}</span>
                      </span>}
                      {scoreWindWord ? <small data-score-wind><span className="sr-only">Wind: </span>{scoreWindWord}</small> : null}
                    </span>
                  </VenueInfoHeader>
                  {liveNote ? <div role="status" className="ss-venue-live-note"><ClayIcon name="fireplace" size={28} /><span>{liveNote}<small>Set by the venue</small></span></div> : null}

                  <div className={`ss-venue-sun-block${outside?.verdict ? ' has-verdict' : ''}`}>
                    <OutsideVerdict model={outside} />
                    {/* The to-the-minute sun line describes this moment, so it steps aside for another hour. */}
                    {!outside || outside.isNow ? <VenueSunNow tile={statTiles[0]} /> : null}
                    <p className="ss-venue-sun-sentence">{outsideSentence}</p>
                    {weatherUnavailable && !weatherLoading ? <p className="ss-venue-sun-caption" role="status">Live weather is unavailable right now, so the forecast below is limited.</p> : null}

                    {outside ? (
                      <ForecastErrorBoundary>
                        <OutsideToday model={outside} onSelectMinutes={selectOutsideMinutes} shelter={outsideShelter}>
                          <VenueWeatherNow tiles={outsideTiles} rainChance={outside.isNow ? rainChance : outside.readout.rainChance} at={outside.isNow ? null : outside.timeLabel} />
                        </OutsideToday>
                      </ForecastErrorBoundary>
                    ) : null}

                    {sunSection === 'stay' ? (
                      <section aria-labelledby="stay-heading" className="flex flex-col gap-3">
                        <div>
                          <h3 id="stay-heading" className={SECTION_TITLE}>{stayDisplay?.headline ?? (venue.typeCategory === 'Residential' ? 'Your property' : 'Your stay')}</h3>
                          {stayDisplay?.trustLine ? <p className="mt-1 text-[12px] font-medium text-slate-500">{stayDisplay.trustLine}</p> : null}
                        </div>
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
                        <SunCompass rooms={roomTypes} venue={venue} date={stayMatch?.daily?.date ?? todayKey} now={now} />
                        <RoomIntelligencePanel roomIntelligence={roomIntelligence} />
                        {roomsBySunToday(roomTypes, venue, stayMatch?.daily?.date ?? todayKey, stayMatch?.bestRoom).map((room, i) => <RoomSunCard key={room?.id ?? i} room={room} venue={venue} date={stayMatch?.daily?.date} highlighted={stayMatch?.bestRoom === room} forecast={stayMatch?.daily?.date ? null : forecast} />)}
                      </section>
                    ) : null}

                    {/* The strip above already draws today's sun; this bar is the fallback without an hourly forecast. */}
                    {sunSection === 'today' && !outside ? (
                      <ForecastErrorBoundary>
                        <TodaysSun forecast={forecast} />
                      </ForecastErrorBoundary>
                    ) : null}

                    {sunSection === 'moments' ? (
                      <ForecastErrorBoundary>
                        <section aria-labelledby="sun-moments-heading" className="flex flex-col gap-3">
                          <h3 id="sun-moments-heading" className={SECTION_TITLE}>Sun moments today</h3>
                          <SunMomentsPanel daily={outdoorDay} summary={outdoorMoments} timeZone={venueTimeZone} now={now} label="sun at this venue" compact />
                        </section>
                      </ForecastErrorBoundary>
                    ) : null}

                    {sunSection === 'cafe' ? (
                      <ForecastErrorBoundary>
                        <CafeSunSection
                          venue={venue}
                          daily={outdoorDay}
                          horizon={sunHorizon}
                          geometryConfidence={geometryConfidence ?? microclimateEntry?.geometry_confidence ?? null}
                          microclimateEntry={microclimateEntry}
                          forecast={liveWeather ? forecast : null}
                          showDetails={false}
                          now={now}
                          timeZone={venueTimeZone}
                        />
                      </ForecastErrorBoundary>
                    ) : null}

                    {sunSection !== 'cafe' ? <>
                      <VenueSunCaption source={sunSource} buildingData={Boolean(outdoorDay)}
                        sunrise={forecast.sunriseHour != null ? formatHour(forecast.sunriseHour) : null}
                        sunset={forecast.sunsetHour != null ? formatHour(forecast.sunsetHour) : null}
                        timeZoneLabel={venueTimeZone === DEFAULT_TIME_ZONE ? 'Melbourne time' : 'Venue local time'} />
                      {sky && (sky.kind === 'cloud' || sky.kind === 'mixed') ? <p className="ss-venue-sun-caption">{sky.text}</p> : null}
                    </> : null}
                  </div>

                  {outside ? null : <VenueWeatherNow tiles={statTiles} rainChance={rainChance} />}
                  {rain ? <div className="ss-venue-rain-row"><ClayIcon name="rain" size={28} /><div><p>{rain.title}</p>{rain.detail ? <p>{rain.detail}</p> : null}</div></div> : null}
                  <ForecastErrorBoundary><HourByHour items={hours} forecastLabel={forecastLabel} /></ForecastErrorBoundary>
                  <TonightFeelSection view={tonight} />
                  {sunSection === 'cafe' ? <CafeSunMonths venue={venue} daily={outdoorDay} horizon={sunHorizon} timeZone={venueTimeZone} /> : null}
                  {sunSection === 'moments' && venuePerfectFor(outdoorMoments) ? <div className="ss-venue-summary-row"><ClayIcon name="sun" size={32} /><p>Best for {venuePerfectFor(outdoorMoments)}</p></div> : null}

                  <section aria-labelledby="good-to-know-heading" className="ss-venue-good-to-know">
                    <h3 id="good-to-know-heading" className={SECTION_TITLE}>Good to know</h3>
                    {description ? <p className="ss-venue-description">{description}</p> : null}
                    {sunSection === 'cafe' ? <CafeSunFacts venue={venue} microclimateEntry={microclimateEntry} now={now} /> : null}
                    <VenueOfferingsList key={venue?.id} offerings={offeringsBesideCafeFacts(offerings, cafeFactKeys)} amenities={amenities} />
                    {address || (onCenter && hasValidCoordinates) ? <div className="ss-venue-fact"><MapPin size={22} aria-hidden="true" /><span>{address ?? displayName}</span>
                      {onCenter && hasValidCoordinates ? <button type="button" onClick={() => onCenter(venue)} className="ss-venue-text-action">Map</button>
                        : mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="ss-venue-text-action">Map</a> : null}
                    </div> : null}
                    <AboutAndHours hours={hoursView} websiteUrl={share.websiteUrl} />
                    <AccessSection access={venueAccessFacts(withPartnerAccess(venue, partnerTools))} publicToilet={publicToilet} />
                    <HappyHourSection happyHour={happyHour} fromPartnerPreview={!verifiedHH && Boolean(happyHour)} />
                    <PartnerExtrasSection events={partnerEvents} outdoor={partnerOutdoor} />
                    <MoreWeatherDetail open={moreOpen} onToggle={() => setMoreOpen(v => !v)} venueId={venue?.id} uvIndex={uvIndex} aqLabel={aqLabel}
                      rainArrivalMins={rainArrivalMins} rainArrivalLabel={rainArrivalLabel} venue={venue} microclimate={microclimate} microclimateEntry={microclimateEntry} microclimateAtLabel={microclimateAtLabel} shielding={shielding} shelterShownAbove={Boolean(outsideShelter)} />
                  </section>
                  <VibeSection onManage={handleManage} venueName={displayName} />
                  <VenueSourceNote note={venueSourceNote(venue)} />
                </div>
              </VenueDetailErrorBoundary>
            </div>
          </div>

          {/* Sticky Bottom CTA — in-flow so it cannot bleed into the TopBar */}
          <div className="ss-venue-footer relative z-20 shrink-0">
            <VenueCardFooterActions venue={safeVenue} canNavigate={hasValidCoordinates} share={share} />
          </div>
        </motion.article>
      </motion.div>
    </AnimatePresence>
  );
}

VenueCard.displayName = 'VenueCard';
export default memo(VenueCard);
