import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Sun, Cloud, CloudRain, Wind, SlidersHorizontal, Bell } from 'lucide-react';

const BANNER_GRADIENT = 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)';

const WeatherIcon = ({ condition, windSpeed }) => {
    if (condition.includes('rain') || condition.includes('drizzle')) return <CloudRain size={16} className="text-white/90" />;
    if (windSpeed > 40) return <Wind size={16} className="text-white/90" />;
    if (condition.includes('cloud')) return <Cloud size={16} className="text-white/90" />;
    return <Sun size={16} className="text-yellow-300" />;
};

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather, onFiltersOpen }) => {
    const [searchOpen, setSearchOpen] = useState(false);

    const temp = weather ? Math.round(weather.main?.temp || 0) : null;
    const condition = (weather?.weather?.[0]?.main || '').toLowerCase();
    const description = weather?.weather?.[0]?.description || '';
    const windSpeed = Math.round((weather?.wind?.speed || 0) * 3.6);
    const windDisplay = windSpeed > 0 ? `${windSpeed} km/h` : null;

    const descFormatted = description
        ? description.charAt(0).toUpperCase() + description.slice(1)
        : 'Loading…';

    return (
        <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', damping: 24, stiffness: 240 }}
            className="flex-shrink-0 z-40"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div
                className="flex items-center gap-4 px-4 py-3 h-[72px]"
                style={{ background: BANNER_GRADIENT }}
            >
                {/* Logo */}
                <div className="flex-shrink-0 flex items-center gap-2">
                    <img
                        src="/Gemini_Generated_Image_jpt43mjpt43mjpt4.png"
                        alt="SunStay"
                        className="h-10 w-10 rounded-lg object-cover"
                        onError={e => {
                            e.target.src = '/Gemini_Generated_Image_1925ti1925ti1925.png';
                        }}
                    />
                    <span className="text-white font-bold text-[20px] tracking-tight hidden xs:block">SunStay</span>
                </div>

                {/* Location + Weather Block */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-white/80 flex-shrink-0" />
                        <span className="text-white font-bold text-[14px] tracking-wide truncate">Melbourne</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        {weather ? (
                            <>
                                <WeatherIcon condition={condition} windSpeed={windSpeed} />
                                <span className="text-white font-bold text-[20px] leading-none">{temp}°C</span>
                                <span className="text-white/80 text-[14px] font-medium truncate hidden sm:inline">{descFormatted}</span>
                            </>
                        ) : (
                            <span className="text-white/60 text-[12px]">Loading…</span>
                        )}
                    </div>
                </div>

                {/* Filters Button (restored) */}
                <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={onFiltersOpen}
                    className="flex items-center gap-1.5 bg-white rounded-xl px-3.5 py-2 flex-shrink-0 shadow-sm"
                >
                    <SlidersHorizontal size={14} className="text-[#1E40AF]" />
                    <span className="text-[#1E40AF] text-[14px] font-bold">Filters</span>
                </motion.button>


            </div>

            {/* Expandable search bar */}
            <AnimatePresence>
                {searchOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ background: BANNER_GRADIENT, overflow: 'hidden' }}
                        className="px-3 pb-2.5"
                    >
                        <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2">
                            <Search size={14} className="text-gray-400 flex-shrink-0" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search venues, suburbs…"
                                value={searchQuery}
                                onChange={e => onSearchChange(e.target.value)}
                                className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-[13px] outline-none font-medium"
                            />
                            {searchQuery ? (
                                <button onMouseDown={e => { e.preventDefault(); onSearchChange(''); }}>
                                    <X size={13} className="text-gray-400" />
                                </button>
                            ) : (
                                <button onMouseDown={() => setSearchOpen(false)}>
                                    <X size={13} className="text-gray-400" />
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default TopBar;
