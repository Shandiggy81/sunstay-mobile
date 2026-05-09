import React, { useState, Component, useRef, useCallback, useMemo, useEffect, Suspense, memo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import WeatherBackground from './components/WeatherBackground';
import VenueMap from './components/Map/VenueMap';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import TopBar from './components/TopBar';
import FilterSheet from './components/FilterSheet';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronUp, ChevronDown, Search,
    Wind, Sun, Cloud, X, Locate, ListFilter
} from 'lucide-react';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import OwnerDashboard from './components/OwnerDashboard';
import SplashScreen from './components/SplashScreen';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';
import { getComfortLevel } from './utils/weatherService';
import sunBadgeImg from './assets/sun-badge.jpg';
import fireIconImg from './assets/fire-icon.jpg';
import mascotLogoImg from './assets/sunny-mascot.jpg';
import MapErrorBoundary from './components/MapErrorBoundary';

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

// ── Weather badge helpers (pure functions, defined outside component) ──
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
    } catch {
        // Browser storage can be unavailable in private mode.
    }
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
    } catch {
        // Non-fatal; the splash will simply show again next load.
    }
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

// ── VenueListCard — memo so it only re-renders when its own props change ──
// FIX: was re-rendering every card on every weather tick and every parent state change.
// Now stable: only re-renders when venue, isSelected, or weather object identity changes.
// weather is passed by reference from WeatherContext which only updates every 5 minutes.
const VenueListCard = memo(({ venue, isSelected, onClick, weather }) => {
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
            onClick={(e) => {
                if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
                onClick(e);
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

// ── VenueChip ─────────────────────────────────────────────────────
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

// ═════════════════════════════════════════════════════════════════
const AppContent = () => {
    const [splashDone, setSplashDone] = useState(hasSeenSplash);
    const { weather, getUVIndex } = useWeather();

    const comfort = useMemo(() => {
        if (!weather) return { label: 'Loading', icon: '☁️', cozy: false };
        return getComfortLevel({
            apparentTemp: weather.apparentTemp,
            precipProbability: weather.precipProbability,
            windGusts: weather.windGusts
        });
    }, [weather]);

    const [selectedVenue, setSelectedVenue]         = useState(null);
    const [isChatOpen, setIsChatOpen]               = useState(false);
    const [activeFilters, setActiveFilters]         = useState([]);
    const [activeFilter, setActiveFilter]           = useState('All');
    const [showOwnerDashboard, setShowOwnerDashboard] = useState(false);
    const [liveVenueFeatures, setLiveVenueFeatures] = useState({});

    // FIX A: debouncedLiveFeatures removed — 100ms debounce was causing a SECOND
    // render burst. The map already uses a ref-based callback so it doesn't care
    // about render frequency. Pass liveVenueFeatures directly.

    // Auto-enable cozy mode
    useEffect(() => {
        if (comfort.cozy) setActiveFilter('Cozy');
    }, [comfort.cozy]);

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

    const [mobileMapExpanded, setMobileMapExpanded]   = useState(false);
    const [mobileSheetState, setMobileSheetState]     = useState('peek');
    const [mapQuickFilter, setMapQuickFilter]         = useState(null);
    const [mobileFilterOpen, setMobileFilterOpen]     = useState(false);
    const [searchQuery, setSearchQuery]               = useState('');

    const mapRef  = useRef(null);
    const listRef = useRef(null);

    const openMobileFilters  = useCallback((e) => { e?.stopPropagation(); setMobileFilterOpen(true); }, []);
    const closeMobileFilters = useCallback((e) => { e?.preventDefault(); e?.stopPropagation(); setMobileFilterOpen(false); }, []);

    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        if (weather.minTemp == null || weather.precipitation == null) return false;
        return weather.minTemp < 8 || weather.precipitation > 0.5 || (weather.windSpeed || 0) > 15;
    }, [weather]);

    const filteredVenueIds = useMemo(() => {
        const filters = activeFilters || [];
        const typeFilters   = filters.filter(f => f.startsWith('all-'));
        const intentFilters = filters.filter(f => f.startsWith('sun-'));
        const tagFilters    = filters.filter(f => !f.startsWith('all-') && !f.startsWith('sun-'));
        const categoryData  = FILTER_CATEGORIES;

        return demoVenues
            .filter(v => {
                const vType = v.typeCategory || 'Bar';
                const hasTypeMatch = typeFilters.length === 0 || typeFilters.some(f => {
                    if (f === 'all-bars'   && vType === 'Bar')       return true;
                    if (f === 'all-hotels' && vType === 'Hotel')     return true;
                    if (f === 'all-stays'  && vType === 'ShortStay') return true;
                    return false;
                });
                if (!hasTypeMatch) return false;

                if (intentFilters.length > 0) {
                    const rooms = v.roomTypes || [];
                    const hasRoomMatch = rooms.some(room => intentFilters.some(intentId => {
                        if (intentId === 'sun-morning')  return room.sunProfile?.useCase === 'Morning coffee' && (room.hasBalcony || room.hasOutdoorArea);
                        if (intentId === 'sun-sunset')   return room.sunProfile?.useCase === 'Sunset drinks' && (room.hasBalcony || room.hasOutdoorArea);
                        if (intentId === 'sun-allday')   return room.sunScore >= 70 && (room.sunProfile?.summerHours >= 6 || room.sunProfile?.winterHours >= 4) && ['N','NE','NW'].includes(room.orientation);
                        if (intentId === 'sun-shaded')   return room.sunProfile?.useCase === 'Shade retreat' || room.sunScore <= 40;
                        if (intentId === 'sun-highfloor') return (room.floorLevel || 0) >= 8 && room.obstructionLevel === 'Open' && room.hasBalcony;
                        return false;
                    }));
                    if (!hasRoomMatch) return false;
                }

                const vTags = v.tags || [];
                const hasTagMatch = tagFilters.length === 0 || tagFilters.some(id => {
                    const filter = categoryData.find(c => c.id === id);
                    return filter ? vTags.includes(filter.tag) : false;
                });
                return hasTagMatch;
            })
            .filter(v => !activeFilters.includes('cozy-mode') || v.hasCozy)
            .map(v => v.id);
    }, [activeFilters]);

    // FIX B: filteredVenues no longer depends on liveVenueFeatures for map rendering.
    // The map pins update via liveVenueFeatures prop directly. Removing it here
    // prevents the entire venue list + map from re-rendering every time a heater toggle fires.
    const filteredVenues = useMemo(() => {
        return demoVenues.filter((venue) => {
            if (activeFilter !== 'All') {
                if (activeFilter === 'Cozy') {
                    const liveState = liveVenueFeatures?.[venue.id] || {};
                    const hasLiveCozy = liveState.fireplaceOn || liveState.heatersOn || liveState.roofClosed;
                    const hasStaticCozy =
                        (venue.shielding?.rainCover ?? 0) > 80 ||
                        venue.tags?.some(t => ['cozy','covered','indoor'].includes(t.toLowerCase())) ||
                        venue.hasCozy;
                    if (!hasLiveCozy && !hasStaticCozy) return false;
                }
                if (activeFilter === 'Sunny') {
                    const liveState = liveVenueFeatures?.[venue.id] || {};
                    const roofClosed = !!liveState.roofClosed;
                    const uvIndexValue = getUVIndex() || 0;
                    if (uvIndexValue < 4 || roofClosed) return false;
                }
            }
            if (activeFilters.length > 0 && !filteredVenueIds.includes(venue.id)) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesSearch =
                    venue.venueName.toLowerCase().includes(q) ||
                    venue.suburb?.toLowerCase().includes(q) ||
                    venue.vibe?.toLowerCase().includes(q);
                if (!matchesSearch) return false;
            }
            return true;
        });
    }, [activeFilter, activeFilters, filteredVenueIds, liveVenueFeatures, searchQuery, getUVIndex]);

    const matchingCount = filteredVenues.length;

    // FIX C: filteredVenueIds prop to VenueMap was previously `filteredVenues.map(v => v.id)`
    // which creates a NEW array reference on every render (even if content is identical),
    // triggering the marker sync effect unnecessarily. Now we pass a stable memoised array.
    const stableFilteredIds = useMemo(
        () => filteredVenues.map(v => v.id),
        [filteredVenues]
    );

    const handleVenueSelect = useCallback((venue) => {
        if (!venue) return;
        setSelectedVenue(venue);
        const lng = Number(venue.lng);
        const lat = Number(venue.lat);
        if (mapRef.current?.flyTo && Number.isFinite(lng) && Number.isFinite(lat)) {
            mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
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
        setMapQuickFilter(null);
    }, []);

    // Chat quick-actions
    const makeChatFilter = (filter) => () => {
        setActiveFilters([filter]);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    };
    const handleFindWheelchair   = useCallback(makeChatFilter('wheelchair'), []);
    const handleFindDogFriendly  = useCallback(makeChatFilter('pet-friendly'), []);
    const handleFindSmoking      = useCallback(makeChatFilter('smoking'), []);
    const handleFindFamily       = useCallback(makeChatFilter('pram-friendly'), []);
    const handleFindBusiness     = useCallback(makeChatFilter('Large Groups'), []);
    const handleFindSunny        = useCallback(makeChatFilter('full-sun'), []);
    const handleFindRooftop      = useCallback(makeChatFilter('rooftop'), []);
    const handleFindIndoor       = useCallback(makeChatFilter('shade'), []);
    const handleFindWindSheltered = useCallback(makeChatFilter('shade'), []);

    const handleSurpriseMe = useCallback(() => {
        const randomVenue = demoVenues[Math.floor(Math.random() * demoVenues.length)];
        setActiveFilters([]);
        handleVenueSelect(randomVenue);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, [handleVenueSelect]);

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

    return (
        <>
            {!splashDone && (
                <SplashScreen onComplete={() => {
                    markSplashSeen();
                    setSplashDone(true);
                }} />
            )}
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
                        <OwnerDashboard
                            venue={selectedVenue}
                            liveVenueFeatures={liveVenueFeatures}
                            setLiveVenueFeatures={setLiveVenueFeatures}
                            onClose={handleOwnerDashboardClose}
                            onVenueUpdate={handleSelectedVenueUpdate}
                        />
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

                        <div className="ss-sidebar-count">
                            <span>{matchingCount} venue{matchingCount !== 1 ? 's' : ''}</span>
                            {(activeFilters.length > 0 || mapQuickFilter) && (
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
                                        onClick={() => handleVenueSelect(venue)}
                                        weather={weather}
                                    />
                                ))}
                            </AnimatePresence>
                            {filteredVenues.length === 0 && (
                                <div className="ss-venue-list-empty">
                                    <span>🔍</span>
                                    <p>No exact match — showing all venues</p>
                                    <button onClick={handleClearFilters}>Show all venues</button>
                                </div>
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
                                    {/* FIX C: pass stableFilteredIds not filteredVenues.map(v=>v.id) inline */}
                                    <VenueMap
                                        ref={mapRef}
                                        venues={filteredVenues}
                                        onVenueSelect={handleVenueSelect}
                                        selectedVenue={selectedVenue}
                                        filteredVenueIds={stableFilteredIds}
                                        liveVenueFeatures={liveVenueFeatures}
                                        weatherColorFn={getMarkerWeatherColor}
                                        cozyWeatherActive={cozyWeatherActive}
                                        cozyFilterActive={activeFilter === 'Cozy'}
                                        isExpanded={mobileMapExpanded}
                                    />
                                </Suspense>
                            </MapErrorBoundary>
                        </div>

                        <motion.button
                            className="ss-recenter-btn"
                            whileTap={{ scale: 0.9 }}
                            onClick={handleRecenter}
                            id="recenter-map"
                        >
                            <Locate size={18} />
                        </motion.button>

                        <div className="ss-map-filters-row absolute bottom-40 left-1/2 -translate-x-1/2 z-20 flex gap-2 w-full px-4 justify-center pr-16">
                            {[['All', '🌐 All', 'bg-sky-600 text-white border-sky-600 scale-105', 'bg-white/90 backdrop-blur text-sky-700 border-sky-100 hover:bg-sky-50'],
                              ['Sunny', '☀️ Sunny Patios', 'bg-amber-400 text-amber-950 border-amber-500 scale-105', 'bg-white/90 backdrop-blur text-amber-700 border-amber-100 hover:bg-amber-50'],
                              ['Cozy', '🔥 Cozy & Covered', 'bg-orange-600 text-white border-orange-700 scale-105', 'bg-white/90 backdrop-blur text-orange-700 border-orange-100 hover:bg-orange-50'],
                            ].map(([key, label, activeClass, inactiveClass]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveFilter(key)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-all ${
                                        activeFilter === key ? activeClass : inactiveClass
                                    }`}
                                >{label}</button>
                            ))}
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
                </main>

                {/* Mobile bottom sheet handle */}
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
                                <div className="ss-mobile-sheet-list">
                                    {filteredVenues.map(venue => (
                                        <VenueListCard
                                            key={venue.id}
                                            venue={venue}
                                            isSelected={selectedVenue?.id === venue.id}
                                            onClick={() => { handleVenueSelect(venue); setMobileSheetState('peek'); }}
                                            weather={weather}
                                        />
                                    ))}
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
                    Sales Demo · {demoVenues.length} Partner Venues
                </motion.div>
            </div>
        </>
    );
};

// ── Error Boundary ──────────────────────────────────────────────────
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
