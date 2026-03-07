import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, X, Locate, Sun, Cloud, CloudRain, Wind } from 'lucide-react';

const WeatherBadge = ({ weather }) => {
    if (!weather) return null;
    const temp = Math.round(weather.main?.temp || 0);
    const condition = (weather.weather?.[0]?.main || '').toLowerCase();
    const windSpeed = Math.round((weather.wind?.speed || 0) * 3.6);

    let icon = <Sun size={12} className="text-amber-500" />;
    let tempColor = 'text-amber-600';
    if (condition.includes('rain')) {
        icon = <CloudRain size={12} className="text-blue-500" />;
        tempColor = 'text-blue-600';
    } else if (condition.includes('cloud')) {
        icon = <Cloud size={12} className="text-gray-500" />;
        tempColor = 'text-gray-600';
    } else if (windSpeed > 40) {
        icon = <Wind size={12} className="text-slate-500" />;
        tempColor = 'text-slate-600';
    }

    return (
        <div className="flex items-center gap-1 bg-white/90 border border-gray-100 rounded-full px-2.5 py-1 shadow-sm flex-shrink-0">
            {icon}
            <span className={`text-[11px] font-bold ${tempColor}`}>{temp}°</span>
        </div>
    );
};

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather }) => {
    const [focused, setFocused] = useState(false);

    return (
        <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', damping: 22, stiffness: 220 }}
            className="absolute top-0 left-0 right-0 z-30 px-3 pt-safe-top"
            style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
        >
            <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-2 bg-white shadow-md border transition-all duration-200 rounded-xl px-3 py-2 ${focused ? 'border-amber-400 shadow-amber-100' : 'border-gray-100'}`}>
                    <Search size={14} className="text-gray-400 flex-shrink-0" />
                    <input
                        type="text"
                        placeholder="Search venues, suburbs…"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-[13px] outline-none font-medium min-w-0"
                    />
                    {searchQuery && (
                        <button
                            onMouseDown={e => { e.preventDefault(); onSearchChange(''); }}
                            className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>

                <WeatherBadge weather={weather} />

                <motion.button
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onRecenter}
                    className="w-9 h-9 bg-white rounded-xl shadow-md border border-gray-100 flex items-center justify-center flex-shrink-0"
                >
                    <Locate size={15} className="text-gray-600" />
                </motion.button>
            </div>
        </motion.div>
    );
};

export default TopBar;
