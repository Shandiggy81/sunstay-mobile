import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sun, Cloud, Wind, CloudRain } from 'lucide-react';

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather, onFiltersOpen, comfort }) => {
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

    // Use real precipProbability if available, otherwise fallback estimate
    const rainChance = weather?.precipProbability
        ?? Math.min(100, Math.round(humidity * 0.3 + (condition.includes('rain') ? 40 : 0)));

    const descFormatted = description
        ? description.charAt(0).toUpperCase() + description.slice(1)
        : 'Loading\u2026';

    return (
        <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', damping: 24, stiffness: 240 }}
            className="flex-shrink-0 z-40 min-h-[72px]"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
            <div
                className="relative flex min-h-[132px] items-center gap-4 px-4 pr-[16px] py-3.5 bg-white/80 backdrop-blur-md border-b border-slate-100"
            >
                {/* Logo */}
                <div className="flex flex-col items-center justify-center flex-shrink-0 relative z-10">
                    <Sun size={32} className="text-amber-500" />
                    <span className="text-slate-900 font-black text-[9px] tracking-[2px] uppercase mt-1">SUNSTAY</span>
                </div>

                {/* Centre weather display */}
                <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 relative z-10">
                    <span className="text-slate-900 font-bold text-[13px] tracking-tight uppercase">Melbourne</span>
                    <span className="text-slate-900 font-black text-[32px] leading-none tracking-tight min-h-[32px]">
                        {weather ? `${temp}°C` : '\u00a0'}
                    </span>
                    <div className="flex min-h-[40px] flex-col items-center gap-1">
                        <span className="text-slate-600 text-[11px] font-medium italic">
                            {weather ? descFormatted : 'Loading\u2026'}
                        </span>
                        {comfort && comfort.label !== 'Loading' && (
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full shadow-sm border border-slate-200 font-medium tracking-wide">
                                {comfort.icon} {comfort.label}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right side stats with divider */}
                {weather && (
                    <>
                        <div
                            className="h-[48px] w-[1px] bg-slate-200 flex-shrink-0 relative z-10"
                            style={{ alignSelf: 'center' }}
                        />
                        <div className="flex-shrink-0 flex flex-col gap-1.5 items-start pr-4 relative z-10">
                            <span className="text-slate-700 text-[12px] font-medium leading-tight">
                                💨 {windSpeed} km/h
                            </span>
                            <span className="text-slate-700 text-[12px] font-medium leading-tight">
                                🌧 {Math.round(rainChance)}%
                            </span>
                            {cloudLabel && (
                                <span className="text-slate-700 text-[12px] font-medium leading-tight">
                                    ☁️ {cloudLabel}
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>

        </motion.div>
    );
};

export default TopBar;
