import React, { useState, Component, useRef, useCallback, useMemo, useEffect } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import WeatherBackground from './components/WeatherBackground';
import MapView from './components/MapView';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import TopBar from './components/TopBar';
import FilterSheet from './components/FilterSheet';
import NotificationCenter from './components/NotificationCenter';
import WeatherWidget from './components/WeatherWidget';
import SunArcWidget from './components/SunArcWidget';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronUp, ChevronDown, Search,
    Wind, Sun, Cloud, X, Locate, ListFilter
} from 'lucide-react';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import { venues } from './data/venues';
import OwnerDashboard from './components/OwnerDashboard';
import SplashScreen from './components/SplashScreen';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';
import sunBadgeImg from './assets/sun-badge.jpg';
import fireIconImg from './assets/fire-icon.jpg';
import mascotLogoImg from './assets/sunny-mascot.jpg';
import MapErrorBoundary from './components/MapErrorBoundary';

// Loading fallback component
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

// ── Weather badge for venue list cards ────────────────────────────
const getWeatherBadge = (weather, venue) => {
    if (!weather) return { emoji: '🌤️', label: 'Fair', color: '#9ca3af' };
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);

    if (windWarning.level === 'red' || windWarning.level === 'orange') {
        return { emoji: '💨', label: 'Windy', color: '#3b82f6' };
    }
    if (condition.includes('rain') || condition.includes('drizzle')) {
        return { emoji: '🌧️', label: 'Rain', color: '#6b7280' };
    }
    if (condition.includes('clear') || condition.includes('sunny')) {
        return { emoji: '☀️', label: 'Sunny', color: '#f59e0b' };
    }
    if (condition.includes('cloud')) {
        return { emoji: '☁️', label: 'Cloudy', color: '#9ca3af' };
    }
    return { emoji: '🌤️', label: 'Fair', color: '#f59e0b' };
};

// Get marker color class based on weather
const getMarkerWeatherColor = (weather, venue) => {
    if (!weather) return 'sunny';
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'red' || windWarning.level === 'orange') return 'windy';
    if (condition.includes('rain') || condition.includes('drizzle')) return 'cloudy';
    if (condition.includes('cloud')) return 'cloudy';
    return 'sunny';
};


// ── Venue List Card (sidebar) ────────────────────────────────────
const VenueListCard = ({ venue, isSelected, onClick, weather }) => {
    const badge = getWeatherBadge(weather, venue);
    const profile = getWindProfile(venue);
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
            aria-label={`Venue: ${venue.venueName}. ${isStay || isHotel ? venue.typeLabel : venue.vibe} in ${venue.suburb}. Sunstay Status: ${badge.label}`}
            className={`ss-venue-list-card relative overflow-hidden ${isSelected ? 'ss-venue-list-card--active' : ''}`}
            id={`venue-list-${venue.id}`}
        >
            {/* Shimmer Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer pointer-events-none will-change-transform" style={{ backgroundSize: '200% 100%' }} />

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
};

// ── Mobile venue chip (horizontal scroll) ──────────────────────
const VenueChip = ({ venue, isSelected, onClick, weather }) => {
    const badge = getWeatherBadge(weather, venue);
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
            {/* Shimmer Effect (Subtle) */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-shimmer pointer-events-none will-change-transform" style={{ backgroundSize: '200% 100%' }} />

            <span>{venue.emoji}</span>
            <span className="ss-venue-chip-name">{venue.venueName.length > 16 ? venue.venueName.slice(0, 15) + '…' : venue.venueName}</span>
            <span className="ss-venue-chip-badge" style={{ color: badge.color }}>{badge.emoji}</span>
        </motion.button>
    );
};

// ═══════════════════════════════════════════════════════════════════
// Main App Content
// ═══════════════════════════════════════════════════════════════════
const AppContent = () => {
    const [splashDone, setSplashDone] = useState(() => sessionStorage.getItem('splashShown') === 'true');
    const { weather, getUVIndex } = useWeather();
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    // Initial filters: empty to show all venues by default
    const [activeFilters, setActiveFilters] = useState([]);
    const [activeFilter, setActiveFilter] = useState('All');
    const [showOwnerDashboard, setShowOwnerDashboard] = useState(false);
    const [liveVenueFeatures, setLiveVenueFeatures] = useState({});
    const [debouncedLiveFeatures, setDebouncedLiveFeatures] = useState({});

    // Debounce live feature updates for the map to prevent "wake up" lag
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedLiveFeatures(liveVenueFeatures);
        }, 100);
        return () => clearTimeout(timer);
    }, [liveVenueFeatures]);

    // Custom filters
    const [customFilters, setCustomFilters] = useState(
      JSON.parse(localStorage.getItem('sunstay-custom-filters') || '[]')
    );
    const [newFilter, setNewFilter] = useState('');

    const addCustomFilter = () => {
      if (!newFilter.trim()) return;
      const updated = [...customFilters, newFilter.trim()];
      setCustomFilters(updated);
      localStorage.setItem('sunstay-custom-filters', JSON.stringify(updated));
      setNewFilter('');
    };

    // FIX: isMobile is now reactive — updates on window resize
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
    const [mobileSheetState, setMobileSheetState] = useState('peek'); // 'peek', 'expanded', 'closed'
    const [mapQuickFilter, setMapQuickFilter] = useState(null);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

    const openMobileFilters = useCallback((e) => {
        if (e) e.stopPropagation();
        setMobileFilterOpen(true);
    }, []);

    const closeMobileFilters = useCallback((e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setMobileFilterOpen(false);
    }, []);

    const [searchQuery, setSearchQuery] = useState('');
    const mapRef = useRef(null);
    const listRef = useRef(null);

    // Calculate cozy weather conditions
    const cozyWeatherActive = useMemo(() => {
        if (!weather) return false;
        const minTemp = weather.minTemp || 20;
        const precip = weather.precipitation || 0;
        const wind = weather.windSpeed || 0;
        return minTemp < 8 || (precip > 0.5 || wind > 15);
    }, [weather]);

    // Calculate filtered venue IDs based on active filters (Types + Intents + Tags)
    const filteredVenueIds = useMemo(() => {
        const filters = activeFilters || [];
        const typeFilters = filters.filter(f => f.startsWith('all-'));
        const intentFilters = filters.filter(f => f.startsWith('sun-'));
        const tagFilters = filters.filter(f => !f.startsWith('all-') && !f.startsWith('sun-'));

        const categoryData = FILTER_CATEGORIES;

        return demoVenues
            .filter(v => {
                const vType = v.typeCategory || 'Bar';
                const hasTypeMatch = typeFilters.length === 0 || typeFilters.some(f => {
                    if (f === 'all-bars' && vType === 'Bar') return true;
                    if (f === 'all-hotels' && vType === 'Hotel') return true;
                    if (f === 'all-stays' && vType === 'ShortStay') return true;
                    return false;
                });
                if (!hasTypeMatch) return false;

                if (intentFilters.length > 0) {
                    const rooms = v.roomTypes || [];
                    const hasRoomMatch = rooms.some(room => {
                        return intentFilters.some(intentId => {
                            if (intentId === 'sun-morning') {
                                return room.sunProfile?.useCase === "Morning coffee" && (room.hasBalcony || room.hasOutdoorArea);
                            }
                            if (intentId === 'sun-sunset') {
                                return room.sunProfile?.useCase === "Sunset drinks" && (room.hasBalcony || room.hasOutdoorArea);
                            }
                            if (intentId === 'sun-allday') {
                                return room.sunScore >= 70 &&
                                    (room.sunProfile?.summerHours >= 6 || room.sunProfile?.winterHours >= 4) &&
                                    ["N", "NE", "NW"].includes(room.orientation);
                            }
                            if (intentId === 'sun-shaded') {
                                return room.sunProfile?.useCase === "Shade retreat" || room.sunScore <= 40;
                            }
                            if (intentId === 'sun-highfloor') {
                                return (room.floorLevel || 0) >= 8 && room.obstructionLevel === "Open" && room.hasBalcony;
                            }
                            return false;
                        });
                    });
                    if (!hasRoomMatch) return false;
                }

                const vTags = v.tags || [];
                const hasTagMatch = tagFilters.length === 0 || tagFilters.some(id => {
                    const filter = categoryData.find(c => c.id === id);
                    return filter ? vTags.includes(filter.tag) : false;
                });

                return hasTagMatch;
            })
            .filter(v => {
                if (!activeFilters.includes('cozy-mode')) return true;
                return v.hasCozy;
            })
            .map(v => v.id);
    }, [activeFilters]);

    // FIX: filteredVenues now correctly depends on debouncedLiveFeatures (not liveVenueFeatures)
    // and weather dep removed since only getUVIndex() (from context) is used directly
    const filteredVenues = useMemo(() => {
        return demoVenues.filter((venue) => {
            const liveState = debouncedLiveFeatures?.[venue.id] || {};

            if (activeFilter !== 'All') {
                if (activeFilter === 'Cozy') {
                    const hasLiveCozy = liveState.fireplaceOn || liveState.heatersOn || liveState.roofClosed;
                    const hasStaticCozy =
                        (venue.shielding?.rainCover ?? 0) > 80 ||
                        venue.tags?.some(tag => ['cozy', 'covered', 'indoor'].includes(tag.toLowerCase())) ||
                        venue.hasCozy;
                    if (!hasLiveCozy && !hasStaticCozy) return false;
                }

                if (activeFilter === 'Sunny') {
                    const roofClosed = !!liveState.roofClosed;
                    const uvIndexValue = getUVIndex() || 0;
                    if (uvIndexValue < 4 || roofClosed) return false;
                }
            }

            if (activeFilters.length > 0) {
                if (!filteredVenueIds.includes(venue.id)) return false;
            }

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
    }, [activeFilter, activeFilters, filteredVenueIds, debouncedLiveFeatures, searchQuery]);

    const matchingCount = filteredVenues.length;

    // Handlers
    const handleVenueSelect = useCallback((venue) => {
        setSelectedVenue(venue);
        if (mapRef.current && mapRef.current.flyTo) {
            mapRef.current.flyTo({
                center: [venue.lng, venue.lat],
                zoom: 15,
                duration: 1200,
            });
        }
    }, []);

    const handleCloseCard = useCallback(() => {
        setSelectedVenue(null);
    }, []);

    const toggleChat = useCallback(() => {
        setIsChatOpen(prev => !prev);
    }, []);

    const closeChat = useCallback(() => {
        setIsChatOpen(false);
    }, []);

    const handleFilterToggle = useCallback((tag) => {
        setActiveFilters(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        );
        setSelectedVenue(null);
    }, []);

    const handleClearFilters = useCallback(() => {
        setActiveFilters([]);
        setMapQuickFilter(null);
    }, []);

    // Chat actions
    const handleFindWheelchair = useCallback(() => {
        setActiveFilters(['wheelchair']);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, []);

    const handleFindDogFriendly = useCallback(() => {
        setActiveFilters(['pet-friendly']);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, []);

    const handleFindSmoking = useCallback(() => {
        setActiveFilters(['smoking']);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, []);

    const handleSurpriseMe = useCallback(() => {
        const randomIndex = Math.floor(Math.random() * demoVenues.length);
        const randomVenue = demoVenues[randomIndex];
        setActiveFilters([]);
        handleVenueSelect(randomVenue);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, [handleVenueSelect]);

    const handleFindFamily = useCallback(() => {
        setActiveFilters(['pram-friendly']);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, []);

    const handleFindBusiness = useCallback(() => {
        setActiveFilters(['Large Groups']);
        setSelectedVenue(null);
        setTimeout(() => setIsChatOpen(false), 1500);
    }, []);

    const handleRecenter = useCallback(() => {
        if (mapRef.current && mapRef.current.flyTo) {
            mapRef.current.flyTo({
                center: [144.9631, -37.8136],
                zoom: 12,
                duration: 1200,
            });
        }
    }, []);

    // Scroll venue card into view when selected
    useEffect(() => {
        if (selectedVenue && listRef.current) {
            const el = listRef.current.querySelector(`#venue-list-${selectedVenue.id}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [selectedVenue]);

    return (
        <>
            {!splashDone && (
                <SplashScreen onComplete={() => {
                    sessionStorage.setItem('splashShown', 'true');
                    setSplashDone(true);
                }} />
            )}
            <div className={`ss-app-root ${mobileMapExpanded ? 'ss-app-root--map-expanded' : ''}`}>
                {/* Weather background */}
            <WeatherBackground />

            {/* ═══ HEADER ═══ */}
            <TopBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onRecenter={handleRecenter}
                weather={weather}
                onFiltersOpen={openMobileFilters}
            />

            <AnimatePresence>
                {showOwnerDashboard && (
                    <OwnerDashboard
                        venue={selectedVenue}
                        liveVenueFeatures={liveVenueFeatures}
                        setLiveVenueFeatures={setLiveVenueFeatures}
                        onClose={() => setShowOwnerDashboard(false)}
                        onVenueUpdate={(updated) => {
                            setSelectedVenue(prev => ({ ...prev, ...updated }));
                        }}
                    />
                )}
            </AnimatePresence>

                <>
                    {/* ═══ MAIN SPLIT LAYOUT ═══ */}
                    <main className="ss-main flex h-full w-full overflow-hidden">
                        {/* ── LEFT: Venue List (desktop) ────────────────── */}
                        <aside className="ss-sidebar w-full md:w-96 h-full overflow-y-auto flex flex-col bg-white border-r border-gray-200">
                            {/* Search bar */}
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
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="ss-search-clear"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>

                            {/* Results count */}
                            <div className="ss-sidebar-count">
                                <span>{matchingCount} venue{matchingCount !== 1 ? 's' : ''}</span>
                                {(activeFilters.length > 0 || mapQuickFilter) && (
                                    <button onClick={handleClearFilters} className="ss-sidebar-clear">Clear all</button>
                                )}
                            </div>

                            {/* Scrollable venue list */}
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
                                        <p>Showing all venues — couldn't find an exact match</p>
                                        <button onClick={handleClearFilters}>Show all venues</button>
                                    </div>
                                )}
                            </div>
                        </aside>

                        {/* ── RIGHT: Map ────────────────────────────────── */}
                        <section className={`ss-map-area flex-1 h-full relative ${mobileMapExpanded ? 'ss-map-area--expanded' : ''}`}>

                            {/* Filters FAB (mobile only) */}
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

                            {/* Map container */}
                            <div className="ss-map-container">
                                <MapErrorBoundary>
                                    <MapView
                                        onVenueSelect={handleVenueSelect}
                                        selectedVenue={selectedVenue}
                                        filteredVenueIds={filteredVenues.map(v => v.id)}
                                        liveVenueFeatures={debouncedLiveFeatures}
                                        mapRef={mapRef}
                                        weatherColorFn={getMarkerWeatherColor}
                                        cozyWeatherActive={cozyWeatherActive}
                                        cozyFilterActive={activeFilter === 'Cozy'}
                                        isExpanded={mobileMapExpanded}
                                    />
                                </MapErrorBoundary>
                            </div>

                            {/* Recenter button */}
                            <motion.button
                                className="ss-recenter-btn"
                                whileTap={{ scale: 0.9 }}
                                onClick={handleRecenter}
                                id="recenter-map"
                            >
                                <Locate size={18} />
                            </motion.button>

                            {/* Functional Filter Buttons */}
                            <div className="ss-map-filters-row absolute bottom-40 left-1/2 -translate-x-1/2 z-20 flex gap-2 w-full px-4 justify-center pr-16">
                                <button
                                    onClick={() => setActiveFilter('All')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-all ${
                                        activeFilter === 'All'
                                            ? 'bg-sky-600 text-white border-sky-600 scale-105'
                                            : 'bg-white/90 backdrop-blur text-sky-700 border-sky-100 hover:bg-sky-50'
                                    }`}
                                >
                                    🌐 All
                                </button>

                                <button
                                    onClick={() => setActiveFilter('Sunny')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-all ${
                                        activeFilter === 'Sunny'
                                            ? 'bg-amber-400 text-amber-950 border-amber-500 scale-105'
                                            : 'bg-white/90 backdrop-blur text-amber-700 border-amber-100 hover:bg-amber-50'
                                    }`}
                                >
                                    ☀️ Sunny Patios
                                </button>

                                <button
                                    onClick={() => setActiveFilter('Cozy')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-all ${
                                        activeFilter === 'Cozy'
                                            ? 'bg-orange-600 text-white border-orange-700 scale-105'
                                            : 'bg-white/90 backdrop-blur text-orange-700 border-orange-100 hover:bg-orange-50'
                                    }`}
                                >
                                    🔥 Cozy & Covered
                                </button>
                            </div>
                        </section>
                        
                        {/* ═══ Venue detail card ═══ */}
                        {selectedVenue && (
                            <VenueCard
                                key={selectedVenue?.id || 'empty'}
                                venue={selectedVenue}
                                weather={weather}
                                liveVenueFeatures={liveVenueFeatures}
                                onClose={handleCloseCard}
                                onCenter={handleVenueSelect}
                                cozyWeatherActive={cozyWeatherActive}
                                setShowOwnerDashboard={setShowOwnerDashboard}
                                setSelectedVenue={setSelectedVenue}
                            />
                        )}

                        {/* ═══ Mobile Filter Bottom Sheet ═══ */}
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

                    {/* ═══ MOBILE: Bottom sheet venue list ═══ */}
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
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setMobileSheetState('peek')}
                                    className="ss-mobile-sheet-backdrop"
                                />
                                <motion.div
                                    drag="y"
                                    dragConstraints={{ top: 0, bottom: 0 }}
                                    dragElastic={0.1}
                                    onDragEnd={(e, { offset, velocity }) => {
                                        if (offset.y > 100 || velocity.y > 500) {
                                            setMobileSheetState('peek');
                                        }
                                    }}
                                    initial={{ y: '100%' }}
                                    animate={{ y: 0 }}
                                    exit={{ y: '100%' }}
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
                                                onClick={() => {
                                                    handleVenueSelect(venue);
                                                    setMobileSheetState('peek');
                                                }}
                                                weather={weather}
                                            />
                                        ))}
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Chat */}
                    <ChatWidget
                        isOpen={isChatOpen}
                        onClose={closeChat}
                        onFindWheelchair={handleFindWheelchair}
                        onFindDogFriendly={handleFindDogFriendly}
                        onFindSmoking={handleFindSmoking}
                        onSurpriseMe={handleSurpriseMe}
                        onFindFamily={handleFindFamily}
                        onFindBusiness={handleFindBusiness}
                    />

                    {/* FIX: Single SunnyMascot FAB – hidden when venue card is open */}
                    {!selectedVenue && <SunnyMascot onClick={toggleChat} isChatOpen={isChatOpen} />}

                    {/* Footer badge — FIX: use imported fireIconImg instead of hardcoded path */}
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                        className={`ss-footer-badge ${selectedVenue ? "hidden" : ""}`}
                    >
                        <img src={fireIconImg} alt="" className="ss-footer-badge-icon" />
                        Sales Demo · {demoVenues.length} Partner Venues
                    </motion.div>
                </>
        </div>
        </>
    );
};


// ═══════════════════════════════════════════════════════════════════
// Error Boundary
// ═══════════════════════════════════════════════════════════════════
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Sunstay Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center h-screen bg-gradient-to-br from-amber-50 to-orange-100 p-6">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center max-w-md bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-2xl"
                    >
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-2xl font-black text-gray-800 mb-2">Oops! Something went wrong</h2>
                        <p className="text-gray-600 mb-4 text-sm">
                            {this.state.error?.message || 'An unexpected error occurred loading Sunstay.'}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
                        >
                            ☀️ Reload App
                        </button>
                    </motion.div>
                </div>
            );
        }
        return this.props.children;
    }
}

// Root App component
const App = () => (
    <ErrorBoundary>
        <WeatherProvider>
            <AppContent />
        </WeatherProvider>
    </ErrorBoundary>
);

export default App;
