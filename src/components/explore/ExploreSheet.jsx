import React, { useCallback, useState, useRef, useEffect } from 'react';
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

const SNAP_PEEK = 72;

const getSnapHalf = () => Math.round(window.innerHeight * 0.5);
const getSnapFull = () => Math.round(window.innerHeight * 0.88);

const heightForMode = (mode) => {
    if (mode === 'collapsed') return SNAP_PEEK;
    if (mode === 'peek') return SNAP_PEEK;
    if (mode === 'list') return getSnapHalf();
    return getSnapFull();
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
    const [filtersOpen, setFiltersOpen] = useState(false);
    const effectiveFiltersOpen = externalFiltersOpen || filtersOpen;
    const closeFilters = () => { setFiltersOpen(false); onExternalFiltersClose?.(); };

    const activeFilterCount = activeFilters.length;
    const isDetail = mode === 'full' && !!selectedVenue;

    const sheetRef = useRef(null);
    const dragStartY = useRef(null);
    const dragCurrentY = useRef(0);
    const [sheetHeight, setSheetHeight] = useState(() => heightForMode(mode));
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        setSheetHeight(heightForMode(mode));
    }, [mode]);

    const resolveSnap = useCallback((startMode, deltaY, velocityY) => {
        if (startMode === 'full' || (startMode === 'list' && deltaY < -60)) {
            if (deltaY > 120 || velocityY > 400) {
                if (selectedVenue) { onCloseDetail(); return; }
                return onModeChange('list');
            }
            if (deltaY > 50 || velocityY > 250) return onModeChange('list');
            if (deltaY < -50 || velocityY < -250) return onModeChange('full');
        }
        if (startMode === 'list') {
            if (deltaY > 100 || velocityY > 350) return onModeChange('peek');
            if (deltaY < -80 || velocityY < -300) return onModeChange('full');
        }
        if (startMode === 'peek' || startMode === 'collapsed') {
            if (deltaY > 60 || velocityY > 300) return onModeChange('peek');
            if (deltaY < -40 || velocityY < -180) return onModeChange('list');
        }
    }, [mode, selectedVenue, onModeChange, onCloseDetail]);

    const onPointerDown = useCallback((e) => {
        if (e.target.closest('.sheet-scroll-content')) return;
        dragStartY.current = e.clientY || e.touches?.[0]?.clientY;
        dragCurrentY.current = 0;
        setDragging(true);
    }, []);

    const onPointerMove = useCallback((e) => {
        if (dragStartY.current === null) return;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const delta = dragStartY.current - clientY;
        dragCurrentY.current = delta;
        const base = heightForMode(mode);
        const newH = Math.max(SNAP_PEEK, Math.min(getSnapFull(), base + delta));
        setSheetHeight(newH);
    }, [mode]);

    const onPointerUp = useCallback((e) => {
        if (dragStartY.current === null) return;
        const delta = dragCurrentY.current;
        const velocityEstimate = Math.abs(delta) * 3;
        dragStartY.current = null;
        setDragging(false);
        resolveSnap(mode, -delta, delta < 0 ? velocityEstimate : -velocityEstimate);
    }, [mode, resolveSnap]);

    useEffect(() => {
        if (!dragging) return;
        const moveH = (e) => onPointerMove(e);
        const upH = (e) => onPointerUp(e);
        window.addEventListener('pointermove', moveH, { passive: true });
        window.addEventListener('pointerup', upH);
        window.addEventListener('pointercancel', upH);
        return () => {
            window.removeEventListener('pointermove', moveH);
            window.removeEventListener('pointerup', upH);
            window.removeEventListener('pointercancel', upH);
        };
    }, [dragging, onPointerMove, onPointerUp]);

    const showHeader = mode !== 'collapsed' && mode !== 'peek';

    const sheetContent = () => {
        if (isDetail) {
            return (
                <div className="flex-1 overflow-y-auto overscroll-contain sheet-scroll-content" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <VenueDetail venue={selectedVenue} onClose={onCloseDetail} weather={weather} />
                </div>
            );
        }

        if (mode === 'collapsed' || mode === 'peek') {
            return (
                <button
                    onClick={() => onModeChange('list')}
                    className="flex-1 flex flex-col items-center justify-center gap-0.5"
                >
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
                <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-gray-50 sheet-scroll-content" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            <div
                ref={sheetRef}
                onPointerDown={onPointerDown}
                className="absolute bottom-0 left-0 right-0 z-40 bg-white flex flex-col overflow-hidden"
                style={{
                    height: sheetHeight,
                    borderTopLeftRadius: '1.5rem',
                    borderTopRightRadius: '1.5rem',
                    boxShadow: '0 -6px 32px rgba(0,0,0,0.12), 0 -2px 8px rgba(0,0,0,0.06)',
                    transition: dragging ? 'none' : 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                    touchAction: 'none',
                    willChange: 'height',
                }}
            >
                {/* Drag handle */}
                <div className="flex-shrink-0 pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing">
                    <div className="w-10 h-[5px] rounded-full bg-gray-300" />
                </div>

                {showHeader && (
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
                                <button
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
                                </button>
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
            </div>

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
