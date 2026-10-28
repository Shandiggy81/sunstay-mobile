import './components/ExplorePresentation.css';
import './components/MapFirstHome.css';
import { homeSunClause, mapHomeSummary } from './utils/mapHomeSummary.js';
import { comfortSortLabel, conditionsClause, homeConditions, rankForConditions } from './utils/homeConditions.js';
import React, { useState, useRef, useCallback, useMemo, useEffect, Suspense, lazy, memo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import { MicroclimateProvider, useVenueMicroclimate, useMicroclimateActions, useMicroclimateState } from './context/MicroclimateContext';
import { lookupMicroclimateEntry, markerScoreFromMicroclimate, readMicroclimate } from './utils/microclimate';
import { deriveSunForecast } from './utils/sunForecastState';
import { forecastKindAt, isVenueInDirectSun, matchesTagFilters } from './utils/venueFilters';
import { scoreDisplayState } from './utils/scoreDisplay.js';
import { liveWarmthNote } from './utils/venueFeaturePin.js';
import { readVenueLinkId, resolveVenueLink, venueLinkUrl, venueUrlChange } from './utils/venueLink.js';
import { isPropertyVenue, isStayVenue, matchesPropertyTypeFilters, PROPERTY_FILTERS } from './utils/propertyTypes';
import { homesEmptyState, includeNonStayResults } from './utils/propertyResults.js';
import { FOOD_TYPE_FILTERS, isFoodTypeFilter, matchesFoodTypeFilters } from './utils/venueFoodType';
import { venueTypeLabel } from './utils/venueTypeLabel';
import { filterChoiceKey } from './utils/filterRefit';
import { DEFAULT_TIME_ZONE, venueLocalDate } from './utils/balconySunEngine';
import { activeSunMoments, createSunMomentsJob, isSunMomentFilter, sameSunMomentInputs, SUN_MOMENT_FILTERS, sunMomentsByVenue, venueMatchesSunMoments } from './utils/sunMomentFilters';
import { runWhenIdle } from './utils/idleJob';
import { useSunHorizons } from './hooks/useSunHorizons';
import AfterDarkPanel from './components/AfterDarkPanel.jsx';
import HomeSheetMode from './components/HomeSheetMode.jsx';
import { useAfterDarkEvents } from './hooks/useAfterDarkEvents.js';
import { afterDarkOrigin, resolveAfterDarkMode } from './utils/afterDarkHome.js';
import MapVenuePreview from './components/MapVenuePreview';
import { isPreviewMapDrag } from './utils/mapVenuePreview';
import VenueCard from './components/VenueCard';
import StaySunPicker from './components/StaySunPicker.jsx';
import StayComparison from './components/StayComparison.jsx';
import ExperienceFinder from './components/ExperienceFinder.jsx';
import { clearExperience, discoveryContext, discoveryDataLabel, matchedMomentLabel, selectedExperience, selectExperience } from './utils/discoveryExperience.js';
import { isEstimatedRoom } from './utils/roomProfiles.js';
import { rankStays, stayMomentBadge, quickStayDate, compareStayRank } from './utils/stayRanking.js';
import ChatWidget from './components/ChatWidget';
import TopBar from './components/TopBar';
import NotificationCenter from './components/NotificationCenter';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronUp, ChevronDown,
    Wind, Cloud, Locate
} from 'lucide-react';
import { useVenues } from './hooks/useVenues';
import { findHotelSunReportVenue, hotelSunReportUrl, readHotelSunReportId } from './utils/hotelSunReportRoute.js';
import { MAPBOX_TOKEN, MAX_BOUNDS } from './config/mapConfig';
import { needsPlaceLookup, parsePlaceResponse, parseSearchQuery, placeCountLabel, placeLookupUrl, venueMatchesSearch, venuesNearPlace } from './utils/locationSearch';
import { pullRefreshStatus, refreshFailureVisible } from './utils/pullRefreshStatus';
import { sheetDragCompositing } from './utils/sheetDragCompositing';
import {
    INITIAL_VISIBLE_VENUES,
    VENUES_PER_LOAD,
    venueResultIdentity,
} from './utils/progressiveVenueList';
import { ENABLE_MANUAL_VENUE_REFRESH } from './utils/manualVenueRefresh';
import MascotPullRefresh from './components/MascotPullRefresh';
import VenueRefreshButton from './components/VenueRefreshButton';
import { useVenueFeatures } from './hooks/useVenueFeatures';
import SplashScreen from './components/SplashScreen';
import { getWindWarning } from './data/windIntelligence';
import { getComfortLevel } from './utils/weatherService';
import { getSunData } from './utils/getSunData';
import { sortVenuesBySunstayScore } from './utils/sortVenuesBySunstayScore';
import { venueDisplayScore } from './utils/venueDisplayScore';
import { isNightAt, listSunStatus, venueFeelsLike, venueSunForecast } from './utils/venueSun';
import { venueConditionChips } from './utils/venueConditionChips';
import { keyAmenities, venueMatchesAmenityFilter } from './utils/venueAmenities';
import { feelsLikeIconName, venueIcon } from './utils/clayIcons';
import { clayIconName } from './utils/clayFilterIcons';
import ClayIcon from './components/common/ClayIcon';
import VenueIcon from './components/common/VenueIcon';
import { SEARCH_DEBOUNCE_MS } from './utils/debounce';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { Virtuoso } from 'react-virtuoso';
import sunBadgeImg from './assets/sun-badge.jpg';
import fireIconImg from './assets/fire-icon.jpg';
import mascotLogoImg from './assets/sunny-mascot.jpg';
import MapErrorBoundary from './components/MapErrorBoundary';
import AppErrorBoundary from './components/AppErrorBoundary';
import NetworkErrorModal from './components/common/NetworkErrorModal';
import EmptyVenueState from './components/common/EmptyVenueState';
import { areaCountLabel, venueInBounds } from './utils/searchArea';
import SunWindowsGraph from './components/SunWindowsGraph.jsx';
import { isCafeVenue } from './utils/cafeCardTiles.js';
import { FILTER_COZY, FILTER_SUNNY } from './utils/filterIds.js';
import { rowSunAxis, rowSunLine } from './utils/cafeRowSun.js';
import { isHoverPointer, isKeyboardFocus, nextHighlightedVenueId, sameVenueId } from './utils/listMapPairing.js';
import { ROW_SUN_FAILED, setCafeRowSunScrolling, useCafeRowSun, useMinuteNow } from './hooks/useCafeRowSun.js';

// Mapbox GL is ~450 KB gzipped. Loading the map as its own chunk lets the top
// bar, sheet and list paint while it downloads, instead of the whole app
// waiting for it. The download starts on the first render (the map mounts
// under the splash), and a failed download stays inside MapErrorBoundary.
const VenueMap = lazy(() => import('./components/Map/VenueMap'));
const FilterSheet = lazy(() => import('./components/FilterSheet'));
const OwnerDashboard = lazy(() => import('./components/OwnerDashboard'));
const HotelSunReport = lazy(() => import('./components/HotelSunReport.jsx'));

// Filter ID constants (cozy-mode, sunny-mode) live in utils/filterIds.

// FilterSheet chips use FILTER_CATEGORIES[].id, which is also how venue.tags
// are stored. Heating is a string on each venue (not an array).
const HEATING_FILTER_MATCHERS = {
    Fireplace: (heating) => heating.includes('fireplace'),
    Heaters: (heating) => heating.includes('heat') && !heating.includes('no heat'),
    'Indoor Warmth': (heating) => heating.includes('indoor'),
};

// Today's Melbourne CBD sky for the sun-moment chips (null for demo weather).
const sunMomentForecast = (weather) => (
    weather && weather.source !== 'demo'
        ? venueSunForecast({ venue: { lat: -37.8136, lng: 144.9631 }, weather })
        : null
);

const venueMatchesWeatherTag = (venue, filterId) => {
    // Venue tags use the same string values as FILTER_CATEGORIES[].id
    // (e.g. 'Rooftop', 'Pet Friendly'). Match the id directly instead of
    // looking up a non-existent `filter.tag` property — that always returned
    // undefined, so every tag filter used to match zero venues.
    // Key amenities match by any of their names ("Dog friendly" finds "Pet Friendly").
    const amenityMatch = venueMatchesAmenityFilter(venue, filterId);
    if (amenityMatch !== null) return amenityMatch;
    const needle = String(filterId).toLowerCase();
    const tags = venue.tags || [];
    if (tags.some(tag => String(tag).toLowerCase() === needle)) return true;
    const heatingMatcher = HEATING_FILTER_MATCHERS[filterId];
    return heatingMatcher ? heatingMatcher(String(venue.heating || '').toLowerCase()) : false;
};

const EMPTY_LIVE_FEATURES = Object.freeze({});

const LoadingScreen = () => (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-amber-50 to-orange-100">
        <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-center"
        >
            <div className="text-6xl mb-4">☀️</div>
            <p className="text-gray-800 font-bold text-lg">Loading Sunstay…</p>
            <p className="text-gray-500 text-sm">Finding your perfect spot</p>
        </motion.div>
    </div>
);

// ── Weather badge helpers ──────────────────────────────────────────────
const readJsonArray = (key) => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {}
};

const hasSeenSplash = () => {
    try {
        return sessionStorage.getItem('splashShown') === 'true';
    } catch {
        return false;
    }
};

const markSplashSeen = () => {
    try {
        sessionStorage.setItem('splashShown', 'true');
    } catch {}
};

const getWeatherBadge = (weather, venue) => {
    if (!weather) return { emoji: '🌤️', label: 'Fair', color: '#9ca3af' };
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'red' || windWarning.level === 'orange') return { emoji: '💨', label: 'Windy', color: '#3b82f6' };
    if (condition.includes('rain') || condition.includes('drizzle')) return { emoji: '🌧️', label: 'Rain', color: '#6b7280' };
    if (condition.includes('clear') || condition.includes('sunny')) return { emoji: '☀️', label: 'Sunny', color: '#f59e0b' };
    if (condition.includes('cloud')) return { emoji: '☁️', label: 'Cloudy', color: '#9ca3af' };
    return { emoji: '🌤️', label: 'Fair', color: '#f59e0b' };
};

// Soft fallback only: VenueMap prefers cached RPC effective_sun / effective_wind
// when a microclimate profile exists, and only calls this for venues without one.
const getMarkerWeatherColor = (weather, venue) => {
    if (!weather) return 'sunny';
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'red' || windWarning.level === 'orange') return 'windy';
    if (condition.includes('rain') || condition.includes('drizzle')) return 'cloudy';
    if (condition.includes('cloud')) return 'cloudy';
    return 'sunny';
};

// ── Sunstay Score visual ramp ────────────────────────────────────────
// Same thresholds as the venue card's score, so a number reads the same in
// the list and in the card.
// Amber for good sun, slate for little, with text dark enough for 4.5:1 on the tint.
const getSunstayScoreVisual = (score) => {
    if (score >= 75) return { color: '#F59E0B', text: '#92400E' };
    if (score >= 50) return { color: '#FBBF24', text: '#92400E' };
    return { color: '#64748B', text: '#334155' };
};

// ── VenueListCard ──────────────────────────────────────────────────────
// The café row's unlabeled mini sun graph. Its own component so only café
// rows re-render when the shared minute clock moves the Now marker.
const CafeRowSunGraph = memo(function CafeRowSunGraph({ sun }) {
    const now = useMinuteNow();
    return (
        <div className="ss-vlc-sun-graph">
            <SunWindowsGraph variant="mini" {...sun} {...rowSunAxis(sun)} now={now} />
        </div>
    );
});

const VenueListCard = memo(({ venue, isSelected, onVenueSelect, weather, stayMoment, compared, onCompare, compareFull, activeFilters, momentKeys, isHighlighted = false, onVenueHover, horizon = null, isNight = false, isRain = false, liveNote = null }) => {
    // Read from context: the list never passed this prop, so venues without a
    // microclimate profile showed no badge.
    const { calculateSunScore, unavailable: weatherUnavailableFlag, error: weatherError } = useWeather();
    // Server-side microclimate for this venue at the time-of-day slider's
    // position. Absent until the bbox fetch lands, and absent for venues with
    // no profile row, so every use below is guarded.
    const micro = useVenueMicroclimate(venue.id);
    const liveWeather = weatherUnavailableFlag || weatherError || weather?.unavailable || weather?.source === 'demo'
        ? null
        : weather;
    // Same sheltered feels-like and sun forecast as the venue card.
    const feelsLike = venueFeelsLike(venue, liveWeather);
    const sunForecast = useMemo(
        () => venueSunForecast({ venue, weather: liveWeather }),
        [venue, liveWeather],
    );
    const sunStatus = useMemo(() => listSunStatus(sunForecast), [sunForecast]);
    // Sun, wind and outdoor-space chips with pictures (utils/venueConditionChips).
    const chips = useMemo(
        () => venueConditionChips({ venue, forecast: sunForecast, weather: liveWeather }),
        [venue, sunForecast, liveWeather],
    );
    // Wheelchair, pram, dog and hidden-gem icons after the chips (utils/venueAmenities).
    const amenities = useMemo(() => keyAmenities(venue).slice(0, 3), [venue]);
    const momentMatch = matchedMomentLabel(momentKeys, activeFilters);
    // Cafés with a building horizon show today's sun from the same rounded day
    // as their detail card, in place of the open-sky "Now: sun" chip, which
    // could disagree with the building shade.
    const cafeHorizon = isCafeVenue(venue) ? horizon : null;
    const rowSun = useCafeRowSun({
        venueId: venue.id, lat: venue.lat, lng: venue.lng, horizon: cafeHorizon,
        timeZone: venue.timeZone ?? venue.timezone ?? undefined,
    });
    const cafeSun = Boolean(cafeHorizon) && rowSun !== ROW_SUN_FAILED;
    const cafeSunLine = cafeSun ? rowSunLine(rowSun) : null;
    const visibleChips = momentMatch || cafeSun ? chips.filter(chip => chip.key !== 'sun') : chips;
    const hover = (type) => (event) => {
        const wanted = type === 'focus' ? isKeyboardFocus(event.currentTarget) : isHoverPointer(event);
        if (wanted) onVenueHover?.(venue.id, 'enter');
    };
    const unhover = (type) => (event) => {
        if (type === 'blur' || isHoverPointer(event)) onVenueHover?.(venue.id, 'leave');
    };

    // Per-venue Sunstay Score — same RPC microclimate score as the map pin
    // and the detail sheet, so scrubbing TOD cannot show 84 on the card and
    // 4 on the marker. Venues with no profile row fall back to the direct-sun
    // calculateSunScore (sun height × cloud × exposure), not the comfort index.
    const sunstayScore = useMemo(() => {
        const profileScore = markerScoreFromMicroclimate(micro);
        if (profileScore != null) return profileScore;
        const raw = typeof calculateSunScore === 'function' ? calculateSunScore(venue) : null;
        return Number.isFinite(raw) ? Math.round(raw) : null;
    }, [micro, calculateSunScore, venue]);
    const badgeState = scoreDisplayState({ isNight, skyKind: isRain ? 'rain' : null });
    const scoreVisual = useMemo(
        () => (sunstayScore != null ? getSunstayScoreVisual(sunstayScore) : null),
        [sunstayScore]
    );

    const isStay = isStayVenue(venue);

    // `typeLabel` and `vibe` are both nullable in the venues table, so the
    // subtitle is joined from present parts only — never " · Fitzroy".
    const descriptor = venueTypeLabel(venue.typeLabel || (isPropertyVenue(venue) ? venue.typeCategory : venue.vibe));
    const suburbText = String(venue.suburb ?? '').trim();
    const subtitle = [descriptor, suburbText].filter(Boolean).join(' · ');

    return (
        <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
                onVenueSelect(venue);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.target === e.currentTarget && ['Enter', ' '].includes(e.key)) { e.preventDefault(); onVenueSelect(venue); } }}
            onPointerEnter={hover('pointer')}
            onPointerLeave={unhover('pointer')}
            onFocus={hover('focus')}
            onBlur={unhover('blur')}
            aria-label={`Venue: ${venue.venueName}.${subtitle ? ` ${subtitle}.` : ''}${liveNote ? ` ${liveNote}.` : ''} ${stayMoment && isStay ? stayMomentBadge(venue, stayMoment) : `${cafeSunLine ? `${cafeSunLine}, direct sun on a clear day. ` : ''}${momentMatch ? `${momentMatch.text}. ` : ''}${visibleChips.map(c => (c.kmh != null ? `${c.text}, ${c.kmh} km/h` : c.text)).join('. ') || (cafeSun ? '' : sunStatus.text)}`}.${sunstayScore != null && !(stayMoment && isStay) ? (badgeState === 'night' ? ' Sun score not shown after dark.' : badgeState === 'rain' ? ' Sun score not shown while it rains.' : ` Sun score ${sunstayScore} out of 100.`) : ''}${feelsLike != null && !(stayMoment && isStay) ? ` Feels like ${feelsLike} degrees.` : ''}${amenities.length ? ` ${amenities.map(a => a.label).join(', ')}.` : ''}`}
            className={`ss-venue-list-card ${!isStay ? 'ss-explore-row' : ''} ${stayMoment && isStay ? 'ss-venue-list-card--sun-moment' : ''} relative overflow-hidden ${isSelected ? 'ss-venue-list-card--active' : ''} ${isHighlighted ? 'ss-venue-list-card--paired' : ''}`}
            id={`venue-list-${venue.id}`}
        >
            {/* The clay icon, never the venue's photo: photos are full-size images
                hotlinked from venue and media sites (up to 600 KB each for a 64px
                square) and some aren't the venue's own. The card shows the photo. */}
            <div className="ss-vlc-icon" aria-hidden="true">
                <VenueIcon icon={venueIcon(venue)} size={isStay ? 36 : 48} />
            </div>
            <div className="ss-vlc-body">
                <div className="ss-vlc-name">{venue.venueName}</div>
                {subtitle ? <div className="ss-vlc-sub">{subtitle}</div> : null}
            </div>
            <div className="ss-vlc-right">
                {stayMoment && isStay && <button className="ss-stay-compare-toggle" aria-pressed={compared} disabled={!compared && compareFull} onClick={e => { e.stopPropagation(); onCompare(venue.id); }}>Compare</button>}
                {scoreVisual && !(stayMoment && isStay) && (badgeState !== 'score' ? (
                    // After dark every score is 0, and in rain it is near 0: both read like a bad venue.
                    <div className="ss-vlc-badge" style={{ background: '#e2e8f0', color: '#334155' }} title={badgeState === 'rain' ? 'Raining: no direct sun' : 'After dark'}>
                        <ClayIcon name={badgeState === 'rain' ? 'rain' : 'night'} size={18} />
                        <span>{badgeState === 'rain' ? 'Rain' : 'Night'}</span>
                    </div>
                ) : (
                    <div
                        className="ss-vlc-badge"
                        style={{ background: scoreVisual.color + '1f', color: scoreVisual.text }}
                        title={`Sun score: ${sunstayScore}/100`}
                    >
                        <ClayIcon name="sun" size={18} />
                        <span>{sunstayScore}</span>
                    </div>
                ))}
                {isStay && venue.nightlyPriceDemo ? (
                    <div className="ss-vlc-temp !bg-emerald-50 !text-emerald-700 !border-emerald-100 px-2 rounded-lg">
                        <span className="text-[9px] font-black uppercase tracking-tighter">Stay</span>
                    </div>
                ) : feelsLike != null && !(stayMoment && isStay) && (
                    <div className="ss-vlc-temp" title="Feels like">
                        <ClayIcon name={feelsLikeIconName(feelsLike)} size={16} />
                        <span>{feelsLike}°</span>
                    </div>
                )}
            </div>
            {cafeSun && (
                <div className="ss-vlc-sun" data-row-sun={rowSun ? 'ready' : 'pending'} aria-hidden="true">
                    {rowSun ? <CafeRowSunGraph sun={rowSun.sun} /> : <span className="ss-vlc-sun-graph ss-vlc-sun-graph--pending" />}
                    {rowSun ? <span className="ss-vlc-sun-text">{cafeSunLine}<small>At the venue point · clear day</small></span> : <span className="ss-vlc-sun-text ss-vlc-sun-text--pending" />}
                </div>
            )}
            {liveNote && <p className="ss-vlc-moment" aria-hidden="true"><ClayIcon name="fireplace" size={22} />{liveNote}</p>}
            {momentMatch && <p className="ss-vlc-moment" aria-hidden="true"><ClayIcon name={momentMatch.icon} size={22} />{momentMatch.text}</p>}
            {!(stayMoment && isStay) && visibleChips.length > 0 && (
                <ul className="ss-vlc-chips" aria-hidden="true">
                    {visibleChips.map(chip => (
                        <li key={chip.key} className={`ss-vlc-chip ss-vlc-chip--${chip.tone ?? chip.key}`}>
                            <ClayIcon name={chip.icon} size={18} />
                            <span>{chip.key === 'sun' || chip.key === 'wind' ? 'Now: ' : ''}{chip.text}</span>
                        </li>
                    ))}
                </ul>
            )}
            {stayMoment && isStay && <div className="ss-stay-badge-row"><p className={`ss-stay-badge ${venue.minutes ? '' : 'ss-stay-badge--empty'}`} title={stayMomentBadge(venue, stayMoment)}>{stayMomentBadge(venue, stayMoment).replace(' · Estimated', '')}</p>{isEstimatedRoom(venue.bestRoom) && <span>Estimated</span>}</div>}
            {amenities.length > 0 && <ul className="ss-vlc-amenities ss-vlc-amenities--row" aria-hidden="true">
                {amenities.map(a => <li key={a.key} title={a.label}><ClayIcon name={a.icon} size={18} /><span>{a.short}</span></li>)}
            </ul>}
        </motion.div>
    );
});
VenueListCard.displayName = 'VenueListCard';

const SafeAreaListFooter = () => (
    <div aria-hidden="true" style={{ height: 'calc(24px + env(safe-area-inset-bottom, 0px))' }} />
);

const VenueListFooter = ({ context }) => (
    <>
        {context?.showLoadMore ? (
            <div className="ss-load-more-venues-wrap">
                <button
                    type="button"
                    className="ss-load-more-venues"
                    onClick={context.onLoadMore}
                    aria-label="Load more venues"
                >
                    Load more venues
                </button>
            </div>
        ) : null}
        {context?.safeAreaFooter ? <SafeAreaListFooter /> : null}
    </>
);

const LiveVenueList = memo(function LiveVenueList({
    venues,
    selectedVenue,
    onVenueSelect,
    weather,
    empty,
    className,
    virtuosoRef,
    onPointerDownCapture,
    safeAreaFooter = false,
    showLoadMore = false,
    onLoadMore,
    stayMoment, comparedIds = [], onCompare,
    activeFilters, sunMomentsById,
    highlightedVenueId = null, onVenueHover, sunHorizons = null, isNight = false, isRain = false, liveVenueFeatures = null,
}) {
    if (venues.length === 0) {
        return (
            <div
                className={className}
                onPointerDownCapture={onPointerDownCapture}
                data-visible-venues={0}
                style={{ overscrollBehaviorY: 'contain' }}
            >
                {empty}
            </div>
        );
    }

    return (
            <div
                className={className}
                onPointerDownCapture={onPointerDownCapture}
                data-visible-venues={venues.length}
                style={{ overscrollBehaviorY: 'contain' }}
            >
            <Virtuoso
                ref={virtuosoRef}
                data={venues}
                computeItemKey={(_index, venue) => venue.id}
                isScrolling={setCafeRowSunScrolling}
                context={{ showLoadMore, onLoadMore, safeAreaFooter }}
                style={{ flex: 1, minHeight: 0, height: '100%', WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'contain' }}
                className="overscroll-contain"
                components={(showLoadMore || safeAreaFooter) ? { Footer: VenueListFooter } : {}}
                itemContent={(_index, venue) => (
                    <div className="pb-2">
                        <VenueListCard
                            venue={venue}
                            isSelected={selectedVenue?.id === venue.id}
                            onVenueSelect={onVenueSelect}
                            weather={weather}
                            stayMoment={stayMoment}
                            compared={comparedIds.includes(venue.id)}
                            compareFull={comparedIds.length >= 3}
                            onCompare={onCompare}
                            activeFilters={activeFilters}
                            momentKeys={sunMomentsById?.get(String(venue.id))}
                            isHighlighted={sameVenueId(highlightedVenueId, venue.id)}
                            onVenueHover={onVenueHover}
                            horizon={sunHorizons?.get(String(venue.id)) ?? null}
                            isNight={isNight}
                            isRain={isRain}
                            liveNote={liveWarmthNote(liveVenueFeatures?.[venue.id])}
                        />
                    </div>
                )}
            />
        </div>
    );
});
LiveVenueList.displayName = 'LiveVenueList';

// 3D icons for the quick filters (src/assets/clay/*.webp).
const QUICK_FILTER_ICONS = Object.freeze({ 'all-stays': 'hotel-views', 'all-homes': 'house' });

const SelectedFoodTypeChips = ({ activeFilters, onToggle }) => (
    <>
        {FOOD_TYPE_FILTERS.filter(filter => activeFilters.includes(filter.id)).map(filter => {
            const clayName = clayIconName(filter.id);
            return (
                <button key={filter.id} type="button" onClick={() => onToggle(filter.id)} aria-pressed={true}
                    className="ss-quick-chip ss-quick-chip--active">
                    <VenueIcon icon={clayName ? { name: clayName } : { emoji: filter.icon }} size={26} />
                    <span>{filter.label}</span>
                </button>
            );
        })}
    </>
);

const PropertyFilterPills = ({ activeFilters, onToggle }) => (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Venue types">
        {PROPERTY_FILTERS.map(filter => <button key={filter.id} type="button"
            onClick={() => onToggle(filter.id)} aria-pressed={activeFilters.includes(filter.id)}
            className={`flex-1 min-h-[44px] min-w-max inline-flex items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold ${activeFilters.includes(filter.id)
                ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}>
            <ClayIcon name={QUICK_FILTER_ICONS[filter.id]} size={24} /> {filter.label}
        </button>)}
        <SelectedFoodTypeChips activeFilters={activeFilters} onToggle={onToggle} />
    </div>
);

// One swipeable row of selected food types and quick filters: Stays, Homes,
// Sunny, Cozy, the sun moments (coffee, lunch, sunset) and Clear when
// anything is on. Each chip keeps a 44px touch target.
const QuickFilterChips = ({ activeFilters, onToggle, onClear, showClear }) => {
    const items = [
        ...PROPERTY_FILTERS.map(f => ({ id: f.id, label: f.label, icon: QUICK_FILTER_ICONS[f.id] })),
        { id: FILTER_SUNNY, label: 'Sunny now', icon: 'sun' },
        { id: FILTER_COZY, label: 'Cozy', icon: 'indoor-warmth' },
        ...SUN_MOMENT_FILTERS.map(f => ({ id: f.id, label: f.label, icon: f.icon })),
    ];
    return (
        <div className="ss-quick-chips" role="group" aria-label="Quick filters">
            <SelectedFoodTypeChips activeFilters={activeFilters} onToggle={onToggle} />
            {items.map(item => {
                const active = activeFilters.includes(item.id);
                return (
                    <button key={item.id} type="button" onClick={() => onToggle(item.id)} aria-pressed={active}
                        className={`ss-quick-chip ${active ? 'ss-quick-chip--active' : ''}`}>
                        <ClayIcon name={item.icon} size={26} />
                        <span>{item.label}</span>
                    </button>
                );
            })}
            {showClear ? (
                <button type="button" onClick={onClear} className="ss-quick-chip ss-quick-chip--clear">Clear</button>
            ) : null}
        </div>
    );
};

// ── VenueChip ──────────────────────────────────────────────────────────
const VenueChip = memo(({ venue, isSelected, onClick, weather }) => {
    const badge = useMemo(() => getWeatherBadge(weather, venue), [weather, venue]);
    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
                onClick(e);
            }}
            role="button"
            aria-label={`View ${venue.venueName}`}
            className={`ss-venue-chip relative overflow-hidden ${isSelected ? 'ss-venue-chip--active' : ''}`}
        >
            <span>{venue.emoji}</span>
            <span className="ss-venue-chip-name">{venue.venueName.length > 16 ? venue.venueName.slice(0, 15) + '…' : venue.venueName}</span>
            <span className="ss-venue-chip-badge" style={{ color: badge.color }}>{badge.emoji}</span>
        </motion.button>
    );
});
VenueChip.displayName = 'VenueChip';

// ═══════════════════════════════════════════════════════════════════════
const AppContent = () => {
    const [splashDone, setSplashDone] = useState(() => readHotelSunReportId(window.location.search) !== null || readVenueLinkId(window.location.search) !== null || hasSeenSplash());
    const { weather, loading: weatherLoading, calculateSunScore, previewMinutes } = useWeather();
    const { venues, refetch, isRefreshing, isLoading: venuesLoading, source: venueSource, error: venueError } = useVenues();
    // Let useVenues start its live lookup before declaring a shared ID missing.
    const [venueLookupStarted, setVenueLookupStarted] = useState(false);
    useEffect(() => { setVenueLookupStarted(true); }, []);
    const [reportId, setReportId] = useState(() => readHotelSunReportId(window.location.search));
    const reportVenue = useMemo(() => findHotelSunReportVenue(venues, reportId), [venues, reportId]);
    useEffect(() => {
        const syncReport = () => setReportId(readHotelSunReportId(window.location.search));
        window.addEventListener('popstate', syncReport);
        return () => window.removeEventListener('popstate', syncReport);
    }, []);
    const openSunReport = useCallback((venue) => {
        const id = String(venue.id);
        window.history.pushState({ ...window.history.state, hotelSunReportEntry: true }, '', hotelSunReportUrl(window.location.href, id));
        setReportId(id);
    }, []);
    const closeSunReport = useCallback(() => {
        if (window.history.state?.hotelSunReportEntry) {
            window.history.back();
            return;
        }
        window.history.replaceState(window.history.state, '', hotelSunReportUrl(window.location.href, null));
        setReportId(null);
    }, []);
    const pullRefreshRef = useRef(null);
    const [refreshStatus, setRefreshStatus] = useState('');
    const requestRefresh = useCallback(async () => {
        try {
            if (pullRefreshRef.current?.refresh) {
                return await pullRefreshRef.current.refresh();
            }
            setRefreshStatus(pullRefreshStatus('refreshing'));
            const result = await refetch();
            setRefreshStatus(pullRefreshStatus(result?.error ? 'error' : 'success'));
            return result;
        } catch (error) {
            setRefreshStatus(pullRefreshStatus('error'));
            return { ok: false, error };
        }
    }, [refetch]);
    const { liveVenueFeatures, updateLiveVenueFeature } = useVenueFeatures();
    const { setFallbackBbox } = useMicroclimateActions();

    // Seed the microclimate fetch with the whole map area, so the list has
    // readings before the map reports a viewport, and still has them if the
    // map never loads. The map can't leave MAX_BOUNDS and every venue fits in
    // one request (BBOX_ROW_LIMIT), so each viewport after this lies inside a
    // complete read and useVenuesInBbox skips it (utils/bboxCoverage.js).
    // Seeding from the venues' own outline instead cost 4–5 overlapping
    // downloads of the same ~1,060 rows on every cold load (22 Oct 2026). If
    // the area ever holds more rows than the limit, the read is incomplete and
    // viewports fetch as before.
    useEffect(() => {
        const [[minLng, minLat], [maxLng, maxLat]] = MAX_BOUNDS;
        setFallbackBbox({ minLng, minLat, maxLng, maxLat });
    }, [setFallbackBbox]);

    // Splash-screen readiness: weather is the remaining async dependency.
    // useVenues starts with demoVenues so the list is available immediately.
    const venuesReady = Array.isArray(venues) && venues.length > 0;
    const appReady = !weatherLoading && venuesReady;

    const comfort = useMemo(() => {
        if (!weather) return { label: 'Loading', icon: '☁️', cozy: false };
        return getComfortLevel({
            apparentTemp: weather.apparentTemp,
            precipProbability: weather.precipProbability,
            windKmh: weather.windKmh
        });
    }, [weather]);

    const [selectedVenue, setSelectedVenue]           = useState(null);
    const [previewVenue, setPreviewVenue]             = useState(null);
    // List ↔ map pairing: the venue whose row or pin the pointer is over.
    const [highlightedVenueId, setHighlightedVenueId] = useState(null);
    const handleVenueHover = useCallback((venueId, type) => {
        setHighlightedVenueId((current) => nextHighlightedVenueId(current, { type, venueId }));
    }, []);
    const mapPreviewPointer = useRef(null);
    const [isChatOpen, setIsChatOpen]                 = useState(false);
    // "Centre on map" hides the venue card but keeps the venue selected, so
    // its pin stays highlighted; tapping the pin brings the card back.
    const [venueCardLowered, setVenueCardLowered]     = useState(false);
    // ── UNIFIED filter state: single source of truth ─────────────────
    // 'cozy-mode' replaces the old activeFilter === 'Cozy'
    // 'sunny-mode' replaces the old activeFilter === 'Sunny'
    // All other tag IDs (from FILTER_CATEGORIES) are also held here.
    const [activeFilters, setActiveFilters]           = useState([]);
    const [showOwnerDashboard, setShowOwnerDashboard] = useState(false);

    // NOTE: The old `activeFilter` string state ('All' | 'Cozy' | 'Sunny') has
    // been retired. Use activeFilters.includes(FILTER_COZY) and
    // activeFilters.includes(FILTER_SUNNY) instead throughout this file.

    const [customFilters, setCustomFilters] = useState(
        () => readJsonArray('sunstay-custom-filters')
    );
    const [newFilter, setNewFilter] = useState('');

    const addCustomFilter = useCallback(() => {
        if (!newFilter.trim()) return;
        const updated = [...customFilters, newFilter.trim()];
        setCustomFilters(updated);
        writeJson('sunstay-custom-filters', updated);
        setNewFilter('');
    }, [customFilters, newFilter]);

    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize, { passive: true });
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
    const [mobileSheetState, setMobileSheetState]   = useState('peek');
    const [sheetDragging, setSheetDragging]         = useState(false);
    const [venueSheetDragging, setVenueSheetDragging] = useState(false);
    const [mobileFilterOpen, setMobileFilterOpen]   = useState(false);
    const [searchQuery, setSearchQuery]             = useState('');
    // Immediate input; filter/score/GeoJSON/fitBounds wait until typing settles.
    const settledSearchQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
    // Search by name, type, suburb or postcode ("South Yarra", "3141", "CBD").
    const parsedQuery = useMemo(() => parseSearchQuery(settledSearchQuery), [settledSearchQuery]);
    const searchTextMatches = useMemo(
        () => (parsedQuery.raw ? venues.filter(v => venueMatchesSearch(v, parsedQuery, venueTypeLabel)).length : 0),
        [venues, parsedQuery]
    );
    // A place we have no venues in yet ("Brighton", "3186") is looked up with
    // Mapbox and answered with the venues nearest to it.
    const [searchPlace, setSearchPlace] = useState(null);
    const placeForQuery = searchPlace && searchPlace.query === parsedQuery.raw ? searchPlace : null;
    useEffect(() => {
        if (placeForQuery || !needsPlaceLookup(parsedQuery, searchTextMatches)) return undefined;
        if (!MAPBOX_TOKEN.startsWith('pk.')) return undefined;
        const controller = new AbortController();
        const query = parsedQuery.raw;
        fetch(placeLookupUrl(query, MAPBOX_TOKEN), { signal: controller.signal })
            .then(res => (res.ok ? res.json() : null))
            .then(json => {
                const place = parsePlaceResponse(json);
                if (place) setSearchPlace({ ...place, query });
            })
            .catch(() => {});
        return () => controller.abort();
    }, [parsedQuery, searchTextMatches, placeForQuery]);
    const nearPlace = useMemo(
        () => (placeForQuery ? venuesNearPlace(venues, placeForQuery) : null),
        [venues, placeForQuery]
    );
    const [isLocating, setIsLocating]               = useState(false);
    const [locateHint, setLocateHint]               = useState(null);
    const [eventCamera, setEventCamera]             = useState(null);
    const [locatedPoint, setLocatedPoint]           = useState(null);

    const mapRef  = useRef(null);
    const sidebarVirtuosoRef = useRef(null);
    const mobileVirtuosoRef = useRef(null);

    const openMobileFilters  = useCallback((e) => { e?.stopPropagation(); setPreviewVenue(null); setMobileFilterOpen(true); }, []);
    const closeMobileFilters = useCallback((e) => { e?.preventDefault(); e?.stopPropagation(); setMobileFilterOpen(false); }, []);
    const stopSheetPointer   = useCallback((e) => { e.stopPropagation(); }, []);

    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        // fetchOpenMeteoWeather() (src/utils/weatherService.js) does not return
        // top-level `minTemp`/`windSpeed` fields — read the actual nested shape:
        // today's low lives at daily.temperature_2m_min[0] (°C), and wind speed
        // lives at wind.speed (m/s), converted here to km/h for the threshold.
        const minTemp = weather.daily?.temperature_2m_min?.[0];
        const precipitation = weather.precipitation;
        if (minTemp == null || precipitation == null) return false;
        const windSpeedKmh = (weather.wind?.speed ?? 0) * 3.6;
        return minTemp < 8 || precipitation > 0.5 || windSpeedKmh > 15;
    }, [weather]);

    // Derived booleans from the unified array — used by VenueMap & filteredVenues
    const cozyFilterActive  = activeFilters.includes(FILTER_COZY);
    const sunnyFilterActive = activeFilters.includes(FILTER_SUNNY);

    // The Sunny filter reads each venue's own sun at the slider time, plus the
    // Melbourne hourly forecast for that hour (the same one the Sun Forecast
    // tab uses). UV is safety info only.
    const { byId: microById, todMinutes: listTodMinutes } = useMicroclimateState();
    const [homeModeChoice, setHomeModeChoice] = useState(() => {
        try { return sessionStorage.getItem('ss-home-sheet-mode'); } catch { return null; }
    });
    const homeNow = useMinuteNow();
    // Tonight follows the real Melbourne clock, independently of map preview time.
    const homeIsNight = useMemo(() => isNightAt(venueSunForecast({
        venue: { lat: -37.8136, lng: 144.9631, timeZone: DEFAULT_TIME_ZONE }, weather, now: new Date(homeNow),
    })), [weather, homeNow]);
    const homeMode = resolveAfterDarkMode(homeModeChoice, homeIsNight);
    const eventOrigin = useMemo(() => afterDarkOrigin(eventCamera, locatedPoint), [eventCamera, locatedPoint]);
    const rememberHomeMode = (mode) => {
        setHomeModeChoice(mode);
        try { sessionStorage.setItem('ss-home-sheet-mode', mode); } catch { /* Session choice still works in memory. */ }
    };
    const handleHomeMode = (mode) => {
        rememberHomeMode(mode);
        setPreviewVenue(null);
        if (isMobile && mode === 'after-dark') {
            setMobileSheetState('expanded');
            requestAnimationFrame(() => document.querySelector('.ss-mobile-sheet .ss-home-sheet-mode button[aria-pressed=true]')?.focus({ preventScroll: true }));
        }
    };
    const sunnyForecastKind = useMemo(() => {
        if (!sunnyFilterActive) return null;
        const sun = getSunData(-37.8136, 144.9631);
        return forecastKindAt(deriveSunForecast({
            timeZone: DEFAULT_TIME_ZONE,
            hourly: weather?.hourly,
            utcOffsetSeconds: weather?.utcOffsetSeconds,
            sunrise: sun?.sunriseDate,
            sunset: sun?.sunsetDate,
        }), listTodMinutes);
    }, [sunnyFilterActive, weather?.hourly, weather?.utcOffsetSeconds, listTodMinutes]);
    // Sun down at the list's time (Melbourne CBD sunrise and sunset), shared by
    // the sheet line, list badges and map pins so they always agree. Sunrise and
    // sunset come from the sun's position, so this works without live weather.
    const cityNight = useMemo(() => isNightAt(
        venueSunForecast({ venue: { lat: -37.8136, lng: 144.9631, timeZone: DEFAULT_TIME_ZONE }, weather }),
        listTodMinutes,
    ), [weather, listTodMinutes]);
    // Rain at the list's time (Melbourne CBD forecast): list badges say "Rain",
    // not a near-zero sun score. Only real forecasts, never demo weather.
    const cityRain = useMemo(() => {
        if (!weather || weather.source === 'demo' || weather.unavailable || weather.error) return false;
        return forecastKindAt(venueSunForecast({ venue: { lat: -37.8136, lng: 144.9631, timeZone: DEFAULT_TIME_ZONE }, weather }), listTodMinutes) === 'rain';
    }, [weather, listTodMinutes]);

    // Sun-moment chips (and Sunny's chat): which venues get sun today in
    // each moment, from their stored building horizon and today's Melbourne
    // forecast. Computed only while a chip is on or the chat is open.
    const sunHorizons = useSunHorizons(venues);
    const wantedSunMoments = useMemo(() => activeSunMoments(activeFilters), [activeFilters]);
    const needSunMoments = wantedSunMoments.length > 0 || isChatOpen;
    // Turning the last chip off drops the result; keep it so switching a chip
    // back on the same day, with the same venues and weather, is instant.
    const sunMomentsMemoRef = useRef(null);
    const sunMomentsById = useMemo(() => {
        if (!needSunMoments) return null;
        const inputs = { venues, horizons: sunHorizons, weather, day: venueLocalDate(new Date()) };
        const previous = sunMomentsMemoRef.current;
        if (previous && sameSunMomentInputs(previous.inputs, inputs)) return previous.value;
        const value = sunMomentsByVenue(venues, sunHorizons, { forecast: sunMomentForecast(weather) });
        sunMomentsMemoRef.current = { inputs, value };
        return value;
    }, [needSunMoments, venues, sunHorizons, weather]);

    // Work the chips' answer out ahead of time, in small slices while the
    // phone is idle, so the first chip tap reads a ready result instead of
    // calculating sun for every venue at once. Restarts when the venues,
    // horizons or weather change; stops while a chip or the chat needs the
    // answer now (the memo above then calculates it directly).
    useEffect(() => {
        if (needSunMoments || !Array.isArray(venues) || venues.length === 0 || sunHorizons.size === 0) return undefined;
        const inputs = { venues, horizons: sunHorizons, weather, day: venueLocalDate(new Date()) };
        if (sameSunMomentInputs(sunMomentsMemoRef.current?.inputs, inputs)) return undefined;
        const job = createSunMomentsJob(venues, sunHorizons, { forecast: sunMomentForecast(weather) });
        return runWhenIdle(job, {
            onDone: (value) => {
                if (!sameSunMomentInputs(sunMomentsMemoRef.current?.inputs, inputs)) sunMomentsMemoRef.current = { inputs, value };
            },
        });
    }, [needSunMoments, venues, sunHorizons, weather]);

    // ── Unified venue filtering ────────────────────────────────────────
    // One pass feeds the map pins, sidebar list, mobile sheet, and counts.
    const filteredVenues = useMemo(() => {
        const filters = activeFilters || [];
        const typeFilters = filters.filter(f => f.startsWith('all-') && !isFoodTypeFilter(f));
        const foodFilters = filters.filter(isFoodTypeFilter);
        const intentFilters = filters.filter(f => f.startsWith('sun-'));
        const tagFilters = filters.filter(f =>
            !f.startsWith('all-') &&
            !f.startsWith('sun-') &&
            f !== FILTER_COZY &&
            f !== FILTER_SUNNY &&
            !isSunMomentFilter(f)
        );
        return venues.filter(venue => {
            if (!matchesPropertyTypeFilters(venue, typeFilters)) return false;
            if (!matchesFoodTypeFilters(venue, foodFilters)) return false;

            if (intentFilters.length > 0) {
                const rooms = venue.roomTypes || [];
                const hasRoomMatch = rooms.some(room => intentFilters.some(intentId => {
                    if (intentId === 'sun-morning')   return room.sunProfile?.useCase === 'Morning coffee' && (room.hasBalcony || room.hasOutdoorArea);
                    if (intentId === 'sun-sunset')    return room.sunProfile?.useCase === 'Sunset drinks' && (room.hasBalcony || room.hasOutdoorArea);
                    if (intentId === 'sun-allday')    return room.sunScore >= 70 && (room.sunProfile?.summerHours >= 6 || room.sunProfile?.winterHours >= 4) && ['N','NE','NW'].includes(room.orientation);
                    if (intentId === 'sun-shaded')    return room.sunProfile?.useCase === 'Shade retreat' || room.sunScore <= 40;
                    if (intentId === 'sun-highfloor') return (room.floorLevel || 0) >= 8 && room.obstructionLevel === 'Open' && room.hasBalcony;
                    return false;
                }));
                if (!hasRoomMatch) return false;
            }

            if (!matchesTagFilters(venue, tagFilters, venueMatchesWeatherTag)) return false;

            if (cozyFilterActive) {
                const liveState = liveVenueFeatures[venue.id] || EMPTY_LIVE_FEATURES;
                const hasLiveCozy = liveState.fireplaceOn || liveState.heatersOn || liveState.roofClosed;
                const hasStaticCozy =
                    (venue.shielding?.rainCover ?? 0) > 80 ||
                    venue.tags?.some(t => ['cozy', 'covered', 'indoor'].includes(String(t).toLowerCase())) ||
                    venue.hasCozy;
                if (!hasLiveCozy && !hasStaticCozy) return false;
            }

            if (sunnyFilterActive) {
                const liveState = liveVenueFeatures[venue.id] || EMPTY_LIVE_FEATURES;
                const entry = lookupMicroclimateEntry(microById, venue.id);
                const reading = entry ? readMicroclimate(entry, listTodMinutes) : null;
                if (!isVenueInDirectSun({ reading, forecastKind: sunnyForecastKind, roofClosed: liveState.roofClosed })) {
                    return false;
                }
            }

            if (wantedSunMoments.length > 0
                && !venueMatchesSunMoments(sunMomentsById?.get(String(venue.id)), wantedSunMoments)) return false;

            if (nearPlace) {
                if (!nearPlace.ids.has(String(venue.id))) return false;
            } else if (!venueMatchesSearch(venue, parsedQuery, venueTypeLabel)) return false;

            return true;
        });
    }, [venues, activeFilters, cozyFilterActive, sunnyFilterActive, liveVenueFeatures, parsedQuery, nearPlace, microById, listTodMinutes, sunnyForecastKind, wantedSunMoments, sunMomentsById]);

    // "Search this area" narrows only the list to the map area the user
    // searched. Pins, filter fitBounds and the microclimate fetch still use
    // every filtered venue. A new filter or search starts from all venues.
    const [areaBounds, setAreaBounds] = useState(null);
    useEffect(() => { setAreaBounds(null); }, [activeFilters, settledSearchQuery]);
    const handleShowAllAreas = useCallback(() => setAreaBounds(null), []);
    const listVenues = useMemo(
        () => (areaBounds ? filteredVenues.filter((venue) => venueInBounds(venue, areaBounds)) : filteredVenues),
        [filteredVenues, areaBounds]
    );
    const areaEmpty = !!areaBounds && listVenues.length === 0 && filteredVenues.length > 0;

    // Filter first, then rank by the same score each card's badge shows:
    // cached microclimate at the slider minute, else the direct-sun score.
    const staysActive = activeFilters.includes('all-stays');
    const [stayMoment, setStayMoment] = useState('coffee');
    const [stayDate, setStayDate] = useState(null);
    const [comparedIds, setComparedIds] = useState([]);
    const [compareOpen, setCompareOpen] = useState(false);
    const compareTriggerRef = useRef(null);
    const closeStayComparison = useCallback(() => setCompareOpen(false), []);
    const toggleCompare = useCallback(id => setComparedIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : ids.length < 3 ? [...ids, id] : ids), []);
    const rankedStays = useMemo(() => staysActive ? listVenues.flatMap(venue => rankStays([venue], { moment: stayMoment, date: /^\d{4}-/.test(stayDate ?? '') ? stayDate : quickStayDate(stayDate || 'today', new Date(), venue.timeZone ?? venue.timezone ?? 'Australia/Melbourne') })).sort(compareStayRank) : [], [staysActive, listVenues, stayMoment, stayDate]);
    const comparisonVenues = useMemo(() => rankedStays.filter(v => comparedIds.includes(v.id)), [rankedStays, comparedIds]);
    const stayPicker = staysActive ? <StaySunPicker moment={stayMoment} date={stayDate} onMoment={setStayMoment} onDate={setStayDate} compareCount={comparisonVenues.length} onCompare={event => { compareTriggerRef.current = event.currentTarget; setCompareOpen(true); }} /> : null;
    // Wet, cold or windy right now: venues with declared warmth or shelter lead,
    // sun order within each tier. Fine weather, Stays and an explicit Sunny
    // filter keep the pure sun order.
    const homeCondition = useMemo(() => homeConditions(weather), [weather]);
    const listCondition = staysActive || sunnyFilterActive ? null : homeCondition;
    const sortedVenues = useMemo(
        () => staysActive ? includeNonStayResults(listVenues, rankedStays) : rankForConditions(sortVenuesBySunstayScore(listVenues, (venue) => venueDisplayScore(venue, {
            byId: microById,
            todMinutes: listTodMinutes,
            calculateSunScore,
        })), listCondition),
        [staysActive, rankedStays, listVenues, calculateSunScore, previewMinutes, microById, listTodMinutes, listCondition]
    );
    const resultIdentity = useMemo(() => venueResultIdentity(sortedVenues), [sortedVenues]);
    const [visibleVenueCount, setVisibleVenueCount] = useState(INITIAL_VISIBLE_VENUES);
    const [windowIdentity, setWindowIdentity] = useState(resultIdentity);
    if (windowIdentity !== resultIdentity) {
        setWindowIdentity(resultIdentity);
        setVisibleVenueCount(INITIAL_VISIBLE_VENUES);
    }
    const renderedVenues = useMemo(
        () => sortedVenues.slice(0, visibleVenueCount),
        [sortedVenues, visibleVenueCount],
    );
    const hasMoreVenues = visibleVenueCount < sortedVenues.length;
    const handleLoadMoreVenues = useCallback(() => {
        setVisibleVenueCount((count) => count + VENUES_PER_LOAD);
    }, []);

    const filteredVenueIds = useMemo(
        () => filteredVenues.map(venue => venue.id),
        [filteredVenues]
    );

    // --- DEV DIAGNOSTICS ---
    useEffect(() => {
        if (!import.meta.env.DEV) return;

        console.log("=== VENUE PIPELINE DIAGNOSTICS ===");
        console.log(`1. Active venues count: ${venues.length}`);

        const rawIds = venues.map(v => v.id);
        const uniqueIds = new Set(rawIds);
        console.log(`2. Unique IDs in venues: ${uniqueIds.size}`);

        // Find duplicates
        const duplicates = rawIds.filter((item, index) => rawIds.indexOf(item) !== index);
        if (duplicates.length > 0) console.log(`   Duplicate IDs found:`, duplicates);

        // Find invalid coordinates
        const invalidCoords = venues.filter(v => {
            const lat = Number(v.lat);
            const lng = Number(v.lng);
            return isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180;
        }).map(v => v.id);
        if (invalidCoords.length > 0) console.log(`   Invalid coordinate IDs:`, invalidCoords);

        console.log(`3. Active Filters:`, activeFilters);
        console.log(`4. filteredVenueIds count: ${filteredVenueIds.length}`);
        console.log(`5. Final filteredVenues count (list render): ${filteredVenues.length}`);

        const removedByFilters = venues.filter(v => !filteredVenues.includes(v));
        console.log(`   Removed by filters count: ${removedByFilters.length}`);
        if (removedByFilters.length > 0) {
            console.log(`   IDs removed:`, removedByFilters.map(v => v.id));
        }
        console.log("==================================");
    }, [venues, filteredVenues, filteredVenueIds, activeFilters]);
    // --- END DIAGNOSTICS ---

    const matchingCount = listVenues.length;
    const homeSummary = useMemo(() => mapHomeSummary(listVenues.map(venue => venueDisplayScore(venue, {
        byId: microById, todMinutes: listTodMinutes, calculateSunScore,
    }))), [listVenues, microById, listTodMinutes, calculateSunScore]);
    // A wet, cold or windy day says so (with the count of declared comfy
    // venues) instead of "0 in full sun".
    const conditionClause = useMemo(() => conditionsClause(listVenues, listCondition), [listVenues, listCondition]);
    const comfortSort = useMemo(() => comfortSortLabel(listVenues, listCondition), [listVenues, listCondition]);
    const homeClause = conditionClause ?? homeSunClause(homeSummary, cityNight ? 'night' : null);
    const peekDragged = useRef(false);
    const showAllChip = (className) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleShowAllAreas(); }}
            className={`inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-amber-700 underline-offset-2 hover:underline touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${className}`}
        >
            Show all
        </button>
    );
    const homesEmpty = useMemo(() => homesEmptyState({ venues, filters: activeFilters, loading: venuesLoading }), [venues, activeFilters, venuesLoading]);
    const listEmptyState = areaEmpty ? (
        <EmptyVenueState
            announce
            onClearFilters={handleShowAllAreas}
            title="Nothing in this part of the map"
            message="No venues match here. Zoom out and search again, or see every venue."
            actionLabel="Show all venues"
        />
    ) : listVenues.length === 0 ? (
        <EmptyVenueState {...homesEmpty} announce onClearFilters={() => handleClearFilters()} />
    ) : null;
    const stableFilteredIds = filteredVenueIds;
    // The map refits to the results only when this changes (see utils/filterRefit).
    // A looked-up place counts as a new search, so the map flies to it.
    const mapFilterKey = useMemo(
        () => filterChoiceKey(activeFilters, placeForQuery ? `${settledSearchQuery}@${placeForQuery.lat},${placeForQuery.lng}` : settledSearchQuery),
        [activeFilters, settledSearchQuery, placeForQuery]
    );

    useEffect(() => { setPreviewVenue(null); }, [mapFilterKey]);

    const handlePinSelect = useCallback((venue) => {
        if (!venue) return;
        pullRefreshRef.current?.reset?.();
        setSelectedVenue(null);
        setVenueCardLowered(false);
        setPreviewVenue(venue);
        setMobileSheetState('peek');
    }, []);
    const closePreview = useCallback(() => setPreviewVenue(null), []);
    // Observe canvas gestures in the UI wrapper; Mapbox keeps all of its own
    // pointer handling, marker sync, camera and recovery behavior unchanged.
    const startPreviewMapGesture = useCallback((event) => {
        if (!event.target.closest('.mapboxgl-canvas')) return;
        mapPreviewPointer.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }, []);
    const movePreviewMapGesture = useCallback((event) => {
        if (isPreviewMapDrag(mapPreviewPointer.current, { pointerId: event.pointerId, x: event.clientX, y: event.clientY })) {
            setPreviewVenue(null);
            mapPreviewPointer.current = null;
        }
    }, []);
    const endPreviewMapGesture = useCallback(() => { mapPreviewPointer.current = null; }, []);

    const handleVenueSelect = useCallback((venue) => {
        if (!venue) return;
        pullRefreshRef.current?.reset?.();
        setPreviewVenue(null);
        setSelectedVenue(venue);
        setVenueCardLowered(false);
        setMobileSheetState('peek');
    }, []);

    const handleCloseCard  = useCallback(() => {
        pullRefreshRef.current?.reset?.();
        setSelectedVenue(null);
        setVenueCardLowered(false);
        setVenueSheetDragging(false);
    }, []);

    // Shareable venue links (?venue=<id>, utils/venueLink.js): a link opens
    // that card once the live venue list is in; the address bar follows the
    // open card, and the phone's back gesture closes it.
    const [linkVenueId, setLinkVenueId] = useState(() => readVenueLinkId(window.location.search));
    const venueLink = useMemo(
        () => resolveVenueLink({ id: linkVenueId, venues, loading: venuesLoading, lookupStarted: venueLookupStarted }),
        [linkVenueId, venues, venuesLoading, venueLookupStarted],
    );
    useEffect(() => {
        if (venueLink.status === 'found') {
            handleVenueSelect(venueLink.venue);
            setLinkVenueId(null);
        } else if (venueLink.status === 'missing') {
            window.history.replaceState(window.history.state, '', venueLinkUrl(window.location.href, null));
            setLinkVenueId(null);
        }
    }, [venueLink, handleVenueSelect]);
    const selectedVenueId = selectedVenue?.id ?? null;
    useEffect(() => {
        if (linkVenueId) return; // a shared link is still opening; keep its ?venue
        const change = venueUrlChange({
            href: window.location.href,
            openId: selectedVenueId,
            cardEntry: Boolean(window.history.state?.venueCardEntry),
        });
        if (!change) return;
        if (change.action === 'push') window.history.pushState({ ...window.history.state, venueCardEntry: true }, '', change.url);
        else if (change.action === 'replace') window.history.replaceState(window.history.state, '', change.url);
        else window.history.back();
    }, [selectedVenueId, linkVenueId]);
    const venuesRef = useRef(venues);
    useEffect(() => { venuesRef.current = venues; }, [venues]);
    useEffect(() => {
        const syncCardFromUrl = () => {
            const id = readVenueLinkId(window.location.search);
            if (!id) {
                setSelectedVenue(null);
                setVenueCardLowered(false);
                setVenueSheetDragging(false);
                return;
            }
            setSelectedVenue(prev => (prev && String(prev.id) === id)
                ? prev
                : venuesRef.current.find(v => String(v.id) === id) ?? prev);
        };
        window.addEventListener('popstate', syncCardFromUrl);
        return () => window.removeEventListener('popstate', syncCardFromUrl);
    }, []);

    const handleCenterOnMap = useCallback((venue) => {
        const lng = Number(venue?.lng ?? venue?.longitude);
        const lat = Number(venue?.lat ?? venue?.latitude);
        setVenueCardLowered(true);
        setVenueSheetDragging(false);
        if (Number.isFinite(lng) && Number.isFinite(lat)) mapRef.current?.resizeAndFly?.([lng, lat]);
    }, []);
    const toggleChat       = useCallback(() => { setPreviewVenue(null); setIsChatOpen(p => !p); }, []);
    const closeChat        = useCallback(() => setIsChatOpen(false), []);
    const handleOwnerDashboardClose = useCallback(() => setShowOwnerDashboard(false), []);
    const handleSelectedVenueUpdate = useCallback((updated) => {
        setSelectedVenue(prev => prev ? { ...prev, ...updated } : updated);
    }, []);

    const handleFilterToggle = useCallback((tag) => {
        setActiveFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
        setSelectedVenue(null);
    }, []);

    const handleClearFilters = useCallback(() => {
        setActiveFilters([]);
        setSearchQuery('');
        setAreaBounds(null);
    }, []);

    const handleExperienceSelect = (id) => {
        const next = selectExperience(activeFilters, id);
        setActiveFilters(next.filters);
        if (next.moment) setStayMoment(next.moment);
        setPreviewVenue(null);
        setSelectedVenue(null);
        if (isMobile) setMobileSheetState('expanded');
        requestAnimationFrame(() => document.getElementById(isMobile ? 'mobile-discovery-results' : 'desktop-discovery-results')?.focus({ preventScroll: true }));
    };
    const experienceContext = discoveryContext({ filters: activeFilters, moment: stayMoment, date: stayDate, todMinutes: listTodMinutes });
    const dataLabel = discoveryDataLabel({ source: venueSource, loading: venuesLoading, error: venueError, weather, weatherLoading });

    // The chat stays open: Sunny shows matching venues as cards to tap.
    const makeChatFilter = (filter) => () => {
        setActiveFilters([filter]);
        setSelectedVenue(null);
    };
    const handleFindWheelchair    = useCallback(makeChatFilter('Wheelchair Accessible'), []);
    const handleFindDogFriendly   = useCallback(makeChatFilter('Pet Friendly'), []);
    const handleFindSmoking       = useCallback(makeChatFilter('Smoking Area'), []);
    const handleFindFamily        = useCallback(makeChatFilter('Pram Friendly'), []);
    const handleFindBusiness      = useCallback(makeChatFilter('Large Groups'), []);
    const handleFindSunny         = useCallback(makeChatFilter(FILTER_SUNNY), []);
    const handleFindRooftop       = useCallback(makeChatFilter('Rooftop'), []);
    const handleFindIndoor        = useCallback(makeChatFilter('Indoor Warmth'), []);
    const handleFindWindSheltered = useCallback(makeChatFilter('Shaded'), []);

    const handleSurpriseMe = useCallback(() => {
        const randomVenue = venues[Math.floor(Math.random() * venues.length)];
        setActiveFilters([]);
        handleVenueSelect(randomVenue);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, [handleVenueSelect, venues]);

    // Chat "Show on map": keep the filters, close the chat and frame the
    // current results on the map.
    const handleShowOnMap = useCallback(() => {
        setSelectedVenue(null);
        setVenueCardLowered(false);
        setMobileSheetState('peek');
        setIsChatOpen(false);
        mapRef.current?.fitVenues?.(filteredVenues);
    }, [filteredVenues]);

    const handleSunnySetFilters = useCallback((tags) => {
        setActiveFilters(Array.isArray(tags) ? tags : []);
    }, []);

    // A venue card in the chat: open the venue and close the chat.
    const handleChatOpenVenue = useCallback((venue) => {
        if (!venue) return;
        handleVenueSelect(venue);
        setIsChatOpen(false);
    }, [handleVenueSelect]);

    const handleRecenter = useCallback(() => {
        mapRef.current?.flyTo({ center: [144.9631, -37.8136], zoom: 12, duration: 1200 });
    }, []);

    const handleLocateMe = useCallback(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            console.warn('[Sunstay] Geolocation is not available');
            setLocateHint('Location unavailable');
            return;
        }
        setIsLocating(true);
        setLocateHint(null);
        try {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setIsLocating(false);
                    const lng = Number(pos?.coords?.longitude);
                    const lat = Number(pos?.coords?.latitude);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
                        console.warn('[Sunstay] Locate Me returned invalid coordinates');
                        setLocateHint('Could not find you');
                        return;
                    }
                    const [[minLng, minLat], [maxLng, maxLat]] = MAX_BOUNDS;
                    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
                        // SunStay covers greater Melbourne; the map can't pan outside it.
                        setLocateHint('Showing Melbourne');
                        handleRecenter();
                        return;
                    }
                    setLocatedPoint({ lat, lng });
                    try {
                        if (mapRef.current?.locateUser) {
                            mapRef.current.locateUser({ lng, lat, zoom: 14 });
                        } else {
                            mapRef.current?.flyTo?.({ center: [lng, lat], zoom: 14, duration: 1100 });
                        }
                    } catch (flyErr) {
                        console.warn('[Sunstay] Locate Me fly failed:', flyErr?.message);
                    }
                },
                (err) => {
                    setIsLocating(false);
                    const denied = err?.code === 1;
                    setLocateHint(denied ? 'Location off · showing Melbourne' : 'Could not find you · showing Melbourne');
                    handleRecenter();
                    console.warn('[Sunstay] Locate Me failed:', err?.message || err);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
            );
        } catch (e) {
            setIsLocating(false);
            setLocateHint('Could not find you · showing Melbourne');
            handleRecenter();
            console.warn('[Sunstay] Locate Me error:', e?.message);
        }
    }, [handleRecenter]);

    useEffect(() => {
        if (!locateHint) return undefined;
        const t = setTimeout(() => setLocateHint(null), 2800);
        return () => clearTimeout(t);
    }, [locateHint]);

    const renderedVenuesRef = useRef(renderedVenues);
    renderedVenuesRef.current = renderedVenues;
    // The list follows the venue the map shows as selected: a tapped pin's
    // preview or the open venue card. It scrolls to that row and marks it.
    const pairedVenue = previewVenue ?? selectedVenue;
    const pairedVenueId = pairedVenue?.id ?? null;
    useEffect(() => {
        if (pairedVenueId == null) return undefined;
        const index = renderedVenuesRef.current.findIndex((v) => v.id === pairedVenueId);
        if (index < 0) return undefined;
        sidebarVirtuosoRef.current?.scrollIntoView?.({ index, behavior: 'smooth' });
        mobileVirtuosoRef.current?.scrollIntoView?.({ index, behavior: 'smooth' });
        return undefined;
    }, [pairedVenueId]);

    const selectedLiveFeatureState = selectedVenue?.id ? liveVenueFeatures?.[selectedVenue.id] : null;
    const selectedVenueLiveFeatures = useMemo(() => {
        if (!selectedVenue?.id || !selectedLiveFeatureState) return EMPTY_LIVE_FEATURES;
        return { [selectedVenue.id]: selectedLiveFeatureState };
    }, [selectedVenue?.id, selectedLiveFeatureState]);

    const selectedVenueSunData = useMemo(() =>
        selectedVenue?.lat && selectedVenue?.lng
            ? getSunData(selectedVenue.lat, selectedVenue.lng, { timeZone: selectedVenue.timeZone ?? selectedVenue.timezone ?? DEFAULT_TIME_ZONE })
            : null,
        [selectedVenue?.lat, selectedVenue?.lng, selectedVenue?.timeZone, selectedVenue?.timezone]
    );

    const selectedVenueScore = weather?.score ?? weather?.rawWeather?.score ?? 70;

    const sheetDrag = sheetDragCompositing({ dragging: sheetDragging });
    // The list, Sunny and the footer hide while the venue card is showing,
    // not while a venue is merely selected on the map.
    const venueCardOpen = Boolean(selectedVenue) && !venueCardLowered;
    const sheetExpanded = mobileSheetState === 'expanded' && !venueCardOpen;
    useEffect(() => {
        if (!selectedVenue) setVenueSheetDragging(false);
    }, [selectedVenue]);
    const sheetClassName = `ss-mobile-sheet ${homeMode === 'after-dark' ? 'ss-mobile-sheet--after-dark' : ''} ${homeMode === 'sun' && filteredVenues.length === 0 ? 'ss-mobile-sheet--empty' : ''} ${sheetDrag.className}`.trim();
    useEffect(() => {
        if (!sheetExpanded) setSheetDragging(false);
    }, [sheetExpanded]);
    const sheetMotionProps = {
            drag: 'y',
            dragConstraints: { top: 0, bottom: 0 },
            dragElastic: 0.1,
            onDragStart: () => setSheetDragging(true),
            onDragEnd: (_, { offset, velocity }) => {
                setSheetDragging(false);
                if (offset.y > 100 || velocity.y > 500) setMobileSheetState('peek');
            },
            initial: { y: '100%' },
            animate: { y: 0 },
            exit: { y: '100%' },
            transition: { type: 'spring', damping: 25, stiffness: 200 },
    };
    const backdropMotionProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
    const afterDark = useAfterDarkEvents({
        open: homeMode === 'after-dark' && !venueCardOpen && !mobileFilterOpen && reportId === null && (!isMobile || sheetExpanded),
        origin: eventOrigin,
        // Same public client configuration used by postChatSunny.
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    });
    const afterDarkPanel = <AfterDarkPanel origin={eventOrigin} venues={venues} weather={weather} state={afterDark}
        onRetry={afterDark.retry} onCosy={() => { rememberHomeMode('sun'); handleExperienceSelect('cozy'); }}
        onLocate={handleLocateMe} locating={isLocating} locateHint={locateHint} />;

    return (
        <>
            {!splashDone && (
                <SplashScreen
                    isReady={appReady}
                    onComplete={() => {
                        markSplashSeen();
                        setSplashDone(true);
                    }}
                />
            )}

            <NotificationCenter
                venue={selectedVenue}
                weather={weather}
                sunData={selectedVenueSunData}
                score={selectedVenueScore}
            />

            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {refreshStatus}
            </div>

            <div
                className={`ss-app-root ss-map-first-home ${previewVenue ? 'ss-map-first-home--preview' : ''} ${sheetExpanded ? 'ss-map-first-home--list-open' : ''} ${sheetExpanded && homeMode === 'after-dark' ? 'ss-map-first-home--after-dark' : ''} flex h-dvh min-h-0 flex-col overflow-hidden ${mobileMapExpanded ? 'ss-app-root--map-expanded' : ''}`}
            >
                {/* Explore uses a solid warm surface; detail weather retains its own presentation. */}

                {!venueCardOpen && <TopBar
                    weather={weather} onFiltersOpen={openMobileFilters} comfort={comfort}
                    searchQuery={searchQuery} onSearchChange={setSearchQuery}
                    onSearchSubmit={() => { setPreviewVenue(null); if (isMobile) setMobileSheetState('expanded'); }}
                    venues={venues} onSuggestionSelect={handleVenueSelect}
                    isChatOpen={isChatOpen} onSunnyClick={toggleChat}
                />}

                <div className={`ss-home-chip-layer ${venueCardOpen ? 'ss-home-chip-layer--hidden' : ''}`}>
                    <div className="ss-home-chip-row">
                        <span id="explore-time-controls" />
                        <span className="ss-home-chip-divider" aria-hidden="true" />
                        <ExperienceFinder selected={selectedExperience(activeFilters, stayMoment)} onSelect={handleExperienceSelect}
                            onClear={() => setActiveFilters(clearExperience(activeFilters))} canClear={clearExperience(activeFilters).length !== activeFilters.length} />
                    </div>
                </div>

                <main className="ss-main relative flex min-h-0 w-full flex-1 overflow-hidden">
                    {/* LEFT: Venue List — desktop sidebar at lg (1024px) only */}
                    <aside className={`ss-sidebar ${homeMode === 'after-dark' ? 'ss-sidebar--after-dark' : ''} hidden h-full w-full flex-col overflow-hidden border-r border-gray-200 bg-white lg:flex lg:w-96`}>
                        <HomeSheetMode mode={homeMode} onChange={handleHomeMode} />
                        {homeMode === 'after-dark' ? (!isMobile && afterDarkPanel) : <>
                        <div className="px-3 pt-2"><PropertyFilterPills activeFilters={activeFilters} onToggle={handleFilterToggle} /></div>
                        {/* Quick-filter pills share the unified filter state. */}
                        <div className="ss-quick-filter-row flex flex-shrink-0 gap-2 px-3 py-2">
                            <button
                                onClick={() => handleFilterToggle(FILTER_COZY)}
                                className={`ss-quick-pill ${cozyFilterActive ? 'ss-quick-pill--active' : ''}`}
                                aria-pressed={cozyFilterActive}
                            >
                                <ClayIcon name="indoor-warmth" size={24} /> Cozy
                            </button>
                            <button
                                onClick={() => handleFilterToggle(FILTER_SUNNY)}
                                className={`ss-quick-pill ${sunnyFilterActive ? 'ss-quick-pill--active' : ''}`}
                                aria-pressed={sunnyFilterActive}
                            >
                                <ClayIcon name="sun" size={24} /> Sunny
                            </button>
                        </div>

                        <div className="ss-sidebar-count" id="desktop-discovery-results" tabIndex={-1}>
                            <span className="inline-flex items-center gap-2">
                                {areaBounds ? areaCountLabel(matchingCount) : nearPlace ? placeCountLabel(matchingCount, placeForQuery, nearPlace.radiusM) : `${matchingCount} venue${matchingCount !== 1 ? 's' : ''}`}
                                {areaBounds ? showAllChip('-my-3') : null}
                                {ENABLE_MANUAL_VENUE_REFRESH ? (
                                    <VenueRefreshButton
                                        onRefresh={requestRefresh}
                                        isRefreshing={isRefreshing}
                                    />
                                ) : null}
                            </span>
                            <span className="inline-flex items-center gap-2">
                                {isRefreshing ? <span className="ss-venue-refresh-status">Updating…</span> : null}
                                {!isRefreshing && refreshFailureVisible(refreshStatus) ? (
                                    <span className="ss-venue-refresh-status ss-venue-refresh-status--error">Couldn't update</span>
                                ) : null}
                                {(activeFilters.length > 0 || searchQuery.trim()) && (
                                    <button onClick={handleClearFilters} className="ss-sidebar-clear">Clear all</button>
                                )}
                            </span>
                        </div>

                        {!isMobile && stayPicker}
                        {!isMobile ? (
                                <MascotPullRefresh
                                    ref={pullRefreshRef}
                                    enabled={false}
                                    showMascot={false}
                                    onRefresh={refetch}
                                    onStatusChange={setRefreshStatus}
                                    className="ss-venue-list"
                                >
                                    <LiveVenueList
                                        className="ss-mascot-ptr__scroller"
                                        virtuosoRef={sidebarVirtuosoRef}
                                        venues={renderedVenues}
                                        stayMoment={staysActive ? stayMoment : null}
                                        comparedIds={comparedIds}
                                        onCompare={toggleCompare}
                                        showLoadMore={hasMoreVenues}
                                        onLoadMore={handleLoadMoreVenues}
                                        selectedVenue={pairedVenue}
                                        onVenueSelect={handleVenueSelect}
                                        highlightedVenueId={highlightedVenueId}
                                        onVenueHover={handleVenueHover}
                                        sunHorizons={sunHorizons}
                                        isNight={cityNight}
                                        isRain={cityRain}
                                        liveVenueFeatures={liveVenueFeatures}
                                        weather={weather}
                                        activeFilters={activeFilters}
                                        sunMomentsById={sunMomentsById}
                                        empty={listEmptyState}
                                    />
                                </MascotPullRefresh>
                        ) : null}
                        </>}
                    </aside>

                    {/* RIGHT: Map */}
                    <section className={`ss-map-area relative flex min-h-0 flex-1 flex-col ${mobileMapExpanded ? 'ss-map-area--expanded' : ''}`}>
                        <div
                            className="ss-map-container relative min-h-0 flex-1"
                            onPointerDownCapture={previewVenue ? startPreviewMapGesture : undefined}
                            onPointerMoveCapture={previewVenue ? movePreviewMapGesture : undefined}
                            onPointerUpCapture={endPreviewMapGesture}
                            onPointerCancelCapture={endPreviewMapGesture}
                        >
                            <MapErrorBoundary>
                                <Suspense fallback={<div className="ss-map-loading" role="status">Loading map…</div>}>
                                    <VenueMap
                                        ref={mapRef}
                                        venues={venues}
                                        onVenueSelect={handlePinSelect}
                                        selectedVenue={previewVenue ?? selectedVenue}
                                        highlightedVenueId={highlightedVenueId}
                                        onVenueHover={handleVenueHover}
                                        filteredVenueIds={stableFilteredIds}
                                        activeSunMoment={wantedSunMoments[0] ?? null}
                                        sunMomentsById={sunMomentsById}
                                        filterKey={mapFilterKey}
                                        liveVenueFeatures={liveVenueFeatures}
                                        weatherColorFn={getMarkerWeatherColor}
                                        cozyWeatherActive={cozyWeatherActive}
                                        cozyFilterActive={cozyFilterActive}
                                        isNight={cityNight}
                                        nightMode={homeMode === 'after-dark'}
                                        isExpanded={mobileMapExpanded}
                                        searchedArea={areaBounds}
                                        onSearchArea={setAreaBounds}
                                        onCameraSettle={setEventCamera}
                                    />
                                </Suspense>
                            </MapErrorBoundary>
                        </div>

                        {/* Zero-Results Filter Overlay — desktop only: on mobile the
                            bottom sheet already carries the card, and the map area
                            behind it is too occluded to centre a second copy in. */}
                        <AnimatePresence>
                            {!isMobile && filteredVenues.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm pointer-events-none"
                                >
                                    {/* The card and its spring live in EmptyVenueState;
                                        the sidebar copy is the one that announces. */}
                                    <EmptyVenueState
                                        {...homesEmpty}
                                        onClearFilters={handleClearFilters}
                                        className="pointer-events-auto"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Bottom-anchored map controls — clear of the collapsed venue sheet */}
                        <div className={`ss-home-locate-layer pointer-events-none absolute inset-x-0 z-50 ${previewVenue ? 'bottom-[calc(env(safe-area-inset-bottom)+310px)] lg:bottom-[230px]' : 'bottom-[calc(env(safe-area-inset-bottom)+90px)] lg:bottom-[46px]'}`}>
                            {/* Right column: Locate Me + Recenter + Sunny — Filters+TOD live in VenueMap */}
                            <div className="pointer-events-none absolute right-4 bottom-0 flex flex-col items-end gap-3">
                                {locateHint && (
                                    <div
                                        role="status"
                                        className="pointer-events-none max-w-[200px] rounded-full bg-slate-900/85 px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_6px_24px_-8px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15"
                                    >
                                        {locateHint}
                                    </div>
                                )}
                                {/* One location button. If location is off or the user is
                                    outside Melbourne, it falls back to the Melbourne view. */}
                                <div className="ss-explore-locate pointer-events-auto flex flex-col overflow-hidden rounded-[22px] border border-white/60 bg-white/90 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.35)] divide-y divide-slate-900/[0.07]">
                                    <motion.button
                                        type="button"
                                        className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center text-sky-700 transition-colors active:bg-slate-900/10 disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600"
                                        whileTap={{ scale: 0.92 }}
                                        onClick={handleLocateMe}
                                        disabled={isLocating}
                                        aria-label="Locate Me"
                                        title="Locate Me"
                                        id="locate-me"
                                    >
                                        <Locate size={19} strokeWidth={2.25} className={isLocating ? 'animate-pulse' : undefined} />
                                    </motion.button>
                                </div>

                            </div>
                        </div>
                        <AnimatePresence mode="wait">
                            {previewVenue ? (
                                <MapVenuePreview
                                    key={previewVenue.id}
                                    venue={previewVenue}
                                    weather={weather}
                                    onOpen={handleVenueSelect}
                                    onClose={closePreview}
                                    mapExpanded={mobileMapExpanded}
                                />
                            ) : null}
                        </AnimatePresence>
                    </section>

                    {selectedVenue && !venueCardLowered && (
                        <VenueCard
                            key={selectedVenue.id}
                            venue={selectedVenue}
                            stayMatch={staysActive ? rankedStays.find(v => v.id === selectedVenue.id) : null}
                            weather={weather}
                            liveVenueFeatures={selectedVenueLiveFeatures}
                            onClose={handleCloseCard}
                            onOpenSunReport={openSunReport}
                            onCenter={handleCenterOnMap}
                            cozyWeatherActive={cozyWeatherActive}
                            setShowOwnerDashboard={setShowOwnerDashboard}
                            setSelectedVenue={setSelectedVenue}
                            onSheetGesture={setVenueSheetDragging}
                        />
                    )}

                    <AnimatePresence>
                        {showOwnerDashboard && (
                            <Suspense fallback={null}>
                                <OwnerDashboard
                                    venue={selectedVenue}
                                    liveVenueFeatures={liveVenueFeatures}
                                    setLiveVenueFeatures={updateLiveVenueFeature}
                                    onClose={handleOwnerDashboardClose}
                                    onVenueUpdate={handleSelectedVenueUpdate}
                                />
                            </Suspense>
                        )}
                    </AnimatePresence>

                    <Suspense fallback={null}>
                        <FilterSheet
                            isOpen={mobileFilterOpen}
                            onClose={closeMobileFilters}
                            activeFilters={activeFilters}
                            onToggleFilter={handleFilterToggle}
                            onClearAll={handleClearFilters}
                            customFilters={customFilters}
                            newCustomFilter={newFilter}
                            setNewCustomFilter={setNewFilter}
                            onAddCustomFilter={addCustomFilter}
                            resultCount={filteredVenues.length}
                        />
                    </Suspense>
                </main>

                {/* Hidden while Filters is open: the fixed bar sat on top of the
                    sheet's "Show N venues" button and swallowed the tap. */}
                {!mobileMapExpanded && !venueCardOpen && !mobileFilterOpen && (
                    <div className={`ss-home-sheet-peek ${homeMode === 'after-dark' ? 'ss-home-sheet-peek--after-dark' : ''}`}>
                    <HomeSheetMode mode={homeMode} onChange={handleHomeMode} />
                    <motion.div
                        role="button" tabIndex={0} aria-label={homeMode === 'after-dark' ? "Show tonight's events" : 'Show venue list'} aria-expanded={sheetExpanded}
                        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.12}
                        onPointerDown={() => { peekDragged.current = false; }}
                        onDragStart={() => { peekDragged.current = true; }}
                        onDragEnd={(_, { offset, velocity }) => { if (offset.y < -40 || velocity.y < -300) { setPreviewVenue(null); setMobileSheetState('expanded'); } }}
                        onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); setPreviewVenue(null); setMobileSheetState('expanded'); } }}
                        className={`ss-mobile-sheet-handle ${mobileSheetState === 'expanded' ? 'ss-mobile-sheet-handle--expanded' : ''}`}
                        onClick={() => { if (peekDragged.current) { peekDragged.current = false; return; } setPreviewVenue(null); setMobileSheetState(prev => prev === 'expanded' ? 'peek' : 'expanded'); }}
                    >
                        <div className="ss-mobile-sheet-grab" />
                        <span className="ss-home-peek-headline">
                            {homeMode === 'after-dark' ? "Tonight's events" : <>
                            {areaBounds ? areaCountLabel(matchingCount) : nearPlace ? placeCountLabel(matchingCount, placeForQuery, nearPlace.radiusM) : `${matchingCount.toLocaleString('en-AU')} ${matchingCount === 1 ? 'venue' : 'venues'}`}
                            {homeClause && <span> · {homeClause}</span>}
                            {areaBounds ? showAllChip('-my-3') : null}
                            {ENABLE_MANUAL_VENUE_REFRESH ? (
                                <VenueRefreshButton
                                    onRefresh={requestRefresh}
                                    isRefreshing={isRefreshing}
                                />
                            ) : null}
                            </>}
                        </span>
                        <p className="ss-discovery-context">{homeMode === 'after-dark' ? 'Events within 3\u00a0km' : experienceContext}</p>
                        <p className="ss-discovery-source">{homeMode === 'after-dark' ? 'Events from Ticketmaster' : dataLabel}</p>
                        {homeMode === 'sun' && <ChevronUp size={14} className="ss-home-peek-chevron" />}
                    </motion.div>
                    </div>
                )}

                <AnimatePresence>
                    {sheetExpanded && (
                        <>
                            <motion.div
                                {...backdropMotionProps}
                                onClick={() => setMobileSheetState('peek')}
                                className="ss-mobile-sheet-backdrop"
                            />
                            <motion.div
                                {...sheetMotionProps}
                                className={sheetClassName}
                                data-sheet-dragging={sheetDragging ? '1' : '0'}
                                data-sheet-will-change={sheetDrag.willChange}
                                data-sheet-backdrop={sheetDrag.backdropFilter}
                            >
                                <div className="ss-mobile-sheet-head">
                                    <div className="ss-mobile-sheet-grab" />
                                    <HomeSheetMode mode={homeMode} onChange={handleHomeMode} />
                                    {homeMode === 'sun' && <>
                                    <h3 id="mobile-discovery-results" tabIndex={-1}><ClayIcon name="sun" size={30} />Venues</h3>
                                    <p className="inline-flex items-center gap-2">
                                        {areaBounds ? areaCountLabel(matchingCount) : nearPlace ? placeCountLabel(matchingCount, placeForQuery, nearPlace.radiusM) : `${matchingCount.toLocaleString('en-AU')} ${matchingCount === 1 ? 'result' : 'results'}`}
                                        {areaBounds ? showAllChip('-my-3') : null}
                                        {ENABLE_MANUAL_VENUE_REFRESH ? (
                                            <VenueRefreshButton
                                                onRefresh={requestRefresh}
                                                isRefreshing={isRefreshing}
                                            />
                                        ) : null}
                                    </p>
                                    {!staysActive && <span className="ss-explore-sort">{comfortSort ? <><ClayIcon name="indoor-warmth" size={18} />{comfortSort}</> : <><ClayIcon name="sun" size={18} />Sunniest first</>}</span>}
                                    {isRefreshing ? <p className="ss-venue-refresh-status">Updating…</p> : null}
                                    {!isRefreshing && refreshFailureVisible(refreshStatus) ? (
                                        <p className="ss-venue-refresh-status ss-venue-refresh-status--error">Couldn't update</p>
                                    ) : null}
                                    {/* The peek header's context lines, shown once here while it is hidden. */}
                                    <p className="ss-discovery-context">{experienceContext}</p>
                                    <p className="ss-discovery-source">{dataLabel}</p>
                                    </>}
                                </div>
                                {homeMode === 'after-dark' ? afterDarkPanel : <>
                                {/* Search stays in the floating top bar, which drives the same query. */}
                                <div className="ss-mobile-sheet-search flex-shrink-0 px-4 pt-1 pb-2 flex flex-col gap-2 bg-white border-b border-gray-100" onPointerDownCapture={e => e.stopPropagation()}>
                                    <QuickFilterChips
                                        activeFilters={activeFilters}
                                        onToggle={handleFilterToggle}
                                        onClear={handleClearFilters}
                                        showClear={activeFilters.length > 0 || Boolean(searchQuery.trim())}
                                    />
                                </div>
                                {stayPicker}
                                    <MascotPullRefresh
                                        ref={pullRefreshRef}
                                        enabled
                                        showMascot
                                        onRefresh={refetch}
                                        onStatusChange={setRefreshStatus}
                                        className="ss-mobile-sheet-list"
                                    >
                                        <LiveVenueList
                                            className="ss-mascot-ptr__scroller"
                                            virtuosoRef={mobileVirtuosoRef}
                                            onPointerDownCapture={stopSheetPointer}
                                            safeAreaFooter
                                            venues={renderedVenues}
                                        stayMoment={staysActive ? stayMoment : null}
                                        comparedIds={comparedIds}
                                        onCompare={toggleCompare}
                                            showLoadMore={hasMoreVenues}
                                            onLoadMore={handleLoadMoreVenues}
                                            selectedVenue={pairedVenue}
                                            onVenueSelect={handleVenueSelect}
                                            highlightedVenueId={highlightedVenueId}
                                            onVenueHover={handleVenueHover}
                                            sunHorizons={sunHorizons}
                                            isNight={cityNight}
                                            isRain={cityRain}
                                            liveVenueFeatures={liveVenueFeatures}
                                            weather={weather}
                                            activeFilters={activeFilters}
                                            sunMomentsById={sunMomentsById}
                                            empty={listEmptyState}
                                        />
                                    </MascotPullRefresh>
                                </>}
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {staysActive && compareOpen && comparisonVenues.length > 0 && <StayComparison venues={comparisonVenues} moment={stayMoment} onClose={closeStayComparison} returnFocusRef={compareTriggerRef} />}
                <ChatWidget
                    isOpen={isChatOpen}
                    onClose={closeChat}
                    weather={weather}
                    selectedVenue={selectedVenue}
                    onSetFilters={handleSunnySetFilters}
                    venues={venues}
                    sunMomentsById={sunMomentsById}
                    onOpenVenue={handleChatOpenVenue}
                    onFindWheelchair={handleFindWheelchair}
                    onFindDogFriendly={handleFindDogFriendly}
                    onFindSmoking={handleFindSmoking}
                    onSurpriseMe={handleSurpriseMe}
                    onShowOnMap={handleShowOnMap}
                    onFindFamily={handleFindFamily}
                    onFindBusiness={handleFindBusiness}
                    onFindSunny={handleFindSunny}
                    onFindRooftop={handleFindRooftop}
                    onFindIndoor={handleFindIndoor}
                    onFindWindSheltered={handleFindWindSheltered}
                />

                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    className={`ss-footer-badge ${venueCardOpen ? 'hidden' : ''}`}
                >
                    <img src={fireIconImg} alt="" className="ss-footer-badge-icon" />
                    SunStay preview · {venues.length} listings
                </motion.div>
            </div>
            {reportId !== null && (
                <Suspense fallback={null}>
                    <HotelSunReport key={reportId} venue={reportVenue} loading={!reportVenue && (!venueLookupStarted || venuesLoading)} onClose={closeSunReport} />
                </Suspense>
            )}
        </>
    );
};

// <AppContent /> is constructed here, so MicroclimateProvider's own state
// updates (viewport bbox, slider scrub) reuse the same element and React skips
// re-rendering the tree. Only components reading a microclimate value update.
const App = () => (
    <>
        <WeatherProvider>
            <MicroclimateProvider>
                <AppErrorBoundary>
                    <AppContent />
                </AppErrorBoundary>
            </MicroclimateProvider>
        </WeatherProvider>
        {/* Outside the providers: the offline boundary watches the connection
            itself and must not depend on weather or microclimate state. */}
        <NetworkErrorModal />
    </>
);

export default App;
