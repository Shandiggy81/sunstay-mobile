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

const VENUE_TYPE_MAP = {
    Hotel: 'Hotel',
    ShortStay: 'ShortStay',
};

const MORNING_ORIENTATIONS = new Set(['E', 'NE', 'N']);
const SUNSET_ORIENTATIONS = new Set(['W', 'NW', 'SW']);
const ALL_DAY_ORIENTATIONS = new Set(['N', 'NE', 'NW']);

const getVenueType = (venue) => VENUE_TYPE_MAP[venue.typeCategory] || 'Bar';

const buildVenueSearchBlob = (venue) => {
    const roomText = (venue.roomTypes || [])
        .map(r => `${r.orientation || ''} ${r.useCase || ''} ${r.obstructionLevel || ''}`)
        .join(' ');

    return [
        venue.venueName,
        venue.suburb,
        venue.vibe,
        venue.segment,
        venue.address,
        venue.typeLabel,
        venue.notes,
        venue.proTip,
        (venue.tags || []).join(' '),
        roomText,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
};

const matchesIntentFilter = (venue, intent) => {
    const tagsBlob = [
        venue.vibe || '',
        venue.notes || '',
        venue.proTip || '',
        (venue.tags || []).join(' '),
    ].join(' ').toLowerCase();

    const roomTypes = venue.roomTypes || [];
    const orientations = roomTypes.map(r => String(r.orientation || '').toUpperCase());
    const hasHighFloorRoom = roomTypes.some(r => Number(r.floorLevel) >= 8);
    const hasOpenRoom = roomTypes.some(r => String(r.obstructionLevel || '').toLowerCase() === 'open');
    const hasShadeObstruction = roomTypes.some(r => {
        const level = String(r.obstructionLevel || '').toLowerCase();
        return level === 'partial' || level === 'heavy';
    });

    if (intent === 'Morning') {
        return (
            tagsBlob.includes('morning') ||
            tagsBlob.includes('sunrise') ||
            orientations.some(o => MORNING_ORIENTATIONS.has(o))
        );
    }

    if (intent === 'Sunset') {
        return (
            tagsBlob.includes('sunset') ||
            tagsBlob.includes('golden hour') ||
            tagsBlob.includes('afternoon sun') ||
            tagsBlob.includes('evening sun') ||
            orientations.some(o => SUNSET_ORIENTATIONS.has(o))
        );
    }

    if (intent === 'AllDay') {
        const hasHighSunScoreRoom = roomTypes.some(r => Number(r.sunScore || 0) >= 80);
        return (
            tagsBlob.includes('all-day sun') ||
            tagsBlob.includes('all day sun') ||
            tagsBlob.includes('sunny') ||
            hasHighSunScoreRoom ||
            orientations.some(o => ALL_DAY_ORIENTATIONS.has(o))
        );
    }

    if (intent === 'Shaded') {
        return (
            tagsBlob.includes('shaded') ||
            tagsBlob.includes('shade') ||
            tagsBlob.includes('covered') ||
            tagsBlob.includes('umbrella') ||
            tagsBlob.includes('indoor warmth') ||
            orientations.includes('S') ||
            hasShadeObstruction
        );
    }

    if (intent === 'HighFloor') {
        return (
            tagsBlob.includes('high floor') ||
            tagsBlob.includes('open sky') ||
            tagsBlob.includes('rooftop') ||
            tagsBlob.includes('views') ||
            hasHighFloorRoom ||
            (hasOpenRoom && roomTypes.some(r => Number(r.floorLevel) >= 5))
        );
    }

    return true;
};

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

    const filterById = useMemo(
        () => new Map(FILTER_CATEGORIES.map(filter => [filter.id, filter])),
        []
    );

    const venueMatchesFilters = useCallback((venue, query, filters) => {
        const defs = filters
            .map(filterId => filterById.get(filterId))
            .filter(Boolean);

        const tagFilters = defs.filter(def => def.tag).map(def => def.tag.toLowerCase());
        const intentFilters = defs.filter(def => def.intent).map(def => def.intent);
        const typeFilters = defs.filter(def => def.typeFilter).map(def => def.typeFilter);

        if (typeFilters.length > 0 && !typeFilters.includes(getVenueType(venue))) {
            return false;
        }

        if (tagFilters.length > 0) {
            const venueTags = new Set((venue.tags || []).map(tag => String(tag).toLowerCase()));
            const hasAllTags = tagFilters.every(tag => venueTags.has(tag));
            if (!hasAllTags) return false;
        }

        if (intentFilters.length > 0) {
            const hasAllIntents = intentFilters.every(intent => matchesIntentFilter(venue, intent));
            if (!hasAllIntents) return false;
        }

        if (query) {
            const venueText = buildVenueSearchBlob(venue);
            if (!venueText.includes(query)) return false;
        }

        return true;
    }, [filterById]);

    const filteredVenues = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return demoVenues.filter(venue => venueMatchesFilters(venue, normalizedQuery, activeFilters));
    }, [searchQuery, activeFilters, venueMatchesFilters]);

    const filteredVenueIds = useMemo(() => {
        if (filteredVenues.length === demoVenues.length) return null;
        return filteredVenues.map(v => v.id);
    }, [filteredVenues]);

    const resolveVenue = useCallback((venueOrId) => {
        if (!venueOrId) return null;
        if (typeof venueOrId === 'object') return venueOrId;
        return demoVenues.find(v => String(v.id) === String(venueOrId)) || null;
    }, []);

    const handleVenueSelect = useCallback((venueOrId, openDetail = false) => {
        const venue = resolveVenue(venueOrId);
        if (!venue) return;

        setSelectedVenue(venue);
        setSheetMode(openDetail ? 'full' : 'collapsed');
        if (mapRef.current?.flyTo) {
            mapRef.current.flyTo({
                center: [venue.lng, venue.lat],
                zoom: 15.5,
                pitch: 45,
                duration: 900,
            });
        }
    }, [resolveVenue]);

    const handleCloseDetail = useCallback(() => {
        setSelectedVenue(null);
        setSheetMode('list');
    }, []);

    const handleFilterToggle = useCallback((filterId) => {
        setActiveFilters(prev =>
            prev.includes(filterId) ? prev.filter(f => f !== filterId) : [...prev, filterId]
        );
    }, []);

    const handleMapModeChange = useCallback((nextMode) => {
        setMapMode(nextMode);

        if (nextMode === 'list') {
            setSelectedVenue(null);
            setSheetMode('list');
            return;
        }

        if (!selectedVenue) {
            setSheetMode('collapsed');
        }
    }, [selectedVenue]);

    const handleSheetModeChange = useCallback((nextMode) => {
        if (mapMode === 'list' && nextMode !== 'full') {
            setMapMode('map');
            setSheetMode(nextMode);
            return;
        }
        setSheetMode(nextMode);
    }, [mapMode]);

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

    const getMarkerColor = useCallback((w) => {
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
            <div className={`absolute inset-0 ${isListMode ? 'pointer-events-none' : ''}`}>
                <MapView
                    onVenueSelect={handleVenueSelect}
                    selectedVenue={selectedVenue}
                    filteredVenueIds={filteredVenueIds}
                    mapRef={mapRef}
                    weatherColorFn={getMarkerColor}
                    cozyMode={activeFilters.includes('cozy')}
                />
            </div>

            <TopBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onRecenter={handleRecenter}
                weather={weather}
                onFiltersOpen={() => setFiltersOpenFromBanner(true)}
            />

            {!isListMode && (
                <AnimatePresence>
                    {selectedVenue && sheetMode === 'collapsed' && (
                        <div className="hidden lg:block absolute left-0 right-0 z-50 pointer-events-none px-3" style={{ bottom: 60 }}>
                            <div className="pointer-events-auto">
                                <VenuePeekCard
                                    venue={selectedVenue}
                                    weather={weather}
                                    onExpand={() => setSheetMode('full')}
                                    onClose={() => { setSelectedVenue(null); }}
                                />
                            </div>
                        </div>
                    )}
                </AnimatePresence>
            )}

            <ExploreSheet
                mode={isListMode ? 'full' : sheetMode}
                onModeChange={handleSheetModeChange}
                mapMode={mapMode}
                onMapModeChange={handleMapModeChange}
                venues={filteredVenues}
                totalCount={demoVenues.length}
                selectedVenue={selectedVenue}
                onVenueSelect={(v) => {
                    if (isListMode) setMapMode('map');
                    handleVenueSelect(v, true);
                }}
                onCloseDetail={() => {
                    if (isListMode) setMapMode('map');
                    handleCloseDetail();
                }}
                activeFilters={activeFilters}
                onFilterToggle={handleFilterToggle}
                filterCategories={FILTER_CATEGORIES}
                weather={weather}
                externalFiltersOpen={filtersOpenFromBanner}
                onExternalFiltersClose={() => setFiltersOpenFromBanner(false)}
            />

            <SunnyMascot
                onClick={() => setIsChatOpen(v => !v)}
                isChatOpen={isChatOpen}
            />
            <ChatWidget
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                onFindWheelchair={() => { setActiveFilters(['wheelchair']); setSelectedVenue(null); setMapMode('map'); setIsChatOpen(false); setSheetMode('list'); }}
                onFindDogFriendly={() => { setActiveFilters(['pet-friendly']); setSelectedVenue(null); setMapMode('map'); setIsChatOpen(false); setSheetMode('list'); }}
                onFindSmoking={() => { setActiveFilters(['smoking']); setSelectedVenue(null); setMapMode('map'); setIsChatOpen(false); setSheetMode('list'); }}
                onFindFamily={() => { setActiveFilters(['pram-friendly']); setSelectedVenue(null); setMapMode('map'); setIsChatOpen(false); setSheetMode('list'); }}
                onFindBusiness={() => { setActiveFilters(['large-groups']); setSelectedVenue(null); setMapMode('map'); setIsChatOpen(false); setSheetMode('list'); }}
                onSurpriseMe={() => {
                    const v = filteredVenues[Math.floor(Math.random() * filteredVenues.length)];
                    if (v) {
                        setMapMode('map');
                        handleVenueSelect(v);
                    }
                    setIsChatOpen(false);
                }}
            />
        </div>
    );
};

export default MapScreen;
