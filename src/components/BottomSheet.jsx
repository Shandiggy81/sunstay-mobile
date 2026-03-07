import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { SlidersHorizontal, X, ChevronUp, MapPin } from 'lucide-react';
import VenueDetail from './VenueDetail';
import VenueRow from './VenueRow';

const SHEET_HEIGHTS = {
    peek: 88,
    half: '52vh',
    full: '92vh',
};

const FilterChip = ({ filter, active, onToggle }) => (
    <button
        onClick={() => onToggle(filter.id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 border transition-all ${
            active
                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
        }`}
    >
        <span>{filter.icon}</span>
        <span>{filter.label}</span>
    </button>
);

const PeekBar = ({ onExpand, venues, count }) => (
    <button
        onClick={onExpand}
        className="w-full flex items-center justify-between px-4 py-3"
    >
        <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">Explore venues</span>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{count}</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-500">
            <span className="text-xs font-semibold">See all</span>
            <ChevronUp size={14} />
        </div>
    </button>
);

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
}) => {
    const dragY = useMotionValue(0);
    const startY = useRef(0);
    const startState = useRef(state);

    const getHeightValue = (s) => SHEET_HEIGHTS[s];

    const handleDragEnd = useCallback((_, info) => {
        const velocity = info.velocity.y;
        const offset = info.offset.y;

        if (state === 'full') {
            if (velocity > 300 || offset > 100) {
                onStateChange(selectedVenue ? 'full' : 'half');
                if (selectedVenue && (velocity > 600 || offset > 200)) {
                    onCloseDetail();
                }
            }
        } else if (state === 'half') {
            if (velocity > 300 || offset > 80) {
                onStateChange('peek');
            } else if (velocity < -300 || offset < -80) {
                onStateChange('full');
            }
        } else if (state === 'peek') {
            if (velocity < -200 || offset < -40) {
                onStateChange('half');
            }
        }
        dragY.set(0);
    }, [state, selectedVenue, onStateChange, onCloseDetail]);

    const tagFilters = filterCategories.filter(f => f.tag);

    const heightForState = state === 'peek' ? SHEET_HEIGHTS.peek :
        state === 'half' ? SHEET_HEIGHTS.half : SHEET_HEIGHTS.full;

    return (
        <motion.div
            className="absolute bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col"
            animate={{ height: heightForState }}
            transition={{ type: 'spring', damping: 32, stiffness: 280, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
            style={{ maxHeight: '92vh', y: dragY }}
        >
            {/* Drag handle */}
            <div
                className="flex-shrink-0 pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing"
                onTouchStart={() => { startState.current = state; }}
            >
                <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Peek state */}
            {state === 'peek' && (
                <PeekBar
                    onExpand={() => onStateChange('half')}
                    venues={venues}
                    count={venues.length}
                />
            )}

            {/* Half / Full states */}
            {(state === 'half' || state === 'full') && (
                <div className="flex flex-col flex-1 overflow-hidden">
                    {/* Header */}
                    <div className="flex-shrink-0 px-4 pb-3 flex items-center justify-between border-b border-gray-100">
                        <div>
                            <span className="text-base font-bold text-gray-900">
                                {selectedVenue && state === 'full' ? selectedVenue.venueName : 'Nearby venues'}
                            </span>
                            {!selectedVenue && (
                                <span className="ml-2 text-sm text-gray-400 font-normal">{venues.length} results</span>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                if (selectedVenue && state === 'full') {
                                    onCloseDetail();
                                } else {
                                    onStateChange('peek');
                                }
                            }}
                            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                        >
                            <X size={14} className="text-gray-500" />
                        </button>
                    </div>

                    {/* Venue detail */}
                    {selectedVenue && state === 'full' ? (
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            <VenueDetail
                                venue={selectedVenue}
                                onClose={onCloseDetail}
                                weather={weather}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Filters */}
                            <div className="flex-shrink-0 px-3 py-2.5 border-b border-gray-50">
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                                    {activeFilters.length > 0 && (
                                        <button
                                            onClick={() => activeFilters.forEach(f => onFilterToggle(f))}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-500 border border-red-100 flex-shrink-0"
                                        >
                                            <X size={10} />
                                            <span>Clear</span>
                                        </button>
                                    )}
                                    {tagFilters.map(filter => (
                                        <FilterChip
                                            key={filter.id}
                                            filter={filter}
                                            active={activeFilters.includes(filter.id)}
                                            onToggle={onFilterToggle}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Venue list */}
                            <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-50">
                                {venues.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 px-6">
                                        <span className="text-4xl mb-3">🔍</span>
                                        <p className="text-gray-500 text-sm font-medium text-center">No venues match your filters</p>
                                        <button
                                            onClick={() => activeFilters.forEach(f => onFilterToggle(f))}
                                            className="mt-3 text-amber-500 text-sm font-bold"
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                ) : (
                                    venues.map(venue => (
                                        <VenueRow
                                            key={venue.id}
                                            venue={venue}
                                            isSelected={selectedVenue?.id === venue.id}
                                            onClick={() => {
                                                onVenueSelect(venue);
                                            }}
                                            weather={weather}
                                        />
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </motion.div>
    );
};

export default BottomSheet;
