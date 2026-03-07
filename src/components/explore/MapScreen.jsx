import React, { useState, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWeather } from '../../context/WeatherContext';
import { demoVenues, FILTER_CATEGORIES } from '../../data/demoVenues';
import MapView from '../MapView';
import TopBar from '../TopBar';
import ExploreSheet from './ExploreSheet';
import VenuePeekCard from './VenuePeekCard';
import SunnyMascot from '../SunnyMascot';
import ChatWidget from '../ChatWidget';

const MapScreen = () => {
    const { weather } = useWeather();

    const [selectedVenue, setSelectedVenue] = useState(null);
    const [sheetMode, setSheetMode] = useState('collapsed');
    const [mapMode, setMapMode] = useState('map');
    const [activeFilters, setActiveFilters] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filtersOpenFromBanner, setFiltersOpenFromBanner] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const mapRef = useRef(null);

    const filteredVenueIds = useMemo(() => {
        const tagFilters = activeFilters.filter(f => !f.startsWith('sun-'));
        let ids = null;

        if (tagFilters.length > 0) {
            const matching = demoVenues.filter(v => {
                const vTags = v.tags || [];
                return tagFilters.every(filterId => {
                    const def = FILTER_CATEGORIES.find(c => c.id === filterId);
                    if (!def?.tag) return true;
                    return vTags.includes(def.tag);
                });
            }).map(v => v.id);

            ids = ids === null ? new Set(matching) : new Set(matching.filter(id => ids.has(id)));
        }

        return ids === null ? null : [...ids];
    }, [activeFilters]);

    const filteredVenues = useMemo(() => {
        let list = filteredVenueIds === null
            ? demoVenues
            : demoVenues.filter(v => filteredVenueIds.includes(v.id));
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

    const handleVenueSelect = useCallback((venue, openDetail = false) => {
        setSelectedVenue(venue);
        setSheetMode(openDetail ? 'full' : 'peek');
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({
                center: [venue.lng, venue.lat],
                zoom: 15.5,
                pitch: 45,
                duration: 900,
            });
        }
    }, []);

    const handleCloseDetail = useCallback(() => {
        setSelectedVenue(null);
        setSheetMode('list');
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

    const getMarkerColor = useCallback((w, venue) => {
        if (!w) return 'sunny';
        const condition = (w.weather?.[0]?.main || '').toLowerCase();
        const windSpeed = w.wind?.speed || 0;
        if (windSpeed > 12) return 'windy';
        if (condition.includes('rain')) return 'rainy';
        if (condition.includes('cloud')) return 'cloudy';
        return 'sunny';
    }, []);

    const isListMode = mapMode === 'list';

    return (
        <div className="fixed inset-0 bg-[#e8e4dc] overflow-hidden">
            {!isListMode && (
                <div className="absolute inset-0">
                    <MapView
                        onVenueSelect={handleVenueSelect}
                        selectedVenue={selectedVenue}
                        filteredVenueIds={filteredVenueIds}
                        mapRef={mapRef}
                        weatherColorFn={getMarkerColor}
                        cozyMode={activeFilters.includes('cozy')}
                    />
                </div>
            )}

            {isListMode && (
                <div className="absolute inset-0 bg-gray-50 overflow-y-auto"
                    style={{ paddingTop: 120, paddingBottom: 80 }}>
                    {filteredVenues.map(venue => (
                        <button
                            key={venue.id}
                            onClick={() => handleVenueSelect(venue)}
                            className="w-full flex items-start gap-3 px-4 py-3.5 text-left bg-white border-b border-gray-100 hover:bg-gray-50"
                        >
                            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                                {venue.emoji}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                                <p className="font-semibold text-[13px] text-gray-900 truncate">{venue.venueName}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                                    {venue.vibe || venue.segment} · {venue.suburb}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <TopBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onRecenter={handleRecenter}
                weather={weather}
                onFiltersOpen={() => setFiltersOpenFromBanner(true)}
            />

            {!isListMode && (
                <>
                    <AnimatePresence>
                        {selectedVenue && (sheetMode === 'collapsed' || sheetMode === 'peek') && (
                            <div className="absolute bottom-[60px] left-0 right-0 z-30 pointer-events-none px-3">
                                <div className="pointer-events-auto">
                                    <VenuePeekCard
                                        venue={selectedVenue}
                                        weather={weather}
                                        onExpand={() => setSheetMode('full')}
                                        onClose={() => { setSelectedVenue(null); setSheetMode('collapsed'); }}
                                    />
                                </div>
                            </div>
                        )}
                    </AnimatePresence>

                    <ExploreSheet
                        mode={sheetMode}
                        onModeChange={setSheetMode}
                        mapMode={mapMode}
                        onMapModeChange={setMapMode}
                        venues={filteredVenues}
                        totalCount={demoVenues.length}
                        selectedVenue={selectedVenue}
                        onVenueSelect={(v) => handleVenueSelect(v, true)}
                        onCloseDetail={handleCloseDetail}
                        activeFilters={activeFilters}
                        onFilterToggle={handleFilterToggle}
                        filterCategories={FILTER_CATEGORIES}
                        weather={weather}
                        externalFiltersOpen={filtersOpenFromBanner}
                        onExternalFiltersClose={() => setFiltersOpenFromBanner(false)}
                    />
                </>
            )}

            {isListMode && (
                <ExploreSheet
                    mode="full"
                    onModeChange={(m) => { if (m === 'collapsed') setMapMode('map'); else setSheetMode(m); }}
                    mapMode={mapMode}
                    onMapModeChange={setMapMode}
                    venues={filteredVenues}
                    totalCount={demoVenues.length}
                    selectedVenue={selectedVenue}
                    onVenueSelect={(v) => { setMapMode('map'); handleVenueSelect(v, true); }}
                    onCloseDetail={() => { setSelectedVenue(null); setMapMode('map'); }}
                    activeFilters={activeFilters}
                    onFilterToggle={handleFilterToggle}
                    filterCategories={FILTER_CATEGORIES}
                    weather={weather}
                    externalFiltersOpen={filtersOpenFromBanner}
                    onExternalFiltersClose={() => setFiltersOpenFromBanner(false)}
                />
            )}

            <SunnyMascot
                onClick={() => setIsChatOpen(v => !v)}
                isChatOpen={isChatOpen}
            />
            <ChatWidget
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onFindWheelchair={() => { setActiveFilters(['wheelchair']); setSelectedVenue(null); setIsChatOpen(false); setSheetMode('list'); }}
                onFindDogFriendly={() => { setActiveFilters(['pet-friendly']); setSelectedVenue(null); setIsChatOpen(false); setSheetMode('list'); }}
                onFindSmoking={() => { setActiveFilters(['smoking']); setSelectedVenue(null); setIsChatOpen(false); setSheetMode('list'); }}
                onFindFamily={() => { setActiveFilters(['pram-friendly']); setSelectedVenue(null); setIsChatOpen(false); setSheetMode('list'); }}
                onFindBusiness={() => { setActiveFilters(['large-groups']); setSelectedVenue(null); setIsChatOpen(false); setSheetMode('list'); }}
                onSurpriseMe={() => {
                    const v = filteredVenues[Math.floor(Math.random() * filteredVenues.length)];
                    if (v) handleVenueSelect(v);
                    setIsChatOpen(false);
                }}
            />
        </div>
    );
};

export default MapScreen;
