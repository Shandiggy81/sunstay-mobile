import React, { useRef, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Search, ChevronDown } from 'lucide-react';

const VenueListRow = ({ venue, isSelected, onClick, weather }) => {
    const condition = (weather?.weather?.[0]?.main || '').toLowerCase();
    const emoji = condition.includes('rain') ? '🌧️' : condition.includes('cloud') ? '☁️' : '☀️';
    return (
        <motion.button
            layout
            whileHover={{ x: 2, backgroundColor: 'rgba(255,255,255,0.05)' }}
            whileTap={{ scale: 0.985 }}
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left border ${isSelected ? 'bg-amber-500/10 border-amber-400/25' : 'border-transparent hover:border-white/8'}`}
        >
            <span className="text-xl flex-shrink-0 leading-none">{venue.emoji}</span>
            <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm truncate leading-tight">{venue.venueName}</div>
                <div className="text-white/40 text-xs truncate mt-0.5">
                    {venue.typeCategory === 'ShortStay' || venue.typeCategory === 'Hotel' ? venue.typeLabel : venue.vibe}
                    {venue.suburb ? ` · ${venue.suburb}` : ''}
                </div>
            </div>
            <span className="text-sm flex-shrink-0 opacity-70">{emoji}</span>
        </motion.button>
    );
};

export const DesktopVenuePanel = ({ venues, selectedVenue, onVenueSelect, onClose, weather, activeFilters, onClearFilters, searchQuery, onSearch }) => {
    return (
        <motion.div
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="venue-panel-desktop"
        >
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
                <div>
                    <h2 className="text-white font-black text-sm tracking-tight">Venues</h2>
                    <p className="text-white/35 text-[11px] mt-0.5">{venues.length} result{venues.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                    {activeFilters.length > 0 && (
                        <button onClick={onClearFilters} className="text-amber-400 text-[10px] font-bold hover:text-amber-300 transition-colors">
                            Clear
                        </button>
                    )}
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9, rotate: 90 }}
                        transition={{ type: 'spring', stiffness: 400 }}
                        onClick={onClose}
                        className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-white/40 transition-colors"
                    >
                        <X size={13} />
                    </motion.button>
                </div>
            </div>

            <div className="px-3 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                    <Search size={12} className="text-white/25 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Filter list…"
                        value={searchQuery}
                        onChange={e => onSearch(e.target.value)}
                        className="flex-1 bg-transparent text-white placeholder-white/20 text-xs outline-none"
                    />
                    <AnimatePresence>
                        {searchQuery && (
                            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                onClick={() => onSearch('')} className="text-white/25 hover:text-white/50">
                                <X size={11} />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide space-y-0.5">
                <AnimatePresence mode="popLayout">
                    {venues.map(venue => (
                        <VenueListRow
                            key={venue.id}
                            venue={venue}
                            isSelected={selectedVenue?.id === venue.id}
                            onClick={() => onVenueSelect(venue)}
                            weather={weather}
                        />
                    ))}
                </AnimatePresence>
                {venues.length === 0 && (
                    <div className="text-center py-10">
                        <p className="text-white/20 text-sm">No matches</p>
                        <button onClick={onClearFilters} className="text-amber-400 text-xs mt-2 hover:text-amber-300">Clear filters</button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export const MobileVenueSheet = ({ venues, selectedVenue, onVenueSelect, onClose, weather, activeFilters, onClearFilters }) => {
    const [sheetHeight, setSheetHeight] = useState('peek');
    const dragControls = useDragControls();

    const heightMap = { peek: '72px', half: '50vh', full: '82vh' };
    const nextHeight = { peek: 'half', half: 'full', full: 'peek' };

    const handleDragEnd = (_, info) => {
        const vy = info.velocity.y;
        const oy = info.offset.y;
        if (vy < -300 || oy < -60) {
            setSheetHeight(prev => prev === 'peek' ? 'half' : 'full');
        } else if (vy > 300 || oy > 60) {
            setSheetHeight(prev => prev === 'full' ? 'half' : 'peek');
        }
    };

    return (
        <motion.div
            className="venue-sheet-mobile"
            animate={{ height: heightMap[sheetHeight] }}
            transition={{ type: 'spring', damping: 32, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.12}
            onDragEnd={handleDragEnd}
        >
            <div
                className="flex flex-col items-center pt-3 pb-2 cursor-grab active:cursor-grabbing flex-shrink-0"
                onPointerDown={e => dragControls.start(e)}
            >
                <div className="w-10 h-1.5 rounded-full bg-white/20 mb-2" />
                <div className="flex items-center justify-between w-full px-4">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">Venues</span>
                        <span className="text-white/30 text-xs">{venues.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeFilters.length > 0 && (
                            <button onClick={onClearFilters} className="text-amber-400 text-xs font-semibold">Clear</button>
                        )}
                        <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() => setSheetHeight(prev => nextHeight[prev])}
                            className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/40"
                        >
                            <ChevronDown size={13} className={`transition-transform ${sheetHeight === 'full' ? 'rotate-0' : 'rotate-180'}`} />
                        </motion.button>
                    </div>
                </div>
            </div>

            <AnimatePresence>
                {sheetHeight !== 'peek' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 overflow-y-auto px-2 pb-6 scrollbar-hide space-y-0.5"
                    >
                        {venues.map(venue => (
                            <VenueListRow
                                key={venue.id}
                                venue={venue}
                                isSelected={selectedVenue?.id === venue.id}
                                onClick={() => { onVenueSelect(venue); setSheetHeight('peek'); }}
                                weather={weather}
                            />
                        ))}
                        {venues.length === 0 && (
                            <div className="text-center py-8">
                                <p className="text-white/20 text-sm">No matches</p>
                                <button onClick={onClearFilters} className="text-amber-400 text-xs mt-2">Clear filters</button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
