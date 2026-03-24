import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';

const BANNER_GRADIENT = 'linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%)';

const SunLogo = () => (
    <div style={{width:56,height:56,borderRadius:'50%',
    background:'linear-gradient(135deg,#F59E0B,#F97316)',
    boxShadow:'0 2px 12px rgba(245,166,35,0.5)',
    display:'flex',alignItems:'center',
    justifyContent:'center',fontSize:30}}>😎</div>
);

const WeatherIcon = ({ condition, windSpeed }) => {
    if (condition.includes('rain') || condition.includes('drizzle')) return <CloudRain size={16} className="text-white/90" />;
    if (windSpeed > 40) return <Wind size={16} className="text-white/90" />;
    if (condition.includes('cloud')) return <Cloud size={16} className="text-white/90" />;
    return <Sun size={16} className="text-yellow-300" />;
};

const TopBar = ({ searchQuery, onSearchChange, onRecenter, weather, onFiltersOpen, onShowDashboard }) => {
    const [searchOpen, setSearchOpen] = useState(false);
    const [logoFailed, setLogoFailed] = useState(false);

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
                {/* Logo */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 relative z-10">
                    {logoFailed ? <SunLogo /> : (
                        <img
                            src="/sunstay-logo.png"
                            alt="Sunstay Logo"
                            className="h-[56px] w-auto object-contain"
                            style={{filter:'drop-shadow(0 2px 8px rgba(0,0,0,0.3))'}}
                            onError={() => setLogoFailed(true)}
                        />
                    )}
                    <span style={{color:'#fff',fontWeight:900,fontSize:10,
                    letterSpacing:'2px',textTransform:'uppercase',
                    textShadow:'0 1px 3px rgba(0,0,0,0.4)'}}>SUNSTAY</span>
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

                {/* Right side stats with Partner View button */}
                <div className="flex-shrink-0 flex items-center gap-3 relative z-10">
                    {weather && (
                        <>
                            <div className="h-[48px] w-[1px] bg-white/30 flex-shrink-0" />
                            <div className="flex flex-col gap-1.5 items-start">
                                <span className="text-white text-[12px] leading-tight">
                                    💨 {windSpeed} km/h
                                </span>
                                <span className="text-white text-[12px] leading-tight">
                                    🌧 {rainChance}%
                                </span>
                            </div>
                        </>
                    )}
                    
                    <button
                        onClick={onShowDashboard}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors border border-white/30 backdrop-blur-sm"
                    >
                        <span>🏢</span> Partner View
                    </button>
                </div>
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
