import React, { useRef, useCallback, useState } from 'react';
import { motion, useMotionValue } from 'framer-motion';
import { SlidersHorizontal, X, ChevronUp } from 'lucide-react';
import VenueDetail from './VenueDetail';
import VenueRow from './VenueRow';
import FiltersPanel from './FiltersPanel';

const PEEK_H = 72;
const LIST_H = '40vh';
const FULL_H = '88vh';

const BottomSheet = ({
    state,
    onStateChange,
    venues,
    selectedVenue,
    onVenueSelect,
    onCloseDetail,
    activeFilters,
    onFilterToggle,
    filterCategories,
    weather,
    totalCount,
    externalFiltersOpen,
    onExternalFiltersClose,
}) => {
    const dragY = useMotionValue(0);
    const startState = useRef(state);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const effectiveFiltersOpen = externalFiltersOpen || filtersOpen;
    const closeFilters = () => { setFiltersOpen(false); onExternalFiltersClose?.(); };

    const handleDragEnd = useCallback((_, info) => {
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        if (state === 'full') {
            if (velocity > 400 || offset > 120) {
                if (selectedVenue) {
                    onCloseDetail();
                } else {
                    onStateChange('list');
                }
            }
        } else if (state === 'list') {
            if (velocity > 350 || offset > 90) {
                onStateChange('peek');
            } else if (velocity < -350 || offset < -90) {
                onStateChange('full');
            }
        } else if (state === 'peek') {
            if (velocity < -200 || offset < -40) {
                onStateChange('list');
            }
        }
        dragY.set(0);
    }, [state, selectedVenue, onStateChange, onCloseDetail]);

    const heightForState = state === 'peek' ? PEEK_H : state === 'list' ? LIST_H : FULL_H;
    const activeFilterCount = activeFilters.length;

    return (
        <>
            {state === 'peek' && (
                <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
                    <div className="flex items-end justify-between px-4 pb-5 pointer-events-auto">
                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => setFiltersOpen(true)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-semibold text-sm ${activeFilterCount > 0 ? 'bg-amber-500 text-white shadow-amber-200' : 'bg-white text-gray-700 border border-gray-200 shadow-gray-200'}`}
                        >
                            <SlidersHorizontal size={14} />
                            <span>Filters</span>
                            {activeFilterCount > 0 && (
                                <span className="bg-white/30 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={() => onStateChange('list')}
                            className="flex items-center gap-2 px-5 py-3 rounded-full bg-gray-900 text-white font-bold text-sm shadow-xl shadow-gray-900/25"
                        >
                            <span>Explore {venues.length} venues</span>
                            <ChevronUp size={15} />
                        </motion.button>
                    </div>
                </div>
            )}

            {state !== 'peek' && (
                <motion.div
                    className="absolute bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
                    animate={{ height: heightForState }}
                    transition={{ type: 'spring', damping: 34, stiffness: 300, mass: 0.7 }}
                    drag="y"
                    dragConstraints={{ top: 0, bottom: 0 }}
                    dragElastic={0.1}
                    onDragEnd={handleDragEnd}
                    style={{ maxHeight: '88vh', y: dragY }}
                >
                    <div className="flex-shrink-0 pt-3 pb-0 flex justify-center cursor-grab active:cursor-grabbing touch-none">
                        <div className="w-9 h-1 rounded-full bg-gray-200" />
                    </div>

                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-[15px]">
                                {selectedVenue && state === 'full' ? selectedVenue.venueName : 'Nearby venues'}
                            </span>
                            {!selectedVenue && (
                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                    {venues.length}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {!selectedVenue && (
                                <motion.button
                                    whileTap={{ scale: 0.92 }}
                                    onClick={() => setFiltersOpen(true)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeFilterCount > 0 ? 'bg-amber-500 text-white border-amber-500' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                                >
                                    <SlidersHorizontal size={12} />
                                    <span>Filters</span>
                                    {activeFilterCount > 0 && (
                                        <span className="font-bold ml-0.5">{activeFilterCount}</span>
                                    )}
                                </motion.button>
                            )}
                            <button
                                onClick={() => {
                                    if (selectedVenue && state === 'full') {
                                        onCloseDetail();
                                    } else {
                                        onStateChange('peek');
                                    }
                                }}
                                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center"
                            >
                                <X size={13} className="text-gray-500" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        {selectedVenue && state === 'full' ? (
                            <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                                <VenueDetail venue={selectedVenue} onClose={onCloseDetail} weather={weather} />
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-50" style={{ WebkitOverflowScrolling: 'touch' }}>
                                {venues.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 px-6">
                                        <span className="text-4xl mb-3">🔍</span>
                                        <p className="text-gray-500 text-sm font-medium text-center">No venues match</p>
                                        <button
                                            onClick={() => activeFilters.forEach(f => onFilterToggle(f))}
                                            className="mt-3 text-amber-500 text-sm font-bold"
                                        >
                                            Clear all filters
                                        </button>
                                    </div>
                                ) : (
                                    venues.map(venue => (
                                        <VenueRow
                                            key={venue.id}
                                            venue={venue}
                                            isSelected={selectedVenue?.id === venue.id}
                                            onClick={() => onVenueSelect(venue)}
                                            weather={weather}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

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

export default BottomSheet;
