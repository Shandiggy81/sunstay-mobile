import React, { useState, Component, useRef, useCallback, useMemo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import MapView from './components/MapView';
import VenueCard from './components/VenueCard';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';
import FilterBar from './components/FilterBar';
import NotificationCenter from './components/NotificationCenter';
import { VenueListPanel } from './components/VenueListPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Locate } from 'lucide-react';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import { getWindWarning } from './data/windIntelligence';

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
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl glass-ui border border-white/12 flex-shrink-0">
            <span className="text-sm leading-none">{isSunny ? '☀️' : isRaining ? '🌧️' : '🌤️'}</span>
            {temp != null && <span className="text-white font-bold text-sm">{temp}°</span>}
            <span className="text-white/50 text-xs hidden md:block truncate max-w-[80px]">{getWeatherDescription()}</span>
        </div>
    );
};

const AppContent = () => {
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileView, setMobileView] = useState('map');
    const mapRef = useRef(null);
    const { weather } = useWeather();

    const filteredVenueIds = useMemo(() => {
        const filters = activeFilters || [];
        if (filters.length === 0) return null;
        const typeFilters = filters.filter(f => f.startsWith('all-'));
        const intentFilters = filters.filter(f => f.startsWith('sun-'));
        const tagFilters = filters.filter(f => !f.startsWith('all-') && !f.startsWith('sun-'));
        return demoVenues.filter(v => {
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
                const filter = FILTER_CATEGORIES.find(c => c.id === id);
                return filter ? vTags.includes(filter.tag) : false;
            });
            return hasTagMatch;
        }).map(v => v.id);
    }, [activeFilters]);

    const filteredVenues = useMemo(() => {
        let vList = filteredVenueIds === null ? demoVenues : demoVenues.filter(v => filteredVenueIds.includes(v.id));
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
        setMobileView('map');
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({ center: [venue.lng, venue.lat], zoom: 15.5, pitch: 60, duration: 1400 });
        }
    }, []);

    const handleCloseCard = useCallback(() => setSelectedVenue(null), []);
    const handleFilterToggle = useCallback((tag) => {
        setActiveFilters(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
        setSelectedVenue(null);
    }, []);
    const handleClearFilters = useCallback(() => setActiveFilters([]), []);
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
        <div className="fixed inset-0 overflow-hidden bg-[#0a0a1e] flex">
            {/* ── Desktop: Left venue panel (always visible, solid) ── */}
            <div className="hidden md:flex flex-col w-72 flex-shrink-0 border-r border-white/8 bg-[#080816]">
                <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/8 flex-shrink-0">
                    <img
                        src="/assets/sun-badge.jpg"
                        alt="Sunstay"
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                    <span className="text-white font-black text-sm tracking-tight">Sunstay</span>
                    <span className="ml-auto text-white/30 text-xs">{filteredVenues.length}</span>
                </div>

                <div className="px-3 py-2.5 flex-shrink-0">
                    <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                        <Search size={12} className="text-white/25 flex-shrink-0" />
                        <input
                            type="text"
                            placeholder="Search venues…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-white placeholder-white/20 text-xs outline-none"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-white/25 hover:text-white/50">
                                <X size={11} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="px-3 pb-2 flex-shrink-0">
                    <FilterBar
                        activeFilters={activeFilters}
                        onFilterToggle={handleFilterToggle}
                        onClearFilters={handleClearFilters}
                        compact
                    />
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-4 space-y-0.5">
                    {filteredVenues.map(venue => (
                        <VenueListPanel
                            key={venue.id}
                            venue={venue}
                            isSelected={selectedVenue?.id === venue.id}
                            onClick={() => handleVenueSelect(venue)}
                            weather={weather}
                        />
                    ))}
                    {filteredVenues.length === 0 && (
                        <div className="text-center py-10">
                            <p className="text-white/20 text-sm">No matches</p>
                            <button onClick={handleClearFilters} className="text-amber-400 text-xs mt-2 hover:text-amber-300">Clear filters</button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Right: Map fills remaining space ─────────────── */}
            <div className="relative flex-1 min-w-0">
                <MapView
                    onVenueSelect={handleVenueSelect}
                    selectedVenue={selectedVenue}
                    filteredVenueIds={filteredVenueIds}
                    mapRef={mapRef}
                    weatherColorFn={getMarkerWeatherColor}
                    cozyMode={activeFilters.includes('cozy')}
                />

                <div className="map-vignette pointer-events-none" />

                {/* ── Mobile top bar ─────────────────────────────── */}
                <motion.div
                    initial={{ y: -60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, type: 'spring', damping: 22, stiffness: 200 }}
                    className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2 md:hidden"
                >
                    <div className="flex-1 flex items-center gap-2 glass-ui px-3.5 py-2 rounded-2xl border border-white/12 shadow-lg min-w-0">
                        <Search size={14} className="text-white/35 flex-shrink-0" />
                        <input
                            type="text"
                            placeholder="Search venues…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent text-white placeholder-white/25 text-sm outline-none min-w-0"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white/60">
                                <X size={13} />
                            </button>
                        )}
                    </div>
                    <WeatherPill />
                    <NotificationCenter onVenueSelect={handleVenueSelect} />
                </motion.div>

                {/* ── Desktop top bar (weather + notifications) ──── */}
                <motion.div
                    initial={{ y: -60, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3, type: 'spring', damping: 22, stiffness: 200 }}
                    className="absolute top-4 right-4 z-30 hidden md:flex items-center gap-2"
                >
                    <WeatherPill />
                    <NotificationCenter onVenueSelect={handleVenueSelect} />
                </motion.div>

                {/* ── Mobile filter bar ──────────────────────────── */}
                <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.45, type: 'spring', damping: 22, stiffness: 200 }}
                    className="absolute top-[4.5rem] left-4 right-4 z-30 md:hidden"
                >
                    <FilterBar
                        activeFilters={activeFilters}
                        onFilterToggle={handleFilterToggle}
                        onClearFilters={handleClearFilters}
                    />
                </motion.div>

                {/* ── Recenter button ────────────────────────────── */}
                <motion.button
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7, type: 'spring', stiffness: 300 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute right-4 bottom-24 z-30 w-10 h-10 glass-ui rounded-xl border border-white/12 flex items-center justify-center text-white/60 shadow-xl"
                    onClick={handleRecenter}
                >
                    <Locate size={17} />
                </motion.button>

                {/* ── Mobile Map/List toggle ─────────────────────── */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 md:hidden">
                    <div className="flex items-center gap-0.5 glass-ui rounded-2xl p-1 border border-white/12 shadow-xl">
                        {[
                            { id: 'map', label: 'Map' },
                            { id: 'list', label: 'List' },
                        ].map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => {
                                    setMobileView(id);
                                    if (id === 'map') setSelectedVenue(null);
                                }}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${mobileView === id ? 'bg-amber-500 text-white shadow-md' : 'text-white/50'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Mobile bottom sheet ────────────────────────── */}
                {mobileView === 'list' && (
                    <div className="absolute bottom-0 left-0 right-0 z-40 md:hidden bg-[#0a0a1e]/97 border-t border-white/10 rounded-t-3xl max-h-[75vh] flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
                            <span className="text-white font-bold text-sm">Venues <span className="text-white/30 font-normal text-xs ml-1">{filteredVenues.length}</span></span>
                            {activeFilters.length > 0 && (
                                <button onClick={handleClearFilters} className="text-amber-400 text-xs font-semibold">Clear filters</button>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-6 space-y-0.5 pt-1">
                            {filteredVenues.map(venue => (
                                <VenueListPanel
                                    key={venue.id}
                                    venue={venue}
                                    isSelected={selectedVenue?.id === venue.id}
                                    onClick={() => handleVenueSelect(venue)}
                                    weather={weather}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Venue detail card ──────────────────────────── */}
                <AnimatePresence>
                    {selectedVenue && (
                        <VenueCard
                            key={selectedVenue.id}
                            venue={selectedVenue}
                            onClose={handleCloseCard}
                        />
                    )}
                </AnimatePresence>
            </div>

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
                    <div className="text-center max-w-sm glass-card rounded-3xl p-8 border border-white/10">
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-xl font-black text-white mb-2">Something went wrong</h2>
                        <p className="text-white/40 text-sm mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
                        <button onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl">
                            Reload App
                        </button>
                    </div>
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
