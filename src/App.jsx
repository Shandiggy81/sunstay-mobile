import React, { useState, Component, useRef, useCallback, useMemo } from 'react';
import { WeatherProvider, useWeather } from './context/WeatherContext';
import MapView from './components/MapView';
import BottomSheet from './components/BottomSheet';
import TopBar from './components/TopBar';
import CategoryPills from './components/CategoryPills';
import { demoVenues, FILTER_CATEGORIES } from './data/demoVenues';
import SunnyMascot from './components/SunnyMascot';
import ChatWidget from './components/ChatWidget';

const getMarkerWeatherColor = (weather, venue) => {
    if (!weather) return 'sunny';
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windSpeed = weather.wind?.speed || 0;
    if (windSpeed > 12) return 'windy';
    if (condition.includes('rain') || condition.includes('drizzle')) return 'rainy';
    if (condition.includes('cloud')) return 'cloudy';
    return 'sunny';
};

const AppContent = () => {
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [sheetState, setSheetState] = useState('peek'); // peek | list | full
    const [activeCategory, setActiveCategory] = useState('all');
    const [activeFilters, setActiveFilters] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [filtersOpenFromBanner, setFiltersOpenFromBanner] = useState(false);
    const mapRef = useRef(null);
    const { weather } = useWeather();

    const CATEGORIES = [
        { id: 'all', label: 'All', icon: '🗺️' },
        { id: 'cafe', label: 'Cafes', icon: '☕' },
        { id: 'pub', label: 'Pubs', icon: '🍺' },
        { id: 'bar', label: 'Bars', icon: '🍸' },
        { id: 'restaurant', label: 'Restaurants', icon: '🍽️' },
        { id: 'hotel', label: 'Hotels', icon: '🏨' },
        { id: 'stay', label: 'Stays', icon: '🏡' },
        { id: 'rooftop', label: 'Rooftops', icon: '🏙️' },
        { id: 'garden', label: 'Gardens', icon: '🌿' },
        { id: 'waterfront', label: 'Waterfront', icon: '🌊' },
    ];

    const categoryVenueIds = useMemo(() => {
        if (activeCategory === 'all') return null;
        const catMap = {
            cafe: ['Cafe', 'Cafe & Co-Work'],
            pub: ['Pub', 'Classic Pub', 'Tavern', 'Pub Network'],
            bar: ['Bar', 'Multi-Level Bar', 'Rooftop Bar', 'City Bar', 'Wine Bar', 'Rooftop Courtyard'],
            restaurant: ['Restaurant', 'Fine Dining', 'Brasserie'],
            hotel: ['Hotel', 'Luxury Hotels', 'Boutique Hotels', 'Apartment Hotel'],
            stay: ['ShortStay', 'Short Stay'],
            rooftop: null,
            garden: null,
            waterfront: null,
        };
        const vibeValues = catMap[activeCategory];
        if (vibeValues === null) {
            const tagMap = {
                rooftop: 'Rooftop',
                garden: 'Beer Garden',
                waterfront: 'Waterfront',
            };
            const tag = tagMap[activeCategory];
            if (!tag) return null;
            return demoVenues.filter(v => (v.tags || []).includes(tag)).map(v => v.id);
        }
        return demoVenues.filter(v => {
            const vibe = v.vibe || v.segment || '';
            const typeCategory = v.typeCategory || '';
            return vibeValues.some(val =>
                vibe.toLowerCase().includes(val.toLowerCase()) ||
                typeCategory.toLowerCase().includes(val.toLowerCase())
            );
        }).map(v => v.id);
    }, [activeCategory]);

    const filteredVenueIds = useMemo(() => {
        const filters = activeFilters;
        const tagFilters = filters.filter(f => !f.startsWith('sun-'));

        let ids = categoryVenueIds ? new Set(categoryVenueIds) : null;

        if (tagFilters.length > 0) {
            const matchingVenues = demoVenues.filter(v => {
                const vTags = v.tags || [];
                return tagFilters.every(filterId => {
                    const filterDef = FILTER_CATEGORIES.find(c => c.id === filterId);
                    if (!filterDef || !filterDef.tag) return true;
                    return vTags.includes(filterDef.tag);
                });
            }).map(v => v.id);

            if (ids === null) {
                ids = new Set(matchingVenues);
            } else {
                ids = new Set(matchingVenues.filter(id => ids.has(id)));
            }
        }

        if (ids === null) return null;
        return [...ids];
    }, [activeCategory, activeFilters, categoryVenueIds]);

    const filteredVenues = useMemo(() => {
        let list = filteredVenueIds === null ? demoVenues : demoVenues.filter(v => filteredVenueIds.includes(v.id));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(v =>
                v.venueName.toLowerCase().includes(q) ||
                (v.suburb || '').toLowerCase().includes(q) ||
                (v.vibe || '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [filteredVenueIds, searchQuery]);

    const handleVenueSelect = useCallback((venue) => {
        setSelectedVenue(venue);
        setSheetState('full');
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({
                center: [venue.lng, venue.lat],
                zoom: 15.5,
                pitch: 45,
                duration: 1200,
            });
        }
    }, []);

    const handleCloseDetail = useCallback(() => {
        setSelectedVenue(null);
        setSheetState('list');
    }, []);

    const handleFilterToggle = useCallback((filterId) => {
        setActiveFilters(prev =>
            prev.includes(filterId) ? prev.filter(f => f !== filterId) : [...prev, filterId]
        );
    }, []);

    const handleRecenter = useCallback(() => {
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({
                center: [144.9631, -37.8136],
                zoom: 13,
                pitch: 45,
                bearing: -12,
                duration: 1200,
            });
        }
    }, []);

    return (
        <div className="fixed inset-0 bg-[#f0ece4] overflow-hidden">
            {/* ── Full-screen map base layer ──────────────────── */}
            <div className="absolute inset-0">
                <MapView
                    onVenueSelect={handleVenueSelect}
                    selectedVenue={selectedVenue}
                    filteredVenueIds={filteredVenueIds}
                    mapRef={mapRef}
                    weatherColorFn={getMarkerWeatherColor}
                    cozyMode={activeFilters.includes('cozy')}
                />
            </div>

            {/* ── Floating top bar ────────────────────────────── */}
            <TopBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onRecenter={handleRecenter}
                weather={weather}
                onFiltersOpen={() => setFiltersOpenFromBanner(true)}
            />

            {/* ── Horizontal category pills ────────────────────── */}
            <div className="absolute top-[72px] left-0 right-0 z-20 pointer-events-none">
                <div className="pointer-events-auto">
                    <CategoryPills
                        categories={CATEGORIES}
                        activeCategory={activeCategory}
                        onCategoryChange={(cat) => {
                            setActiveCategory(cat);
                            setSelectedVenue(null);
                            if (sheetState === 'full') setSheetState('list');
                        }}
                    />
                </div>
            </div>

            {/* ── Bottom sheet: peek / half / full ────────────── */}
            <BottomSheet
                state={sheetState}
                onStateChange={setSheetState}
                venues={filteredVenues}
                selectedVenue={selectedVenue}
                onVenueSelect={handleVenueSelect}
                onCloseDetail={handleCloseDetail}
                activeFilters={activeFilters}
                onFilterToggle={handleFilterToggle}
                filterCategories={FILTER_CATEGORIES}
                weather={weather}
                totalCount={demoVenues.length}
                externalFiltersOpen={filtersOpenFromBanner}
                onExternalFiltersClose={() => setFiltersOpenFromBanner(false)}
            />

            {/* ── Sunny mascot + chat ──────────────────────────── */}
            <SunnyMascot onClick={() => setIsChatOpen(v => !v)} isChatOpen={isChatOpen} />
            <ChatWidget
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onFindWheelchair={() => { setActiveFilters(['wheelchair']); setSelectedVenue(null); setIsChatOpen(false); setSheetState('half'); }}
                onFindDogFriendly={() => { setActiveFilters(['pet-friendly']); setSelectedVenue(null); setIsChatOpen(false); setSheetState('half'); }}
                onFindSmoking={() => { setActiveFilters(['smoking']); setSelectedVenue(null); setIsChatOpen(false); setSheetState('half'); }}
                onFindFamily={() => { setActiveFilters(['pram-friendly']); setSelectedVenue(null); setIsChatOpen(false); setSheetState('half'); }}
                onFindBusiness={() => { setActiveFilters(['large-groups']); setSelectedVenue(null); setIsChatOpen(false); setSheetState('half'); }}
                onSurpriseMe={() => {
                    const v = filteredVenues[Math.floor(Math.random() * filteredVenues.length)];
                    if (v) handleVenueSelect(v);
                    setIsChatOpen(false);
                }}
            />
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
                    <div className="text-center max-w-sm bg-white rounded-3xl p-8 shadow-2xl">
                        <div className="text-5xl mb-4">🌥️</div>
                        <h2 className="text-xl font-black text-gray-900 mb-2">Something went wrong</h2>
                        <p className="text-gray-500 text-sm mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-amber-500 text-white font-bold rounded-xl"
                        >
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
