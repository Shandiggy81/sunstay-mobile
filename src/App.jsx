import React, { useState, useRef, useCallback, useMemo, useEffect, Suspense, lazy, memo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import { MicroclimateProvider, useVenueMicroclimate, useMicroclimateActions } from './context/MicroclimateContext';
import { boundsOfVenues, markerScoreFromMicroclimate } from './utils/microclimate';
import WeatherBackground from './components/WeatherBackground';
import VenueMap from './components/Map/VenueMap';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import TopBar from './components/TopBar';
import NotificationCenter from './components/NotificationCenter';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronUp, ChevronDown, Search,
    Wind, Sun, Cloud, X, Locate, Crosshair
} from 'lucide-react';
import { useVenues } from './hooks/useVenues';
import { pullRefreshStatus, refreshFailureVisible } from './utils/pullRefreshStatus';
import { sheetDragCompositing } from './utils/sheetDragCompositing';
import { sliceVenuesForRender } from './utils/venueRenderLimit';
import {
    INITIAL_VISIBLE_VENUES,
    VENUES_PER_LOAD,
    venueResultIdentity,
} from './utils/progressiveVenueList';
import { ENABLE_MANUAL_VENUE_REFRESH } from './utils/manualVenueRefresh';
import MascotPullRefresh from './components/MascotPullRefresh';
import VenueRefreshButton from './components/VenueRefreshButton';
import DebugStaticSunny from './components/DebugStaticSunny';
import {
    DEBUG_MASCOT_RENDER,
    ENABLE_MAPBOX,
    ENABLE_MASCOT_PULL_REFRESH,
    ENABLE_SHEET_MOTION,
    MATRIX_HUD,
    SHEET_BACKDROP_MODE,
    SHEET_WILL_CHANGE_MODE,
    VENUE_RENDER_LIMIT,
    VENUE_RENDER_MODE,
    crashTestId,
    renderMatrixTestId,
} from './utils/iosCrashIsolation';
import {
    attachPageLifecycleProbes,
    setIsolationContext,
} from './utils/iosCrashLog';
import IsolationDevLog from './components/IsolationDevLog';
import { useVenueFeatures } from './hooks/useVenueFeatures';
import SplashScreen from './components/SplashScreen';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';
import { getComfortLevel } from './utils/weatherService';
import { getSunData } from './utils/getSunData';
import { sortVenuesBySunstayScore } from './utils/sortVenuesBySunstayScore';
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

const FilterSheet = lazy(() => import('./components/FilterSheet'));
const OwnerDashboard = lazy(() => import('./components/OwnerDashboard'));

// ── Filter ID constants (single source of truth) ──────────────────────
export const FILTER_COZY  = 'cozy-mode';
export const FILTER_SUNNY = 'sunny-mode';

// FilterSheet chips use FILTER_CATEGORIES[].id, which is also how venue.tags
// are stored. Heating is a string on each venue (not an array).
const HEATING_FILTER_MATCHERS = {
    Fireplace: (heating) => heating.includes('fireplace'),
    Heaters: (heating) => heating.includes('heat') && !heating.includes('no heat'),
    'Indoor Warmth': (heating) => heating.includes('indoor'),
};

const venueMatchesWeatherTag = (venue, filterId) => {
    // Venue tags use the same string values as FILTER_CATEGORIES[].id
    // (e.g. 'Rooftop', 'Pet Friendly'). Match the id directly instead of
    // looking up a non-existent `filter.tag` property — that always returned
    // undefined, so every tag filter used to match zero venues.
    const needle = String(filterId).toLowerCase();
    const tags = venue.tags || [];
    if (tags.some(tag => String(tag).toLowerCase() === needle)) return true;
    const heatingMatcher = HEATING_FILTER_MATCHERS[filterId];
    return heatingMatcher ? heatingMatcher(String(venue.heating || '').toLowerCase()) : false;
};

const venueMatchesSearchQuery = (venue, query) => {
    if (!query) return true;
    const name = (venue.name || venue.venueName || '').toLowerCase();
    const suburb = (venue.suburb || '').toLowerCase();
    const vibe = (venue.vibe || '').toLowerCase();
    return name.includes(query) || suburb.includes(query) || vibe.includes(query);
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
// Mirrors VenueCard.jsx's SunstayScoreBadge thresholds/emoji exactly, so the
// score a user sees while scanning the list matches the one they see after
// tapping into the detail sheet — same number, same colour, same meaning.
const getSunstayScoreVisual = (score) => {
    if (score >= 75) return { emoji: '☀️', color: '#10B981' }; // emerald — prime conditions
    if (score >= 50) return { emoji: '🌤️', color: '#F59E0B' }; // amber — good conditions
    return { emoji: '🌥️', color: '#0EA5E9' };                  // sky — worth a look
};

// ── VenueListCard ──────────────────────────────────────────────────────
const VenueListCard = memo(({ venue, isSelected, onVenueSelect, weather, calculateSunstayScore }) => {
    const profile = useMemo(() => getWindProfile(venue), [venue]);
    // Server-side microclimate for this venue at the time-of-day slider's
    // position. Absent until the bbox fetch lands, and absent for venues with
    // no profile row, so every use below is guarded.
    const micro = useVenueMicroclimate(venue.id);
    const temp = weather?.main?.temp;
    const feelsLike = temp != null
        ? Math.round(calculateApparentTemp(temp, weather?.wind?.speed, weather?.main?.humidity, profile.shelterFactor))
        : null;
    const comfort = feelsLike != null ? getComfortZone(feelsLike) : null;

    // Per-venue Sunstay Score — same RPC microclimate score as the map pin
    // and the detail sheet, so scrubbing TOD cannot show 84 on the card and
    // 4 on the marker. Weather-adjusted calculateSunstayScore is the fallback
    // for venues with no profile row.
    const sunstayScore = useMemo(() => {
        const profileScore = markerScoreFromMicroclimate(micro);
        if (profileScore != null) return profileScore;
        const raw = typeof calculateSunstayScore === 'function' ? calculateSunstayScore(venue) : null;
        return Number.isFinite(raw) ? Math.round(raw) : null;
    }, [micro, calculateSunstayScore, venue]);
    const scoreVisual = useMemo(
        () => (sunstayScore != null ? getSunstayScoreVisual(sunstayScore) : null),
        [sunstayScore]
    );

    const isStay = venue.typeCategory === 'ShortStay';
    const isHotel = venue.typeCategory === 'Hotel';

    // `typeLabel` and `vibe` are both nullable in the venues table, so the
    // subtitle is joined from present parts only — never " · Fitzroy".
    const descriptor = String((isStay || isHotel ? venue.typeLabel : venue.vibe) ?? '').trim();
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
            aria-label={`Venue: ${venue.venueName}.${subtitle ? ` ${subtitle}.` : ''}${micro.sunLabel ? ` ${micro.sunLabel}, ${micro.sunPercent} sun.` : ''}${sunstayScore != null ? ` Sunstay score ${sunstayScore} out of 100.` : ''}`}
            className={`ss-venue-list-card relative overflow-hidden ${isSelected ? 'ss-venue-list-card--active' : ''}`}
            id={`venue-list-${venue.id}`}
        >
            <div className="ss-vlc-emoji">{venue.emoji}</div>
            <div className="ss-vlc-body">
                <div className="ss-vlc-name">{venue.venueName}</div>
                {subtitle ? <div className="ss-vlc-sub">{subtitle}</div> : null}
                {micro.sunLabel ? (
                    <div className="mt-1 flex min-w-0 items-center gap-1.5">
                        <Sun size={12} className="shrink-0 text-amber-500" aria-hidden="true" />
                        <span className="truncate text-[11.5px] font-semibold tracking-[-0.01em] text-slate-600">
                            <span className="tabular-nums">{micro.sunPercent}</span>
                            <span className="text-slate-400"> · </span>
                            {micro.sunLabel}
                            {micro.windLabel ? (
                                <>
                                    <span className="text-slate-400"> · </span>
                                    {micro.windLabel}
                                </>
                            ) : null}
                        </span>
                    </div>
                ) : null}
            </div>
            <div className="ss-vlc-right">
                {scoreVisual && (
                    <div
                        className="ss-vlc-badge"
                        style={{ background: scoreVisual.color + '18', color: scoreVisual.color }}
                        title={`Sunstay Score: ${sunstayScore}/100`}
                    >
                        <span>{scoreVisual.emoji}</span>
                        <span>{sunstayScore}</span>
                    </div>
                )}
                {isStay && venue.nightlyPriceDemo ? (
                    <div className="ss-vlc-temp !bg-emerald-50 !text-emerald-700 !border-emerald-100 px-2 rounded-lg">
                        <span className="text-[9px] font-black uppercase tracking-tighter">Stay</span>
                    </div>
                ) : feelsLike != null && (
                    <div className="ss-vlc-temp">
                        <span className={comfort?.color}>{comfort?.icon}</span>
                        <span>{feelsLike}°</span>
                    </div>
                )}
            </div>
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
                        />
                    </div>
                )}
            />
        </div>
    );
});
LiveVenueList.displayName = 'LiveVenueList';

const VenueSearchInput = memo(({ id, value, onChange }) => (
    <div className="ss-search-wrap">
        <Search size={15} className="ss-search-icon" aria-hidden="true" />
        <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search venues, suburbs…"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="ss-search-input"
            id={id}
            aria-label="Search venues"
        />
        {value ? (
            <button
                type="button"
                onClick={() => onChange('')}
                className="ss-search-clear"
                aria-label="Clear search"
            >
                <X size={13} />
            </button>
        ) : null}
    </div>
));
VenueSearchInput.displayName = 'VenueSearchInput';

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
    const [splashDone, setSplashDone] = useState(hasSeenSplash);
    const { weather, loading: weatherLoading, calculateSunstayScore, previewMinutes } = useWeather();
    const { venues, refetch, isRefreshing } = useVenues();
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

    // Seed the microclimate fetch from the loaded venues so the list has
    // readings before the map reports a viewport — and still has them if the
    // map never loads. A live viewport supersedes this.
    useEffect(() => {
        const bbox = boundsOfVenues(venues);
        if (bbox) setFallbackBbox(bbox);
    }, [venues, setFallbackBbox]);

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
    const [isChatOpen, setIsChatOpen]                 = useState(false);
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

    useEffect(() => {
        setIsolationContext({
            route: `${window.location.pathname}${window.location.search}`,
        });
        return attachPageLifecycleProbes(window);
    }, []);

    const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
    const [mobileSheetState, setMobileSheetState]   = useState('peek');
    const [sheetDragging, setSheetDragging]         = useState(false);
    const [mobileFilterOpen, setMobileFilterOpen]   = useState(false);
    const [searchQuery, setSearchQuery]             = useState('');
    // Immediate input; filter/score/GeoJSON/fitBounds wait until typing settles.
    const settledSearchQuery = useDebouncedValue(searchQuery, SEARCH_DEBOUNCE_MS);
    const [isLocating, setIsLocating]               = useState(false);
    const [locateHint, setLocateHint]               = useState(null);

    const mapRef  = useRef(null);
    const sidebarVirtuosoRef = useRef(null);
    const mobileVirtuosoRef = useRef(null);

    const openMobileFilters  = useCallback((e) => { e?.stopPropagation(); setMobileFilterOpen(true); }, []);
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

    // ── Unified venue filtering ────────────────────────────────────────
    // One pass feeds the map pins, sidebar list, mobile sheet, and counts.
    const filteredVenues = useMemo(() => {
        const filters = activeFilters || [];
        const typeFilters = filters.filter(f => f.startsWith('all-'));
        const intentFilters = filters.filter(f => f.startsWith('sun-'));
        const tagFilters = filters.filter(f =>
            !f.startsWith('all-') &&
            !f.startsWith('sun-') &&
            f !== FILTER_COZY &&
            f !== FILTER_SUNNY
        );
        const query = settledSearchQuery.trim().toLowerCase();

        return venues.filter(venue => {
            const vType = venue.typeCategory || 'Bar';
            const hasTypeMatch = typeFilters.length === 0 || typeFilters.some(f => {
                if (f === 'all-bars'   && vType === 'Bar')       return true;
                if (f === 'all-hotels' && vType === 'Hotel')     return true;
                if (f === 'all-stays'  && vType === 'ShortStay') return true;
                return false;
            });
            if (!hasTypeMatch) return false;

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

            if (tagFilters.length > 0 && !tagFilters.some(id => venueMatchesWeatherTag(venue, id))) {
                return false;
            }

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
                const uvIndexValue = weather?.uvi ?? 0;
                if (uvIndexValue < 4 || liveState.roofClosed) return false;
            }

            if (!venueMatchesSearchQuery(venue, query)) return false;

            return true;
        });
    }, [venues, activeFilters, cozyFilterActive, sunnyFilterActive, liveVenueFeatures, settledSearchQuery, weather?.uvi]);

    // Filter first, then rank by settled TOD Sunstay score (high → low).
    const sortedVenues = useMemo(
        () => sortVenuesBySunstayScore(filteredVenues, calculateSunstayScore),
        [filteredVenues, calculateSunstayScore, previewMinutes]
    );
    const resultIdentity = useMemo(() => venueResultIdentity(sortedVenues), [sortedVenues]);
    const [visibleVenueCount, setVisibleVenueCount] = useState(INITIAL_VISIBLE_VENUES);
    const [windowIdentity, setWindowIdentity] = useState(resultIdentity);
    if (windowIdentity !== resultIdentity) {
        setWindowIdentity(resultIdentity);
        setVisibleVenueCount(INITIAL_VISIBLE_VENUES);
    }
    const renderedVenues = useMemo(() => {
        if (VENUE_RENDER_MODE === 'diagnostic-all') return sortedVenues;
        if (VENUE_RENDER_MODE === 'diagnostic-cap') return sliceVenuesForRender(sortedVenues, VENUE_RENDER_LIMIT);
        return sortedVenues.slice(0, visibleVenueCount);
    }, [sortedVenues, visibleVenueCount]);
    const hasMoreVenues = VENUE_RENDER_MODE === 'progressive' && visibleVenueCount < sortedVenues.length;
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

    const matchingCount = filteredVenues.length;
    const stableFilteredIds = filteredVenueIds;

    const handleVenueSelect = useCallback((venue) => {
        if (!venue) return;
        pullRefreshRef.current?.reset?.();
        setSelectedVenue(venue);
        setMobileSheetState('peek');
        setIsolationContext({
            venue: venue.name || venue.title || String(venue.id ?? ''),
            tab: 'Overview',
        });
        const lng = Number(venue.lng);
        const lat = Number(venue.lat);
        if (mapRef.current?.resizeAndFly && Number.isFinite(lng) && Number.isFinite(lat)) {
            mapRef.current.resizeAndFly([lng, lat]);
        }
    }, []);

    const handleCloseCard  = useCallback(() => {
        pullRefreshRef.current?.reset?.();
        setSelectedVenue(null);
        setIsolationContext({ venue: '', tab: '' });
    }, []);
    const toggleChat       = useCallback(() => setIsChatOpen(p => !p), []);
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
    }, []);

    const makeChatFilter = (filter) => () => {
        setActiveFilters([filter]);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
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

    const handleSunnySetFilters = useCallback((tags) => {
        setActiveFilters(Array.isArray(tags) ? tags : []);
    }, []);

    const handleSunnyPanToVenue = useCallback((venueId) => {
        const id = String(venueId ?? '');
        if (!id) return false;
        const venue = venues.find((v) => String(v.id) === id);
        if (!venue) return false;
        handleVenueSelect(venue);
        return true;
    }, [venues, handleVenueSelect]);

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
                    setLocateHint(denied ? 'Location permission denied' : 'Could not find you');
                    console.warn('[Sunstay] Locate Me failed:', err?.message || err);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
            );
        } catch (e) {
            setIsLocating(false);
            setLocateHint('Could not find you');
            console.warn('[Sunstay] Locate Me error:', e?.message);
        }
    }, []);

    useEffect(() => {
        if (!locateHint) return undefined;
        const t = setTimeout(() => setLocateHint(null), 2800);
        return () => clearTimeout(t);
    }, [locateHint]);

    const renderedVenuesRef = useRef(renderedVenues);
    renderedVenuesRef.current = renderedVenues;
    useEffect(() => {
        if (!selectedVenue) return undefined;
        const index = renderedVenuesRef.current.findIndex((v) => v.id === selectedVenue.id);
        if (index < 0) return undefined;
        sidebarVirtuosoRef.current?.scrollIntoView?.({ index, behavior: 'smooth' });
        mobileVirtuosoRef.current?.scrollIntoView?.({ index, behavior: 'smooth' });
        return undefined;
    }, [selectedVenue]);

    const selectedLiveFeatureState = selectedVenue?.id ? liveVenueFeatures?.[selectedVenue.id] : null;
    const selectedVenueLiveFeatures = useMemo(() => {
        if (!selectedVenue?.id || !selectedLiveFeatureState) return EMPTY_LIVE_FEATURES;
        return { [selectedVenue.id]: selectedLiveFeatureState };
    }, [selectedVenue?.id, selectedLiveFeatureState]);

    const selectedVenueSunData = useMemo(() =>
        selectedVenue?.lat && selectedVenue?.lng
            ? getSunData(selectedVenue.lat, selectedVenue.lng)
            : null,
        [selectedVenue?.lat, selectedVenue?.lng]
    );

    const selectedVenueScore = weather?.score ?? weather?.rawWeather?.score ?? 70;

    const sheetDrag = sheetDragCompositing({
        dragging: sheetDragging,
        willChange: SHEET_WILL_CHANGE_MODE,
        backdrop: SHEET_BACKDROP_MODE,
    });
    const sheetExpanded = mobileSheetState === 'expanded' && !selectedVenue;
    const sheetClassName = `ss-mobile-sheet ${filteredVenues.length === 0 ? 'ss-mobile-sheet--empty' : ''} ${sheetDrag.className}`.trim();
    useEffect(() => {
        if (!sheetExpanded) setSheetDragging(false);
    }, [sheetExpanded]);
    const SheetEl = ENABLE_SHEET_MOTION ? motion.div : 'div';
    const BackdropEl = ENABLE_SHEET_MOTION ? motion.div : 'div';
    const sheetMotionProps = ENABLE_SHEET_MOTION
        ? {
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
        }
        : {};
    const backdropMotionProps = ENABLE_SHEET_MOTION
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
        : {};
    const isolationTestId = crashTestId({
        pull: ENABLE_MASCOT_PULL_REFRESH,
        map: ENABLE_MAPBOX,
        motion: ENABLE_SHEET_MOTION,
    });
    const cardMatrixId = renderMatrixTestId({
        map: ENABLE_MAPBOX,
        limit: VENUE_RENDER_LIMIT,
        motion: ENABLE_SHEET_MOTION,
    });

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
                className={`ss-app-root flex h-dvh min-h-0 flex-col overflow-hidden ${mobileMapExpanded ? 'ss-app-root--map-expanded' : ''}`}
                data-crash-isolation={isolationTestId}
                data-render-matrix={cardMatrixId}
                data-mapbox={ENABLE_MAPBOX ? 'on' : 'off'}
                data-sheet-motion={ENABLE_SHEET_MOTION ? 'on' : 'off'}
                data-pull-refresh={ENABLE_MASCOT_PULL_REFRESH ? 'on' : 'off'}
                data-debug-mascot={DEBUG_MASCOT_RENDER ? 'on' : 'off'}
                data-matrix-hud={MATRIX_HUD ? 'on' : 'off'}
                data-venue-limit={VENUE_RENDER_MODE === 'progressive' ? 'progressive' : (VENUE_RENDER_LIMIT ?? 'all')}
                data-venue-window={VENUE_RENDER_MODE}
                data-rendered-venues={renderedVenues.length}
                data-matching-venues={matchingCount}
                data-load-more={hasMoreVenues ? '1' : '0'}
                data-sheet-will-change={SHEET_WILL_CHANGE_MODE}
                data-sheet-backdrop={SHEET_BACKDROP_MODE}
            >
                {DEBUG_MASCOT_RENDER ? <DebugStaticSunny /> : null}
                <IsolationDevLog />
                <WeatherBackground />

                <TopBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onRecenter={handleRecenter}
                    weather={weather}
                    onFiltersOpen={openMobileFilters}
                    comfort={comfort}
                />

                <main className="ss-main relative flex min-h-0 w-full flex-1 overflow-hidden">
                    {/* LEFT: Venue List — desktop sidebar at lg (1024px) only */}
                    <aside className="ss-sidebar hidden h-full w-full flex-col overflow-hidden border-r border-gray-200 bg-white lg:flex lg:w-96">
                        <div className="ss-search-pin px-3 pt-3 pb-1 flex-shrink-0">
                            <VenueSearchInput
                                id="venue-search"
                                value={searchQuery}
                                onChange={setSearchQuery}
                            />
                        </div>

                        {/* Quick-filter pills: Cozy + Sunny (now toggle into activeFilters) */}
                        <div className="ss-quick-filter-row flex flex-shrink-0 gap-2 px-3 py-2">
                            <button
                                onClick={() => handleFilterToggle(FILTER_COZY)}
                                className={`ss-quick-pill ${cozyFilterActive ? 'ss-quick-pill--active' : ''}`}
                                aria-pressed={cozyFilterActive}
                            >
                                🛋️ Cozy
                            </button>
                            <button
                                onClick={() => handleFilterToggle(FILTER_SUNNY)}
                                className={`ss-quick-pill ${sunnyFilterActive ? 'ss-quick-pill--active' : ''}`}
                                aria-pressed={sunnyFilterActive}
                            >
                                ☀️ Sunny
                            </button>
                        </div>

                        <div className="ss-sidebar-count">
                            <span className="inline-flex items-center gap-2">
                                {matchingCount} venue{matchingCount !== 1 ? 's' : ''}
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

                        {!isMobile ? (
                            ENABLE_MASCOT_PULL_REFRESH ? (
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
                                        showLoadMore={hasMoreVenues}
                                        onLoadMore={handleLoadMoreVenues}
                                        selectedVenue={selectedVenue}
                                        onVenueSelect={handleVenueSelect}
                                        weather={weather}
                                        empty={filteredVenues.length === 0 ? (
                                            <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                        ) : null}
                                    />
                                </MascotPullRefresh>
                            ) : (
                                <LiveVenueList
                                    className="ss-venue-list"
                                    virtuosoRef={sidebarVirtuosoRef}
                                    venues={renderedVenues}
                                        showLoadMore={hasMoreVenues}
                                        onLoadMore={handleLoadMoreVenues}
                                    selectedVenue={selectedVenue}
                                    onVenueSelect={handleVenueSelect}
                                    weather={weather}
                                    empty={filteredVenues.length === 0 ? (
                                        <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                    ) : null}
                                />
                            )
                        ) : null}
                    </aside>

                    {/* RIGHT: Map */}
                    <section className={`ss-map-area relative flex min-h-0 flex-1 flex-col ${mobileMapExpanded ? 'ss-map-area--expanded' : ''}`}>
                        <div className="ss-map-container min-h-0 flex-1">
                            {ENABLE_MAPBOX ? (
                                <MapErrorBoundary>
                                    <Suspense fallback={<div className="p-4 text-center">Loading map...</div>}>
                                        <VenueMap
                                            ref={mapRef}
                                            venues={venues}
                                            onVenueSelect={handleVenueSelect}
                                            selectedVenue={selectedVenue}
                                            filteredVenueIds={stableFilteredIds}
                                            liveVenueFeatures={liveVenueFeatures}
                                            weatherColorFn={getMarkerWeatherColor}
                                            cozyWeatherActive={cozyWeatherActive}
                                            cozyFilterActive={cozyFilterActive}
                                            isExpanded={mobileMapExpanded}
                                        />
                                    </Suspense>
                                </MapErrorBoundary>
                            ) : (
                                <div
                                    data-testid="mapbox-isolation-fallback"
                                    className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 bg-slate-900 text-center text-white"
                                >
                                    <span aria-hidden="true">🗺️</span>
                                    <p className="text-sm font-bold">Map isolation fallback</p>
                                    <p className="text-xs text-white/70">ENABLE_MAPBOX is off</p>
                                </div>
                            )}
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
                                        onClearFilters={handleClearFilters}
                                        className="pointer-events-auto"
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Bottom-anchored map controls — clear of the collapsed venue sheet */}
                        <div className="pointer-events-none absolute inset-x-0 z-50 bottom-[calc(env(safe-area-inset-bottom)+90px)] lg:bottom-[46px]">
                            {/* Right column: Locate Me + Recenter + Sunny — Filters+TOD live in VenueMap */}
                            <div className="pointer-events-auto absolute right-4 bottom-0 flex flex-col items-end gap-3">
                                {locateHint && (
                                    <div
                                        role="status"
                                        className="pointer-events-none max-w-[200px] rounded-full bg-slate-900/85 px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_6px_24px_-8px_rgba(15,23,42,0.5)] ring-1 ring-inset ring-white/15 backdrop-blur-xl"
                                    >
                                        {locateHint}
                                    </div>
                                )}
                                {/* Grouped navigation controls — one translucent
                                    material stack with 44px hit areas. */}
                                <div className="flex flex-col overflow-hidden rounded-[22px] border border-white/60 bg-white/70 shadow-[0_6px_24px_-8px_rgba(15,23,42,0.35)] backdrop-blur-xl backdrop-saturate-150 divide-y divide-slate-900/[0.07]">
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
                                    <motion.button
                                        type="button"
                                        className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center text-slate-800 transition-colors active:bg-slate-900/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600"
                                        whileTap={{ scale: 0.92 }}
                                        onClick={handleRecenter}
                                        id="recenter-map"
                                        aria-label="Recenter Melbourne"
                                        title="Recenter Melbourne"
                                    >
                                        <Crosshair size={19} strokeWidth={2.25} />
                                    </motion.button>
                                </div>
                                {!selectedVenue && (
                                    <SunnyMascot
                                        onClick={toggleChat}
                                        isChatOpen={isChatOpen}
                                        className="relative z-50 pointer-events-none"
                                    />
                                )}
                            </div>
                        </div>
                    </section>

                    {selectedVenue && (
                        <VenueCard
                            key={selectedVenue.id}
                            venue={selectedVenue}
                            weather={weather}
                            liveVenueFeatures={selectedVenueLiveFeatures}
                            onClose={handleCloseCard}
                            onCenter={handleVenueSelect}
                            cozyWeatherActive={cozyWeatherActive}
                            setShowOwnerDashboard={setShowOwnerDashboard}
                            setSelectedVenue={setSelectedVenue}
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

                {!mobileMapExpanded && !selectedVenue && (
                    <div
                        className={`ss-mobile-sheet-handle ${mobileSheetState === 'expanded' ? 'ss-mobile-sheet-handle--expanded' : ''}`}
                        onClick={() => setMobileSheetState(prev => prev === 'expanded' ? 'peek' : 'expanded')}
                    >
                        <div className="ss-mobile-sheet-grab" />
                        <span className="inline-flex items-center gap-2">
                            {matchingCount} venues nearby
                            {ENABLE_MANUAL_VENUE_REFRESH ? (
                                <VenueRefreshButton
                                    onRefresh={requestRefresh}
                                    isRefreshing={isRefreshing}
                                />
                            ) : null}
                        </span>
                        {mobileSheetState === 'expanded' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                )}

                {ENABLE_SHEET_MOTION ? (
                <AnimatePresence>
                    {sheetExpanded && (
                        <>
                            <BackdropEl
                                {...backdropMotionProps}
                                onClick={() => setMobileSheetState('peek')}
                                className="ss-mobile-sheet-backdrop"
                            />
                            <SheetEl
                                {...sheetMotionProps}
                                className={sheetClassName}
                                data-sheet-surface={ENABLE_SHEET_MOTION ? 'framer-motion' : 'static-div'}
                                data-sheet-dragging={sheetDragging ? '1' : '0'}
                                data-sheet-will-change={sheetDrag.willChange}
                                data-sheet-backdrop={sheetDrag.backdropFilter}
                            >
                                <div className="ss-mobile-sheet-head">
                                    <div className="ss-mobile-sheet-grab" />
                                    <h3>Venues</h3>
                                    <p className="inline-flex items-center justify-center gap-2">
                                        {matchingCount} results
                                        {ENABLE_MANUAL_VENUE_REFRESH ? (
                                            <VenueRefreshButton
                                                onRefresh={requestRefresh}
                                                isRefreshing={isRefreshing}
                                            />
                                        ) : null}
                                    </p>
                                    {isRefreshing ? <p className="ss-venue-refresh-status">Updating…</p> : null}
                                    {!isRefreshing && refreshFailureVisible(refreshStatus) ? (
                                        <p className="ss-venue-refresh-status ss-venue-refresh-status--error">Couldn't update</p>
                                    ) : null}
                                </div>
                                <div className="ss-mobile-sheet-search flex-shrink-0 px-4 py-2.5 flex flex-col gap-2.5 bg-white/70 border-b border-gray-100" onPointerDownCapture={e => e.stopPropagation()}>
                                    <VenueSearchInput
                                        id="mobile-venue-search"
                                        value={searchQuery}
                                        onChange={setSearchQuery}
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleFilterToggle(FILTER_COZY)}
                                            className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                cozyFilterActive
                                                    ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
                                                    : 'bg-white/90 text-gray-700 border-gray-200/80 hover:bg-gray-50'
                                            }`}
                                            aria-pressed={cozyFilterActive}
                                        >
                                            <span>🛋️</span>
                                            <span>Cozy</span>
                                        </button>
                                        <button
                                            onClick={() => handleFilterToggle(FILTER_SUNNY)}
                                            className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                sunnyFilterActive
                                                    ? 'bg-yellow-100 text-yellow-900 border-yellow-300 shadow-sm'
                                                    : 'bg-white/90 text-gray-700 border-gray-200/80 hover:bg-gray-50'
                                            }`}
                                            aria-pressed={sunnyFilterActive}
                                        >
                                            <span>☀️</span>
                                            <span>Sunny</span>
                                        </button>
                                        {(activeFilters.length > 0 || searchQuery.trim()) && (
                                            <button
                                                onClick={handleClearFilters}
                                                className="min-h-[44px] px-3 py-2 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {ENABLE_MASCOT_PULL_REFRESH ? (
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
                                            showLoadMore={hasMoreVenues}
                                            onLoadMore={handleLoadMoreVenues}
                                            selectedVenue={selectedVenue}
                                            onVenueSelect={handleVenueSelect}
                                            weather={weather}
                                            empty={filteredVenues.length === 0 ? (
                                                <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                            ) : null}
                                        />
                                    </MascotPullRefresh>
                                ) : (
                                    <LiveVenueList
                                        className="ss-mobile-sheet-list"
                                        virtuosoRef={mobileVirtuosoRef}
                                        onPointerDownCapture={stopSheetPointer}
                                        safeAreaFooter
                                        venues={renderedVenues}
                                        showLoadMore={hasMoreVenues}
                                        onLoadMore={handleLoadMoreVenues}
                                        selectedVenue={selectedVenue}
                                        onVenueSelect={handleVenueSelect}
                                        weather={weather}
                                        empty={filteredVenues.length === 0 ? (
                                            <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                        ) : null}
                                    />
                                )}
                            </SheetEl>
                        </>
                    )}
                </AnimatePresence>
                ) : (
                    sheetExpanded ? (
                        <>
                            <div
                                onClick={() => setMobileSheetState('peek')}
                                className="ss-mobile-sheet-backdrop"
                            />
                            <div
                                className={sheetClassName}
                                data-sheet-surface="static-div"
                                data-sheet-dragging={sheetDragging ? '1' : '0'}
                                data-sheet-will-change={sheetDrag.willChange}
                                data-sheet-backdrop={sheetDrag.backdropFilter}
                            >
                                <div className="ss-mobile-sheet-head">
                                    <div className="ss-mobile-sheet-grab" />
                                    <h3>Venues</h3>
                                    <p className="inline-flex items-center justify-center gap-2">
                                        {matchingCount} results
                                        {ENABLE_MANUAL_VENUE_REFRESH ? (
                                            <VenueRefreshButton
                                                onRefresh={requestRefresh}
                                                isRefreshing={isRefreshing}
                                            />
                                        ) : null}
                                    </p>
                                    {isRefreshing ? <p className="ss-venue-refresh-status">Updating…</p> : null}
                                    {!isRefreshing && refreshFailureVisible(refreshStatus) ? (
                                        <p className="ss-venue-refresh-status ss-venue-refresh-status--error">Couldn't update</p>
                                    ) : null}
                                </div>
                                <div className="ss-mobile-sheet-search flex-shrink-0 px-4 py-2.5 flex flex-col gap-2.5 bg-white/70 border-b border-gray-100">
                                    <VenueSearchInput
                                        id="mobile-venue-search"
                                        value={searchQuery}
                                        onChange={setSearchQuery}
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleFilterToggle(FILTER_COZY)}
                                            className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                cozyFilterActive
                                                    ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
                                                    : 'bg-white/90 text-gray-700 border-gray-200/80 hover:bg-gray-50'
                                            }`}
                                            aria-pressed={cozyFilterActive}
                                        >
                                            <span>🛋️</span>
                                            <span>Cozy</span>
                                        </button>
                                        <button
                                            onClick={() => handleFilterToggle(FILTER_SUNNY)}
                                            className={`flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                sunnyFilterActive
                                                    ? 'bg-yellow-100 text-yellow-900 border-yellow-300 shadow-sm'
                                                    : 'bg-white/90 text-gray-700 border-gray-200/80 hover:bg-gray-50'
                                            }`}
                                            aria-pressed={sunnyFilterActive}
                                        >
                                            <span>☀️</span>
                                            <span>Sunny</span>
                                        </button>
                                        {(activeFilters.length > 0 || searchQuery.trim()) && (
                                            <button
                                                onClick={handleClearFilters}
                                                className="min-h-[44px] px-3 py-2 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {ENABLE_MASCOT_PULL_REFRESH ? (
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
                                            showLoadMore={hasMoreVenues}
                                            onLoadMore={handleLoadMoreVenues}
                                            selectedVenue={selectedVenue}
                                            onVenueSelect={handleVenueSelect}
                                            weather={weather}
                                            empty={filteredVenues.length === 0 ? (
                                                <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                            ) : null}
                                        />
                                    </MascotPullRefresh>
                                ) : (
                                    <LiveVenueList
                                        className="ss-mobile-sheet-list"
                                        virtuosoRef={mobileVirtuosoRef}
                                        onPointerDownCapture={stopSheetPointer}
                                        safeAreaFooter
                                        venues={renderedVenues}
                                        showLoadMore={hasMoreVenues}
                                        onLoadMore={handleLoadMoreVenues}
                                        selectedVenue={selectedVenue}
                                        onVenueSelect={handleVenueSelect}
                                        weather={weather}
                                        empty={filteredVenues.length === 0 ? (
                                            <EmptyVenueState announce onClearFilters={handleClearFilters} />
                                        ) : null}
                                    />
                                )}
                            </div>
                        </>
                    ) : null
                )}

                <ChatWidget
                    isOpen={isChatOpen}
                    onClose={closeChat}
                    weather={weather}
                    selectedVenue={selectedVenue}
                    onSetFilters={handleSunnySetFilters}
                    onPanToVenue={handleSunnyPanToVenue}
                    onFindWheelchair={handleFindWheelchair}
                    onFindDogFriendly={handleFindDogFriendly}
                    onFindSmoking={handleFindSmoking}
                    onSurpriseMe={handleSurpriseMe}
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
                    className={`ss-footer-badge ${selectedVenue ? 'hidden' : ''}`}
                >
                    <img src={fireIconImg} alt="" className="ss-footer-badge-icon" />
                    Sales Demo · {venues.length} Partner Venues
                </motion.div>
            </div>
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
