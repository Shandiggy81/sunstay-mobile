import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { X, ChevronUp, SlidersHorizontal, Map, List } from 'lucide-react';
import VenueListCard from './VenueListCard';
import VenueDetail from '../VenueDetail';
import FiltersPanel from '../FiltersPanel';

const QUICK_FILTERS = [
    { id: 'full-sun', label: 'Sunny', icon: '☀️' },
    { id: 'rooftop', label: 'Rooftop', icon: '🏙️' },
    { id: 'beer-garden', label: 'Beer Garden', icon: '🍺' },
    { id: 'pet-friendly', label: 'Pet Friendly', icon: '🐕' },
    { id: 'live-music', label: 'Live Music', icon: '🎵' },
    { id: 'shade', label: 'Shaded', icon: '⛱️' },
    { id: 'specialty-coffee', label: 'Coffee', icon: '☕' },
    { id: 'pram-friendly', label: 'Pram Friendly', icon: '👶' },
];

const COLLAPSED_H = 52;
const PEEK_H = '28vh';
const LIST_H = '52vh';
const FULL_H = '88vh';

const sheetHeightForMode = (mode) => {
    if (mode === 'collapsed') return COLLAPSED_H;
    if (mode === 'peek') return PEEK_H;
    if (mode === 'list') return LIST_H;
    return FULL_H;
};

const ExploreSheet = ({
    mode,
    onModeChange,
    mapMode,
    onMapModeChange,
    venues,
    totalCount,
    selectedVenue,
    onVenueSelect,
    onCloseDetail,
    activeFilters,
    onFilterToggle,
    filterCategories,
    weather,
    externalFiltersOpen,
    onExternalFiltersClose,
}) => {
    const dragY = useMotionValue(0);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const effectiveFiltersOpen = externalFiltersOpen || filtersOpen;
    const closeFilters = () => { setFiltersOpen(false); onExternalFiltersClose?.(); };

    const activeFilterCount = activeFilters.length;
    const isDetail = mode === 'full' && !!selectedVenue;

    const handleDragEnd = useCallback((_, info) => {
        const vel = info.velocity.y;
        const off = info.offset.y;

        if (mode === 'full') {
            if (vel > 400 || off > 130) {
                if (selectedVenue) onCloseDetail();
                else onModeChange('list');
            }
        } else if (mode === 'list') {
            if (vel > 350 || off > 100) onModeChange('peek');
            else if (vel < -350 || off < -100) onModeChange('full');
        } else if (mode === 'peek') {
            if (vel > 300 || off > 80) onModeChange('collapsed');
            else if (vel < -200 || off < -50) onModeChange('list');
        } else if (mode === 'collapsed') {
            if (vel < -150 || off < -30) onModeChange('peek');
        }
        dragY.set(0);
    }, [mode, selectedVenue, onModeChange, onCloseDetail]);

    const sheetContent = () => {
        if (isDetail) {
            return (
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <VenueDetail venue={selectedVenue} onClose={onCloseDetail} weather={weather} />
                </div>
            );
        }

        if (mode === 'collapsed') {
            return (
                <button
                    onClick={() => onModeChange('list')}
                    className="flex-1 flex flex-col items-center justify-center gap-1 pt-1"
                >
                    <div className="w-10 h-[5px] rounded-full bg-gray-300/80 mb-1" />
                    <div className="flex items-center gap-2">
                        <ChevronUp size={14} className="text-gray-400" />
                        <span className="text-[13px] font-semibold text-gray-600">
                            {totalCount} venues nearby
                        </span>
                    </div>
                </button>
            );
        }

        return (
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-100/80 overflow-x-auto scrollbar-hide">
                    <div className="flex gap-2 min-w-max">
                        {QUICK_FILTERS.map(f => {
                            const isActive = activeFilters.includes(f.id);
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => onFilterToggle(f.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all duration-200 ${
                                        isActive
                                            ? 'bg-amber-500 text-white shadow-[0_0_0_2px_rgba(245,158,11,0.4),0_2px_8px_rgba(245,158,11,0.3)]'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    <span>{f.icon}</span>
                                    <span>{f.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-50" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {venues.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-6">
                            <span className="text-4xl mb-3">🔍</span>
                            <p className="text-gray-500 text-sm font-medium text-center">No venues match your filters</p>
                            <button
                                onClick={() => activeFilters.forEach(f => onFilterToggle(f))}
                                className="mt-3 text-amber-500 text-sm font-bold"
                            >
                                Clear all filters
                            </button>
                        </div>
                    ) : (
                        venues.map(venue => (
                            <VenueListCard
                                key={venue.id}
                                venue={venue}
                                isSelected={selectedVenue?.id === venue.id}
                                onClick={() => onVenueSelect(venue)}
                                weather={weather}
                            />
                        ))
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <motion.div
                className="absolute bottom-0 left-0 right-0 z-40 bg-white flex flex-col overflow-hidden"
                style={{
                    borderTopLeftRadius: mode === 'collapsed' ? 0 : '1.75rem',
                    borderTopRightRadius: mode === 'collapsed' ? 0 : '1.75rem',
                    boxShadow: mode === 'collapsed'
                        ? 'none'
                        : '0 -8px 40px rgba(0,0,0,0.14), 0 -2px 12px rgba(0,0,0,0.07)',
                    y: dragY,
                }}
                animate={{ height: sheetHeightForMode(mode) }}
                transition={{ type: 'spring', damping: 32, stiffness: 280, mass: 0.75 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.08}
                onDragEnd={handleDragEnd}
            >
                {mode !== 'collapsed' && (
                    <div className="flex-shrink-0 pt-3.5 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none">
                        <div className="w-10 h-[5px] rounded-full bg-gray-300/80" />
                    </div>
                )}

                {mode !== 'collapsed' && (
                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-[15px]">
                                {isDetail ? selectedVenue.venueName : 'Nearby venues'}
                            </span>
                            {!isDetail && (
                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {venues.length}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {!isDetail && onMapModeChange && (
                                <div className="flex items-center bg-gray-100 rounded-full p-0.5">
                                    <button
                                        onClick={() => onMapModeChange('map')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                            mapMode === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        <Map size={10} />
                                        <span>Map</span>
                                    </button>
                                    <button
                                        onClick={() => onMapModeChange('list')}
                                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                                            mapMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                                        }`}
                                    >
                                        <List size={10} />
                                        <span>List</span>
                                    </button>
                                </div>
                            )}

                            {!isDetail && (
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    onClick={() => setFiltersOpen(true)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                                        activeFilterCount > 0
                                            ? 'bg-amber-500 text-white border-amber-500'
                                            : 'bg-gray-50 text-gray-600 border-gray-200'
                                    }`}
                                >
                                    <SlidersHorizontal size={10} />
                                    <span>Filters</span>
                                    {activeFilterCount > 0 && (
                                        <span className="font-bold ml-0.5">{activeFilterCount}</span>
                                    )}
                                </motion.button>
                            )}

                            <button
                                onClick={() => {
                                    if (isDetail) { onCloseDetail(); }
                                    else { onModeChange('collapsed'); }
                                }}
                                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                            >
                                <X size={13} className="text-gray-500" />
                            </button>
                        </div>
                    </div>
                )}

                {sheetContent()}
            </motion.div>

            <FiltersPanel
                isOpen={effectiveFiltersOpen}
                onClose={closeFilters}
                filterCategories={filterCategories}
                activeFilters={activeFilters}
                onFilterToggle={onFilterToggle}
            />
        </>
    );
};

export default ExploreSheet;
