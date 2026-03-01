import React, { useState, Component, useRef, useCallback, useMemo, useEffect } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import WeatherBackground from './components/WeatherBackground';
import MapView from './components/MapView';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import FilterBar from './components/FilterBar';
import NotificationCenter from './components/NotificationCenter';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronUp, ChevronDown, Search,
    Wind, Sun, Cloud, X, Locate, ListFilter
} from 'lucide-react';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';

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

// Weather indicator for header
const WeatherIndicator = () => {
    const { weather, getTemperature, getWeatherDescription, theme } = useWeather();

    const getWeatherIcon = () => {
        if (!weather) return <Cloud size={16} className="text-gray-400" />;
        const main = weather.weather?.[0]?.main?.toLowerCase() || '';
        if (main.includes('clear') || main.includes('sun')) return <Sun size={16} className="text-amber-400" />;
        if (main.includes('rain')) return <Cloud size={16} className="text-blue-400" />;
        if (main.includes('cloud')) return <Cloud size={16} className="text-gray-400" />;
        return <Sun size={16} className="text-amber-400" />;
    };

    return (
        <div className="flex items-center gap-2">
            {getWeatherIcon()}
            <div className="text-right">
                <span className="font-bold text-gray-800 text-sm">{getTemperature()}°</span>
                <span className="text-[10px] text-gray-500 hidden sm:block leading-tight">{getWeatherDescription()}</span>
            </div>
        </div>
    );
};

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
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`ss-venue-list-card ${isSelected ? 'ss-venue-list-card--active' : ''}`}
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
};

// ── Mobile venue chip (horizontal scroll) ──────────────────────
const VenueChip = ({ venue, isSelected, onClick, weather }) => {
    const badge = getWeatherBadge(weather, venue);
    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={`ss-venue-chip ${isSelected ? 'ss-venue-chip--active' : ''}`}
        >
            <span>{venue.emoji}</span>
            <span className="ss-venue-chip-name">{venue.venueName.length > 16 ? venue.venueName.slice(0, 15) + '…' : venue.venueName}</span>
            <span className="ss-venue-chip-badge" style={{ color: badge.color }}>{badge.emoji}</span>
        </motion.button>
    );
};


// ── Quick-filter pills above map ─────────────────────────────────
const MAP_FILTERS = [
    { id: 'sunny', label: 'Sunny Now', icon: '☀️' },
    { id: 'calm', label: 'Calm Wind', icon: '🍃' },
    { id: 'outdoor', label: 'Outdoor', icon: '🌿' },
    { id: 'rooftop', label: 'Rooftop', icon: '🏙️' },
];


// ═══════════════════════════════════════════════════════════════════
// Main App Content
// ═══════════════════════════════════════════════════════════════════
const AppContent = () => {
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    // Initial filters: empty to show all venues by default
    const [activeFilters, setActiveFilters] = useState([]);
    const [mobileMapExpanded, setMobileMapExpanded] = useState(false);
    const [mobileSheetState, setMobileSheetState] = useState('peek'); // 'peek', 'expanded', 'closed'
    const [mapQuickFilter, setMapQuickFilter] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const mapRef = useRef(null);
    const listRef = useRef(null);
    const { weather } = useWeather();

    // Calculate filtered venue IDs based on active filters (Types + Intents + Tags)
    const filteredVenueIds = useMemo(() => {
        // Separate filter types
        const typeFilters = activeFilters.filter(f => f.startsWith('all-'));
        const intentFilters = activeFilters.filter(f => f.startsWith('sun-'));
        const tagFilters = activeFilters.filter(f => !f.startsWith('all-') && !f.startsWith('sun-'));

        // Match logic
        const categoryData = FILTER_CATEGORIES;

        return demoVenues
            .filter(v => {
                // 1. Type matching
                const vType = v.typeCategory || 'Bar';
                const hasTypeMatch = typeFilters.length === 0 || typeFilters.some(f => {
                    if (f === 'all-bars' && vType === 'Bar') return true;
                    if (f === 'all-hotels' && vType === 'Hotel') return true;
                    if (f === 'all-stays' && vType === 'ShortStay') return true;
                    return false;
                });
                if (!hasTypeMatch) return false;

                // 2. Intent matching (Room-level)
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

                // 3. Tag matching - look up the 'tag' property for each filter ID
                const vTags = v.tags || [];
                const hasTagMatch = tagFilters.length === 0 || tagFilters.some(id => {
                    const filter = categoryData.find(c => c.id === id);
                    return filter ? vTags.includes(filter.tag) : false;
                });

                return hasTagMatch;
            })
            .map(v => v.id);
    }, [activeFilters]);

    // Get filtered + searched venues for list
    const filteredVenues = useMemo(() => {
        let vList = demoVenues.filter(v => filteredVenueIds.includes(v.id));

        // Map quick-filter
        if (mapQuickFilter && weather) {
            vList = vList.filter(v => {
                if (mapQuickFilter === 'sunny') {
                    const cond = (weather.weather?.[0]?.main || '').toLowerCase();
                    return cond.includes('clear') || cond.includes('sun');
                }
                if (mapQuickFilter === 'calm') {
                    const w = getWindWarning(weather.wind?.speed, v);
                    return w.level === 'green' || w.level === 'yellow';
                }
                if (mapQuickFilter === 'outdoor') {
                    return v.tags.some(t => ['Beer Garden', 'Rooftop', 'Garden'].includes(t));
                }
                if (mapQuickFilter === 'rooftop') {
                    return v.tags.includes('Rooftop');
                }
                return true;
            });
        }

        // Text search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            vList = vList.filter(v =>
                v.venueName.toLowerCase().includes(q) ||
                v.suburb?.toLowerCase().includes(q) ||
                v.vibe?.toLowerCase().includes(q)
            );
        }

        return vList;
    }, [activeFilters, mapQuickFilter, searchQuery, weather]);

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
        setActiveFilters(['wheelchair', 'beer-garden', 'rooftop']);
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

    // Resize map when mobile expand/collapse toggles
    useEffect(() => {
        const timer = setTimeout(() => {
            if (mapRef.current && mapRef.current.resize) {
                mapRef.current.resize();
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [mobileMapExpanded]);

    return (
        <div className="ss-app-root">
            {/* Weather background */}
            <WeatherBackground />

            {/* ═══ HEADER ═══ */}
            <motion.header
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="ss-header"
            >
                <div className="ss-header-inner">
                    {/* Logo */}
                    <div className="ss-header-logo">
                        <motion.img
                            src={`${import.meta.env.BASE_URL}assets/sun-badge.jpg`}
                            alt="Sunstay"
                            className="ss-header-logo-img"
                            animate={{ rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div>
                            <h1 className="ss-header-title">Sunstay</h1>
                            <p className="ss-header-tagline">Find Your Perfect Spot</p>
                        </div>
                    </div>

                    {/* Weather indicator + Notifications */}
                    <div className="ss-header-right">
                        <WeatherIndicator />
                        <NotificationCenter onVenueSelect={handleVenueSelect} />
                    </div>
                </div>

                {/* Filter bar */}
                <div className="ss-header-filters">
                    <FilterBar
                        activeFilters={activeFilters}
                        onFilterToggle={handleFilterToggle}
                        onClearFilters={handleClearFilters}
                    />
                </div>
            </motion.header>

            {/* ═══ MAIN SPLIT LAYOUT ═══ */}
            <main className="ss-main">
                {/* ── LEFT: Venue List (desktop) ────────────────── */}
                <aside className="ss-sidebar">
                    {/* Search bar */}
                    <div className="ss-search-wrap">
                        <Search size={15} className="ss-search-icon" />
                        <input
                            type="text"
                            placeholder="Search venues, suburbs…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
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
                <section className={`ss-map-area ${mobileMapExpanded ? 'ss-map-area--expanded' : ''}`}>
                    {/* Floating search bar (mobile / map-overlay on desktop) */}
                    <div className="ss-map-search-float">
                        <Search size={14} />
                        <input
                            type="text"
                            placeholder="Search venues…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="ss-map-search-input"
                            id="map-venue-search"
                        />
                    </div>

                    {/* Quick-filter pills — hidden when map is expanded on mobile */}
                    {!mobileMapExpanded && (
                        <div className="ss-map-pills">
                            {MAP_FILTERS.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setMapQuickFilter(prev => prev === f.id ? null : f.id)}
                                    className={`ss-map-pill ${mapQuickFilter === f.id ? 'ss-map-pill--active' : ''}`}
                                >
                                    <span>{f.icon}</span>
                                    <span>{f.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Map container */}
                    <div className="ss-map-container">
                        <MapView
                            onVenueSelect={handleVenueSelect}
                            selectedVenue={selectedVenue}
                            filteredVenueIds={filteredVenueIds}
                            mapRef={mapRef}
                            weatherColorFn={getMarkerWeatherColor}
                        />
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

                    {/* Weather legend — hidden when map is expanded on mobile */}
                    {!mobileMapExpanded && (
                        <div className="ss-map-legend">
                            <div className="ss-legend-item"><span className="ss-legend-dot ss-legend-sunny" />Sunny</div>
                            <div className="ss-legend-item"><span className="ss-legend-dot ss-legend-cloudy" />Cloudy</div>
                            <div className="ss-legend-item"><span className="ss-legend-dot ss-legend-windy" />Windy</div>
                        </div>
                    )}

                    {/* Mobile: map bottom controls */}
                    <div className="ss-mobile-map-controls">
                        {mobileMapExpanded && (
                            <button
                                className="ss-map-filter-btn"
                                onClick={toggleChat}
                            >
                                <ListFilter size={16} />
                                <span>Filters</span>
                            </button>
                        )}
                        <button
                            className="ss-map-expand-btn"
                            onClick={() => setMobileMapExpanded(prev => !prev)}
                        >
                            {mobileMapExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            <span>{mobileMapExpanded ? 'Close Map' : 'Expand Map'}</span>
                        </button>
                    </div>
                </section>
            </main>

            {/* ═══ MOBILE: Horizontal venue chip strip ═══ */}
            <div className="ss-mobile-chips">
                <div className="ss-mobile-chips-inner">
                    {filteredVenues.map(venue => (
                        <VenueChip
                            key={venue.id}
                            venue={venue}
                            isSelected={selectedVenue?.id === venue.id}
                            onClick={() => handleVenueSelect(venue)}
                            weather={weather}
                        />
                    ))}
                </div>
            </div>

            {/* ═══ MOBILE: Bottom sheet venue list ═══ */}
            <div
                className={`ss-mobile-sheet-handle ${mobileSheetState === 'expanded' ? 'ss-mobile-sheet-handle--expanded' : ''}`}
                onClick={() => setMobileSheetState(prev => prev === 'expanded' ? 'peek' : 'expanded')}
            >
                <div className="ss-mobile-sheet-grab" />
                <span>{matchingCount} venues nearby</span>
                {mobileSheetState === 'expanded' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </div>

            <AnimatePresence>
                {mobileSheetState === 'expanded' && (
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

            {/* ═══ Venue detail card (slides in from right) ═══ */}
            <AnimatePresence>
                {selectedVenue && (
                    <motion.div
                        key={selectedVenue?.id || 'venue-detail'}
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                        className="ss-venue-detail"
                    >
                        <VenueCard
                            key={selectedVenue?.id}
                            venue={selectedVenue}
                            onClose={handleCloseCard}
                        />
                    </motion.div>
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

            {/* Sunny mascot FAB */}
            <SunnyMascot onClick={toggleChat} isChatOpen={isChatOpen} />

            {/* Footer badge */}
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="ss-footer-badge"
            >
                <img src={`${import.meta.env.BASE_URL}assets/fire-icon.jpg`} alt="" className="ss-footer-badge-icon" />
                Sales Demo · {demoVenues.length} Partner Venues
            </motion.div>
        </div>
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
