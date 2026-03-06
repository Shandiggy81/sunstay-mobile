import React, { useState, Component, useRef, useCallback, useMemo, useEffect } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import MapView from './components/MapView';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import FilterBar from './components/FilterBar';
import NotificationCenter from './components/NotificationCenter';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Locate, ListFilter, Sun, Cloud, Wind } from 'lucide-react';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import { getWindProfile, calculateApparentTemp, getComfortZone, getWindWarning } from './data/windIntelligence';
import sunBadgeImg from './assets/sun-badge.jpg';

const getWeatherBadge = (weather, venue) => {
    if (!weather) return { emoji: '🌤️', label: 'Fair', color: 'rgba(251,191,36,0.8)' };
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windWarning = getWindWarning(weather.wind?.speed, venue);
    if (windWarning.level === 'red' || windWarning.level === 'orange') return { emoji: '💨', label: 'Windy', color: 'rgba(96,165,250,0.8)' };
    if (condition.includes('rain') || condition.includes('drizzle')) return { emoji: '🌧️', label: 'Rain', color: 'rgba(148,163,184,0.8)' };
    if (condition.includes('clear') || condition.includes('sunny')) return { emoji: '☀️', label: 'Sunny', color: 'rgba(251,191,36,0.9)' };
    if (condition.includes('cloud')) return { emoji: '☁️', label: 'Cloudy', color: 'rgba(148,163,184,0.8)' };
    return { emoji: '🌤️', label: 'Fair', color: 'rgba(251,191,36,0.8)' };
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

const WeatherPill = () => {
    const { weather, getTemperature, getWeatherDescription } = useWeather();
    const temp = getTemperature();
    const main = (weather?.weather?.[0]?.main || '').toLowerCase();
    const isSunny = main.includes('clear') || main.includes('sun');
    const isRaining = main.includes('rain');

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-dark border border-white/10">
            <span className="text-sm">{isSunny ? '☀️' : isRaining ? '🌧️' : '🌤️'}</span>
            {temp != null && <span className="text-white font-bold text-sm">{temp}°</span>}
            <span className="text-white/40 text-xs hidden sm:block">{getWeatherDescription()}</span>
        </div>
    );
};

const VenueListRow = ({ venue, isSelected, onClick, weather }) => {
    const badge = getWeatherBadge(weather, venue);
    return (
        <motion.button
            layout
            whileHover={{ x: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${isSelected ? 'bg-white/10 border border-white/15' : 'border border-transparent'}`}
        >
            <span className="text-xl flex-shrink-0">{venue.emoji}</span>
            <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm truncate">{venue.venueName}</div>
                <div className="text-white/40 text-xs truncate">{venue.typeCategory === 'ShortStay' || venue.typeCategory === 'Hotel' ? venue.typeLabel : venue.vibe} · {venue.suburb}</div>
            </div>
            <span className="text-sm flex-shrink-0">{badge.emoji}</span>
        </motion.button>
    );
};


const AppContent = () => {
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [mapQuickFilter, setMapQuickFilter] = useState(null);
    const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const mapRef = useRef(null);
    const { weather } = useWeather();

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
                    const hasRoomMatch = rooms.some(room => intentFilters.some(intentId => {
                        if (intentId === 'sun-morning') return room.sunProfile?.useCase === "Morning coffee" && (room.hasBalcony || room.hasOutdoorArea);
                        if (intentId === 'sun-sunset') return room.sunProfile?.useCase === "Sunset drinks" && (room.hasBalcony || room.hasOutdoorArea);
                        if (intentId === 'sun-allday') return room.sunScore >= 70 && (room.sunProfile?.summerHours >= 6 || room.sunProfile?.winterHours >= 4) && ["N", "NE", "NW"].includes(room.orientation);
                        if (intentId === 'sun-shaded') return room.sunProfile?.useCase === "Shade retreat" || room.sunScore <= 40;
                        if (intentId === 'sun-highfloor') return (room.floorLevel || 0) >= 8 && room.obstructionLevel === "Open" && room.hasBalcony;
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
            .map(v => v.id);
    }, [activeFilters]);

    const filteredVenues = useMemo(() => {
        let vList = demoVenues.filter(v => filteredVenueIds.includes(v.id));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            vList = vList.filter(v =>
                v.venueName.toLowerCase().includes(q) ||
                v.suburb?.toLowerCase().includes(q) ||
                v.vibe?.toLowerCase().includes(q)
            );
        }
        return vList;
    }, [filteredVenueIds, searchQuery]);

    const handleVenueSelect = useCallback((venue) => {
        setSelectedVenue(venue);
        setSidebarOpen(false);
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({ center: [venue.lng, venue.lat], zoom: 15.5, pitch: 60, duration: 1400 });
        }
    }, []);

    const handleCloseCard = useCallback(() => setSelectedVenue(null), []);
    const handleFilterToggle = useCallback((tag) => {
        setActiveFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
        setSelectedVenue(null);
    }, []);
    const handleClearFilters = useCallback(() => {
        setActiveFilters([]);
        setMapQuickFilter(null);
    }, []);
    const handleRecenter = useCallback(() => {
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({ center: [144.9631, -37.8136], zoom: 13, pitch: 52, bearing: -12, duration: 1400 });
        }
    }, []);

    const handleFindWheelchair = useCallback(() => { setActiveFilters(['wheelchair']); setSelectedVenue(null); setTimeout(() => setIsChatOpen(false), 1200); }, []);
    const handleFindDogFriendly = useCallback(() => { setActiveFilters(['pet-friendly']); setSelectedVenue(null); setTimeout(() => setIsChatOpen(false), 1200); }, []);
    const handleFindSmoking = useCallback(() => { setActiveFilters(['smoking']); setSelectedVenue(null); setTimeout(() => setIsChatOpen(false), 1200); }, []);
    const handleFindFamily = useCallback(() => { setActiveFilters(['pram-friendly']); setSelectedVenue(null); setTimeout(() => setIsChatOpen(false), 1200); }, []);
    const handleFindBusiness = useCallback(() => { setActiveFilters(['Large Groups']); setSelectedVenue(null); setTimeout(() => setIsChatOpen(false), 1200); }, []);
    const handleSurpriseMe = useCallback(() => {
        const v = demoVenues[Math.floor(Math.random() * demoVenues.length)];
        setActiveFilters([]);
        handleVenueSelect(v);
        setTimeout(() => setIsChatOpen(false), 1200);
    }, [handleVenueSelect]);

    return (
        <div className="fixed inset-0 overflow-hidden bg-[#0a0a1e]">
            <MapView
                onVenueSelect={handleVenueSelect}
                selectedVenue={selectedVenue}
                filteredVenueIds={filteredVenueIds}
                mapRef={mapRef}
                weatherColorFn={getMarkerWeatherColor}
                cozyMode={activeFilters.includes('cozy')}
                isExpanded={true}
            />

            {/* Top bar: logo + search + weather */}
            <motion.div
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3, type: 'spring', damping: 22, stiffness: 200 }}
                className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3"
            >
                {/* Logo */}
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex-shrink-0 flex items-center gap-2 glass-dark px-3 py-2 rounded-2xl border border-white/10 cursor-pointer"
                    onClick={() => setSidebarOpen(v => !v)}
                >
                    <motion.img
                        src="/assets/sun-badge.jpg"
                        alt="Sunstay"
                        className="w-7 h-7 rounded-full object-cover"
                        animate={{ rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <span className="text-white font-black text-sm tracking-tight hidden sm:block">Sunstay</span>
                </motion.div>

                {/* Search */}
                <div className="flex-1 flex items-center gap-2 glass-dark px-4 py-2.5 rounded-2xl border border-white/10 shadow-lg">
                    <Search size={15} className="text-white/30 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Search venues, suburbs…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent text-white placeholder-white/25 text-sm outline-none"
                    />
                    <AnimatePresence>
                        {searchQuery && (
                            <motion.button
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                whileTap={{ scale: 0.85 }}
                                onClick={() => setSearchQuery('')}
                                className="text-white/30 hover:text-white/60 transition-colors"
                            >
                                <X size={13} />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>

                <WeatherPill />

                <NotificationCenter onVenueSelect={handleVenueSelect} />
            </motion.div>

            {/* Filter bar — floats below top bar */}
            <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.45, type: 'spring', damping: 22, stiffness: 200 }}
                className="absolute top-20 left-4 right-4 z-20"
            >
                <FilterBar
                    activeFilters={activeFilters}
                    onFilterToggle={handleFilterToggle}
                    onClearFilters={handleClearFilters}
                />
            </motion.div>

            {/* Recenter button */}
            <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7, type: 'spring', stiffness: 300 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9, rotate: -15 }}
                className="absolute right-4 bottom-28 z-20 w-11 h-11 glass-dark rounded-xl border border-white/15 flex items-center justify-center text-white/70 shadow-lg"
                onClick={handleRecenter}
            >
                <Locate size={18} />
            </motion.button>

            {/* Venue list sidebar */}
            <AnimatePresence>
                {sidebarOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSidebarOpen(false)}
                            className="fixed inset-0 z-[60]"
                        />
                        <motion.div
                            initial={{ x: '-100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '-100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                            className="fixed left-0 top-0 bottom-0 z-[70] w-72 glass-sidebar flex flex-col"
                        >
                            <div className="flex items-center justify-between px-5 pt-5 pb-3">
                                <div>
                                    <h2 className="text-white font-black text-base">Venues</h2>
                                    <p className="text-white/30 text-xs">{filteredVenues.length} results</p>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9, rotate: 90 }}
                                    transition={{ type: 'spring', stiffness: 400 }}
                                    onClick={() => setSidebarOpen(false)}
                                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50"
                                >
                                    <X size={14} />
                                </motion.button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-0.5">
                                <AnimatePresence mode="popLayout">
                                    {filteredVenues.map(venue => (
                                        <VenueListRow
                                            key={venue.id}
                                            venue={venue}
                                            isSelected={selectedVenue?.id === venue.id}
                                            onClick={() => handleVenueSelect(venue)}
                                            weather={weather}
                                        />
                                    ))}
                                </AnimatePresence>
                                {filteredVenues.length === 0 && (
                                    <div className="text-center py-12">
                                        <p className="text-white/20 text-sm">No matches found</p>
                                        <button onClick={handleClearFilters} className="text-amber-400 text-xs mt-2 hover:text-amber-300">Clear filters</button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Mobile filter bottom sheet */}
            <AnimatePresence>
                {mobileFilterOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setMobileFilterOpen(false)}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80]"
                        />
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
                            className="fixed bottom-0 left-0 right-0 z-[90] glass-card rounded-t-3xl border border-white/10 px-5 pt-4 pb-8"
                        >
                            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-4" />
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-white font-bold">Filters</h3>
                                <div className="flex gap-2">
                                    {activeFilters.length > 0 && (
                                        <button onClick={handleClearFilters} className="text-amber-400 text-xs font-semibold">Clear all</button>
                                    )}
                                    <button onClick={() => setMobileFilterOpen(false)} className="text-white/40 hover:text-white/70">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {FILTER_CATEGORIES.map(filter => (
                                    <motion.button
                                        key={filter.id}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.93 }}
                                        onClick={() => handleFilterToggle(filter.id)}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${activeFilters.includes(filter.id) ? 'bg-amber-500/90 border-amber-400/60 text-white' : 'bg-white/8 border-white/12 text-white/60'}`}
                                    >
                                        <span>{filter.icon}</span>
                                        <span>{filter.label}</span>
                                    </motion.button>
                                ))}
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setMobileFilterOpen(false)}
                                className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/20"
                            >
                                Show {filteredVenues.length} venue{filteredVenues.length !== 1 ? 's' : ''}
                            </motion.button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Mobile: filter fab */}
            <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => setMobileFilterOpen(true)}
                className="absolute left-4 bottom-28 z-20 flex items-center gap-2 glass-dark px-4 py-2.5 rounded-xl border border-white/15 text-white/80 text-xs font-bold shadow-lg md:hidden"
            >
                <ListFilter size={14} />
                <span>Filters</span>
                <AnimatePresence>
                    {activeFilters.length > 0 && (
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center"
                        >
                            {activeFilters.length}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>

            {/* Venue card */}
            {selectedVenue && (
                <VenueCard
                    key={selectedVenue.id}
                    venue={selectedVenue}
                    onClose={handleCloseCard}
                />
            )}

            <ChatWidget
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onFindWheelchair={handleFindWheelchair}
                onFindDogFriendly={handleFindDogFriendly}
                onFindSmoking={handleFindSmoking}
                onSurpriseMe={handleSurpriseMe}
                onFindFamily={handleFindFamily}
                onFindBusiness={handleFindBusiness}
            />

            <SunnyMascot onClick={() => setIsChatOpen(v => !v)} isChatOpen={isChatOpen} />

            {/* Footer badge */}
            <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1, duration: 0.5 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 glass-dark px-3 py-1.5 rounded-full border border-white/10 pointer-events-none"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
            >
                <span className="text-[10px] text-white/25 font-semibold uppercase tracking-widest">Sales Demo · {demoVenues.length} Partner Venues</span>
            </motion.div>
        </div>
    );
};


class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, info) { console.error('Sunstay Error:', error, info); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="fixed inset-0 bg-[#0a0a1e] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-center max-w-sm glass-card rounded-3xl p-8 border border-white/10"
                    >
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-xl font-black text-white mb-2">Something went wrong</h2>
                        <p className="text-white/40 text-sm mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl"
                        >
                            Reload App
                        </button>
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
