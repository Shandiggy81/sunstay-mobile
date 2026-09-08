import React, { useState, Component, useRef, useCallback, useMemo, useEffect, Suspense, lazy, memo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
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
    Wind, Sun, Cloud, X, Locate, ListFilter
} from 'lucide-react';
import { useVenues } from './hooks/useVenues';
import { useVenueFeatures } from './hooks/useVenueFeatures';
import SplashScreen from './components/SplashScreen';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';
import { getComfortLevel } from './utils/weatherService';
import { getSunData } from './utils/getSunData';
import sunBadgeImg from './assets/sun-badge.jpg';
import fireIconImg from './assets/fire-icon.jpg';
import mascotLogoImg from './assets/sunny-mascot.jpg';
import MapErrorBoundary from './components/MapErrorBoundary';

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

const getMarkerWeatherColor = (weather, venue) => {
    if (!weather) return 'sunny';
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'red' || windWarning.level === 'orange') return 'windy';
    if (condition.includes('rain') || condition.includes('drizzle')) return 'cloudy';
    if (condition.includes('cloud')) return 'cloudy';
    return 'sunny';
};

// ── VenueListCard ──────────────────────────────────────────────────────
const VenueListCard = memo(({ venue, isSelected, onVenueSelect, weather }) => {
    const badge = useMemo(() => getWeatherBadge(weather, venue), [weather, venue]);
    const profile = useMemo(() => getWindProfile(venue), [venue]);
    const temp = weather?.main?.temp;
    const feelsLike = temp != null
        ? Math.round(calculateApparentTemp(temp, weather?.wind?.speed, weather?.main?.humidity, profile.shelterFactor))
        : null;
    const comfort = feelsLike != null ? getComfortZone(feelsLike) : null;

    const isStay = venue.typeCategory === 'ShortStay';
    const isHotel = venue.typeCategory === 'Hotel';

    return (
        <motion.div
            layout
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
                onVenueSelect(venue);
            }}
            role="button"
            aria-label={`Venue: ${venue.venueName}. ${isStay || isHotel ? venue.typeLabel : venue.vibe} in ${venue.suburb}.`}
            className={`ss-venue-list-card relative overflow-hidden ${isSelected ? 'ss-venue-list-card--active' : ''}`}
            id={`venue-list-${venue.id}`}
        >
            <div className="ss-vlc-emoji">{venue.emoji}</div>
            <div className="ss-vlc-body">
                <div className="ss-vlc-name">{venue.venueName}</div>
                <div className="ss-vlc-sub">
                    {isStay || isHotel ? venue.typeLabel : venue.vibe} · {venue.suburb}
                </div>
            </div>
            <div className="ss-vlc-right">
                <div className="ss-vlc-badge" style={{ background: badge.color + '18', color: badge.color }}>
                    <span>{badge.emoji}</span>
                    <span>{badge.label}</span>
                </div>
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

const FilterEmptyState = ({ onClear }) => (
    <div className="ss-venue-list-empty flex flex-col items-center justify-center p-6 text-center">
        <img src="/sunny-mascot.jpg" alt="" className="ss-venue-list-empty-mascot w-20 h-20 rounded-full mb-3 shadow-md" />
        <p className="text-base font-black text-slate-900 mb-1">No venues match exactly.</p>
        <p className="ss-venue-list-empty-sub text-xs text-slate-500 mb-4 max-w-xs">
            Try adjusting your filters or search query to explore other Melbourne spots.
        </p>
        <button
            type="button"
            onClick={onClear}
            className="min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
            aria-label="Clear All Filters"
        >
            <span>✨</span>
            <span>Clear All Filters</span>
        </button>
    </div>
);

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
    const { weather } = useWeather();
    const { venues } = useVenues();
    const { liveVenueFeatures, updateLiveVenueFeature } = useVenueFeatures();

    const comfort = useMemo(() => {
        if (!weather) return { label: 'Loading', icon: '☁️', cozy: false };
        return getComfortLevel({
            apparentTemp: weather.apparentTemp,
            precipProbability: weather.precipProbability,
            windGusts: weather.windGusts
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

    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize, { passive: true });
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
    const [mobileSheetState, setMobileSheetState]   = useState('peek');
    const [mobileFilterOpen, setMobileFilterOpen]   = useState(false);
    const [searchQuery, setSearchQuery]             = useState('');

    const mapRef  = useRef(null);
    const listRef = useRef(null);

    const openMobileFilters  = useCallback((e) => { e?.stopPropagation(); setMobileFilterOpen(true); }, []);
    const closeMobileFilters = useCallback((e) => { e?.preventDefault(); e?.stopPropagation(); setMobileFilterOpen(false); }, []);

    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        if (weather.minTemp == null || weather.precipitation == null) return false;
        return weather.minTemp < 8 || weather.precipitation > 0.5 || (weather.windSpeed || 0) > 15;
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
        const query = searchQuery.trim().toLowerCase();

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

            if (query) {
                const matchesSearch =
                    venue.venueName.toLowerCase().includes(query) ||
                    venue.suburb?.toLowerCase().includes(query) ||
                    venue.vibe?.toLowerCase().includes(query);
                if (!matchesSearch) return false;
            }

            return true;
        });
    }, [venues, activeFilters, cozyFilterActive, sunnyFilterActive, liveVenueFeatures, searchQuery, weather?.uvi]);

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
        setSelectedVenue(venue);
        setMobileSheetState('peek');
        const lng = Number(venue.lng);
        const lat = Number(venue.lat);
        if (mapRef.current?.resizeAndFly && Number.isFinite(lng) && Number.isFinite(lat)) {
            mapRef.current.resizeAndFly([lng, lat]);
        }
    }, []);

    const handleCloseCard  = useCallback(() => setSelectedVenue(null), []);
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

    const handleRecenter = useCallback(() => {
        mapRef.current?.flyTo({ center: [144.9631, -37.8136], zoom: 12, duration: 1200 });
    }, []);

    useEffect(() => {
        if (selectedVenue && listRef.current) {
            const el = listRef.current.querySelector(`#venue-list-${selectedVenue.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
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

    return (
        <>
            {!splashDone && (
                <SplashScreen onComplete={() => {
                    markSplashSeen();
                    setSplashDone(true);
                }} />
            )}

            <NotificationCenter
                venue={selectedVenue}
                weather={weather}
                sunData={selectedVenueSunData}
                score={selectedVenueScore}
            />

            <div className={`ss-app-root ${mobileMapExpanded ? 'ss-app-root--map-expanded' : ''}`}>
                <WeatherBackground />

                <TopBar
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onRecenter={handleRecenter}
                    weather={weather}
                    onFiltersOpen={openMobileFilters}
                    comfort={comfort}
                />

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

                <main className="ss-main flex h-full w-full overflow-hidden">
                    {/* LEFT: Venue List */}
                    <aside className="ss-sidebar w-full md:w-96 h-full overflow-y-auto flex flex-col bg-white border-r border-gray-200">
                        <div className="ss-search-wrap">
                            <Search size={15} className="ss-search-icon" />
                            <input
                                type="text"
                                placeholder="Search venues, suburbs…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="ss-search-input"
                                id="venue-search"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="ss-search-clear">
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Quick-filter pills: Cozy + Sunny (now toggle into activeFilters) */}
                        <div className="ss-quick-filter-row flex gap-2 px-3 py-2">
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
                            <span>{matchingCount} venue{matchingCount !== 1 ? 's' : ''}</span>
                            {activeFilters.length > 0 && (
                                <button onClick={handleClearFilters} className="ss-sidebar-clear">Clear all</button>
                            )}
                        </div>

                        <div className="ss-venue-list" ref={listRef}>
                            <AnimatePresence mode="popLayout">
                                {filteredVenues.map(venue => (
                                    <VenueListCard
                                        key={venue.id}
                                        venue={venue}
                                        isSelected={selectedVenue?.id === venue.id}
                                        onVenueSelect={handleVenueSelect}
                                        weather={weather}
                                    />
                                ))}
                            </AnimatePresence>
                            {filteredVenues.length === 0 && (
                                <FilterEmptyState onClear={handleClearFilters} />
                            )}
                        </div>
                    </aside>

                    {/* RIGHT: Map */}
                    <section className={`ss-map-area flex-1 h-full relative ${mobileMapExpanded ? 'ss-map-area--expanded' : ''}`}>
                        <button
                            className="ss-filters-fab"
                            onClick={openMobileFilters}
                            disabled={mobileFilterOpen}
                            aria-expanded={mobileFilterOpen}
                        >
                            <ListFilter size={18} />
                            <span>Filters</span>
                            {activeFilters.length > 0 && (
                                <span className="ss-filters-fab-badge">{activeFilters.length}</span>
                            )}
                        </button>

                        <div className="ss-map-container">
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
                        </div>

                        {/* Zero-Results Filter Overlay */}
                        <AnimatePresence>
                            {filteredVenues.length === 0 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm pointer-events-none"
                                >
                                    <motion.div
                                        initial={{ scale: 0.92, y: 12, opacity: 0 }}
                                        animate={{ scale: 1, y: 0, opacity: 1 }}
                                        exit={{ scale: 0.92, y: 12, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                                        className="pointer-events-auto max-w-sm w-full bg-white/95 backdrop-blur-md rounded-3xl p-6 shadow-2xl border border-white/60 text-center flex flex-col items-center gap-3.5"
                                    >
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-300 flex items-center justify-center text-3xl shadow-inner">
                                            ☀️
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-black text-slate-900 tracking-tight">
                                                No venues match exactly.
                                            </h3>
                                            <p className="text-xs text-slate-600 mt-1.5 font-medium leading-relaxed">
                                                We couldn't find any Melbourne venues matching your selected filters and weather conditions.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleClearFilters}
                                            className="w-full min-h-[48px] px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black text-sm shadow-md shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer touch-manipulation"
                                            aria-label="Clear All Filters"
                                        >
                                            <span>✨</span>
                                            <span>Clear All Filters</span>
                                        </button>
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <motion.button
                            className="ss-recenter-btn"
                            whileTap={{ scale: 0.9 }}
                            onClick={handleRecenter}
                            id="recenter-map"
                        >
                            <Locate size={18} />
                        </motion.button>
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
                        <span>{matchingCount} venues nearby</span>
                        {mobileSheetState === 'expanded' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                )}

                <AnimatePresence>
                    {mobileSheetState === 'expanded' && !selectedVenue && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                onClick={() => setMobileSheetState('peek')}
                                className="ss-mobile-sheet-backdrop"
                            />
                            <motion.div
                                drag="y"
                                dragConstraints={{ top: 0, bottom: 0 }}
                                dragElastic={0.1}
                                onDragEnd={(_, { offset, velocity }) => {
                                    if (offset.y > 100 || velocity.y > 500) setMobileSheetState('peek');
                                }}
                                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="ss-mobile-sheet"
                            >
                                <div className="ss-mobile-sheet-head">
                                    <div className="ss-mobile-sheet-grab" />
                                    <h3>Venues</h3>
                                    <p>{matchingCount} results</p>
                                </div>
                                <div className="px-4 py-2.5 flex flex-col gap-2.5 bg-white/70 border-b border-gray-100" onPointerDownCapture={e => e.stopPropagation()}>
                                    <div className="relative flex items-center">
                                        <Search size={16} className="absolute left-3.5 text-gray-400 pointer-events-none z-10" />
                                        <input
                                            type="text"
                                            placeholder="Search venues, suburbs…"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-10 pr-9 py-2.5 min-h-[44px] rounded-xl border border-gray-200/80 bg-white/95 text-sm font-semibold text-gray-800 placeholder-gray-400 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all shadow-sm"
                                            id="mobile-venue-search"
                                        />
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-2.5 w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors"
                                                aria-label="Clear search"
                                            >
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
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
                                        {activeFilters.length > 0 && (
                                            <button
                                                onClick={handleClearFilters}
                                                className="min-h-[44px] px-3 py-2 text-xs font-bold text-amber-600 hover:text-amber-700 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="ss-mobile-sheet-list" onPointerDownCapture={e => e.stopPropagation()}>
                                    {filteredVenues.map(venue => (
                                        <VenueListCard
                                            key={venue.id}
                                            venue={venue}
                                            isSelected={selectedVenue?.id === venue.id}
                                            onVenueSelect={handleVenueSelect}
                                            weather={weather}
                                        />
                                    ))}
                                    {filteredVenues.length === 0 && (
                                        <FilterEmptyState onClear={handleClearFilters} />
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                <ChatWidget
                    isOpen={isChatOpen}
                    onClose={closeChat}
                    weather={weather}
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

                {!selectedVenue && <SunnyMascot onClick={toggleChat} isChatOpen={isChatOpen} />}

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

// ── Error Boundary ────────────────────────────────────────────────────
class ErrorBoundary extends Component {
    state = { hasError: false, error: null };
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.error('Sunstay Error:', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-6">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        className="text-center max-w-md bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl"
                    >
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-2xl font-black text-gray-800 mb-2">Oops! Something went wrong</h2>
                        <p className="text-gray-600 mb-4 text-sm">{this.state.error?.message || 'An unexpected error occurred.'}</p>
                        <button onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-xl shadow-lg"
                        >☀️ Reload App</button>
                    </motion.div>
                </div>
            );
        }
        return this.props.children;
    }
}

const App = () => (
    <ErrorBoundary>
        <WeatherProvider>
            <AppContent />
        </WeatherProvider>
    </ErrorBoundary>
);

export default App;
