import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';

const BANNER_GRADIENT = 'linear-gradient(to right, #38BDF8 0%, #0284C7 50%, #0369A1 100%)';

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather, onFiltersOpen }) => {
    const [searchOpen, setSearchOpen] = useState(false);

    const temp = weather ? Math.round(weather.main?.temp || 0) : null;
    const condition = (weather?.weather?.[0]?.main || '').toLowerCase();
    const description = weather?.weather?.[0]?.description || '';
    const windSpeed = Math.round((weather?.wind?.speed || 0) * 3.6);
    const humidity = weather?.main?.humidity || 0;
    const cloudiness = weather?.clouds?.all ?? null;

    const cloudLabel = cloudiness === null ? null
        : cloudiness < 25 ? 'Low'
        : cloudiness < 60 ? 'Mid'
        : 'High';

    const rainChance = Math.min(100, Math.round(humidity * 0.3 + (condition.includes('rain') ? 40 : 0)));

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
                className="flex items-center gap-3 px-4 pr-[16px] py-5"
                style={{ background: BANNER_GRADIENT, minHeight: 88 }}
            >
                <img
                    src="/Gemini_Generated_Image_jpt43mjpt43mjpt4.png"
                    alt="SunStay"
                    className="h-14 w-14 rounded-xl object-cover flex-shrink-0"
                    style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
                    onError={e => {
                        e.target.src = '/Gemini_Generated_Image_1925ti1925ti1925.png';
                    }}
                />

                <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                    <div className="flex items-baseline gap-2">
                        <span className="text-white font-bold text-[13px] tracking-[0.12em] uppercase">Melbourne</span>
                        {weather && (
                            <span
                                className="text-white font-black text-[26px] leading-none tracking-tight"
                                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.15)' }}
                            >
                                {temp}°C
                            </span>
                        )}
                    </div>
                    <span className="text-white/75 text-[13px] font-medium">
                        {weather ? descFormatted : 'Loading…'}
                    </span>
                </div>

                {weather && (
                    <div className="flex-shrink-0 flex flex-col gap-1.5 items-end mr-1">
                        <span className="text-white text-[12px] leading-tight">
                            💨 {windSpeed} km/h
                        </span>
                        <span className="text-white text-[12px] leading-tight">
                            🌧 {rainChance}%
                        </span>
                        {cloudLabel && (
                            <span className="text-white text-[12px] leading-tight">
                                ☁️ {cloudLabel}
                            </span>
                        )}
                    </div>
                )}
            </div>

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
