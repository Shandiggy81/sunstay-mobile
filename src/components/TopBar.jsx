import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';

const BANNER_GRADIENT = 'linear-gradient(to right, #0a1628 0%, #1a8fe3 50%, #1a8fe3 85%, rgba(245,166,35,0.15) 100%)';

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
                className="relative flex items-center gap-4 px-4 pr-[16px] py-3.5"
                style={{
                    background: BANNER_GRADIENT,
                    minHeight: 72,
                    borderBottom: '1px solid rgba(255,255,255,0.2)'
                }}
            >
                {/* Shimmer overlay */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)'
                    }}
                />

                {/* Logo section */}
                <div className="flex flex-col items-center gap-0.5 flex-shrink-0 relative z-10">
                    <div className="text-[48px] leading-none">☀️</div>
                    <span
                        className="text-white font-bold text-[11px] tracking-[2px] uppercase"
                        style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                    >
                        SunStay
                    </span>
                </div>

                {/* Centre weather display */}
                <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 relative z-10">
                    <span className="text-white font-bold text-[13px] tracking-[1.5px] uppercase">Melbourne</span>
                    {weather && (
                        <span
                            className="text-white font-black text-[32px] leading-none tracking-tight"
                            style={{ textShadow: '0 2px 8px rgba(245,166,35,0.4)' }}
                        >
                            {temp}°C
                        </span>
                    )}
                    <span className="text-white/70 text-[11px] font-medium italic">
                        {weather ? descFormatted : 'Loading…'}
                    </span>
                </div>

                {/* Right side stats with divider */}
                {weather && (
                    <>
                        <div
                            className="h-[48px] w-[1px] bg-white/30 flex-shrink-0 relative z-10"
                            style={{ alignSelf: 'center' }}
                        />
                        <div className="flex-shrink-0 flex flex-col gap-1.5 items-start pr-4 relative z-10">
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
                    </>
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
