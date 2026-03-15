import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Sun, Cloud, CloudRain, Wind, SlidersHorizontal } from 'lucide-react';

const BANNER_BLUE = '#1A6FAF';

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
            className="absolute top-0 left-0 right-0 z-40"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div
                className="flex items-center gap-3 px-3 py-2.5"
                style={{ backgroundColor: BANNER_BLUE }}
            >
                {/* Logo */}
                <div className="flex-shrink-0">
                    <img
                        src="/Gemini_Generated_Image_jpt43mjpt43mjpt4.png"
                        alt="SunStay"
                        className="h-9 w-9 rounded-lg object-cover"
                        onError={e => {
                            e.target.src = '/Gemini_Generated_Image_1925ti1925ti1925.png';
                        }}
                    />
                </div>

                {/* Location + Weather */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                        <MapPin size={11} className="text-white/70 flex-shrink-0" />
                        <span className="text-white font-bold text-[13px] tracking-wide truncate">Melbourne</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                        {weather ? (
                            <>
                                <WeatherIcon condition={condition} windSpeed={windSpeed} />
                                <span className="text-white/90 text-[11px] font-medium truncate hidden sm:inline">{descFormatted}</span>
                                {temp !== null && (
                                    <span className="text-white font-bold text-[12px] flex-shrink-0">{temp}°C</span>
                                )}
                                {windDisplay && (
                                    <span className="text-white/70 text-[10px] flex-shrink-0 hidden sm:inline">· {windDisplay}</span>
                                )}
                                
                                {/* New Global Badges for Demo */}
                                {windSpeed < 15 && !condition.includes('rain') && (
                                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hidden xs:inline-block ml-1">Event-Ready ☀️</span>
                                )}
                                {(new Date().getHours() >= 16 && new Date().getHours() <= 19) && !condition.includes('rain') && (
                                    <span className="bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hidden xs:inline-block ml-1">Photo Prime ⛅</span>
                                )}
                            </>
                        ) : (
                            <span className="text-white/60 text-[11px]">Loading weather…</span>
                        )}
                    </div>
                </div>

                {/* Filters button */}
                <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={onFiltersOpen}
                    className="flex items-center gap-1.5 bg-white/20 border border-white/30 rounded-lg px-2.5 py-1.5 flex-shrink-0"
                >
                    <SlidersHorizontal size={13} className="text-white" />
                    <span className="text-white text-[12px] font-semibold">Filters</span>
                </motion.button>

                {/* Search icon */}
                <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setSearchOpen(v => !v)}
                    className="w-8 h-8 bg-white/20 border border-white/30 rounded-lg flex items-center justify-center flex-shrink-0"
                >
                    <Search size={14} className="text-white" />
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
                        style={{ backgroundColor: BANNER_BLUE, overflow: 'hidden' }}
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
