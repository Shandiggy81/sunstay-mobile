import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Calendar, Thermometer, Wind, Sun, CloudRain,
    MapPin, Share2, ChevronDown, ChevronUp, Droplets, Shield, Flame
} from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { getWindProfile, calculateApparentTemp, getComfortZone } from '../data/windIntelligence';
import { calculateDynamicToday } from '../util/sunCalcLogic';
import sunBadgeImg from '../assets/sun-badge.jpg';
import rainCloudImg from '../assets/rain-cloud.jpg';

const VenueCard = ({ venue, onClose }) => {
    const { calculateSunstayScore, getTemperature, theme, weather } = useWeather();
    const [expanded, setExpanded] = useState(false);

    if (!venue) return null;

    const sunstayScore = calculateSunstayScore(venue);
    const temperature = getTemperature();
    const hasFireplace = venue.tags?.includes('Fireplace');
    const hasHeaters = venue.tags?.includes('Heaters');
    const isRaining = (weather?.weather?.[0]?.main || '').toLowerCase().includes('rain');

    const sunLeft = useMemo(() => {
        if (!weather?.sys?.sunset) return null;
        const now = new Date();
        const sunset = new Date(weather.sys.sunset * 1000);
        const diff = sunset - now;
        if (diff <= 0) return { text: 'Sun has set', icon: '🌙' };
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        return { text: h > 0 ? `${h}h ${m}m` : `${m}min`, icon: h > 1 ? '☀️' : '🌅' };
    }, [weather]);

    const heatingStatus = useMemo(() => {
        if (!hasFireplace && !hasHeaters) return null;
        const temp = temperature || 20;
        const label = hasFireplace ? 'Fireplace' : 'Heaters';
        if (temp < 15) return { text: 'ON Now', active: true, label };
        if (temp < 20 && new Date().getHours() >= 17) return { text: 'ON from 5PM', active: true, label };
        return { text: 'Evenings', active: false, label };
    }, [temperature, hasFireplace, hasHeaters]);

    const optimalWindow = useMemo(() => {
        const room = (venue.roomTypes || []).find(r => r.hasBalcony || r.hasOutdoorArea);
        if (!room) return null;
        try {
            const today = calculateDynamicToday(
                venue.lat, venue.lng, room.orientation,
                weather?.clouds?.all / 100 || 0,
                room.obstructionLevel
            );
            return today?.optimalWindow || null;
        } catch { return null; }
    }, [venue, weather]);

    const windSpeed = weather?.wind?.speed != null ? Math.round(weather.wind.speed * 3.6) : null;
    const uvIndex = weather?.uvi;
    const typeLabel = venue.typeCategory === 'Hotel' || venue.typeCategory === 'ShortStay'
        ? venue.typeLabel
        : venue.vibe || 'Venue';

    const scoreColor = sunstayScore >= 75 ? 'from-amber-400 to-yellow-300'
        : sunstayScore >= 50 ? 'from-orange-400 to-amber-300'
        : 'from-blue-400 to-sky-300';

    return (
        <AnimatePresence>
            {venue && (
                <motion.div
                    initial={{ y: '100%', opacity: 0, scale: 0.96 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: '100%', opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.7 }}
                    className="fixed bottom-0 left-0 right-0 z-[9999] md:bottom-auto md:top-1/2 md:left-auto md:right-6 md:-translate-y-1/2 md:w-[380px]"
                >
                        <div className="glass-card rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl border border-white/20">
                            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-t-3xl md:rounded-3xl">
                                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-400/10 blur-3xl" />
                                <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-blue-400/8 blur-2xl" />
                            </div>

                            <div className="relative z-10">
                                <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-0 md:hidden" />

                                <div className="flex items-start justify-between px-5 pt-4 pb-3">
                                    <div className="flex items-center gap-3">
                                        <motion.div
                                            animate={{ rotate: [0, 3, -3, 0] }}
                                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                                            className="relative"
                                        >
                                            <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-lg border border-white/20 flex items-center justify-center bg-white/10 text-2xl">
                                                {venue.emoji}
                                            </div>
                                            <motion.div
                                                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full overflow-hidden border-2 border-white/30 shadow-md"
                                                animate={{ scale: [1, 1.1, 1] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                            >
                                                <img
                                                    src={isRaining ? rainCloudImg : sunBadgeImg}
                                                    alt={isRaining ? 'Rain' : 'Sun'}
                                                    className="w-full h-full object-cover"
                                                />
                                            </motion.div>
                                        </motion.div>
                                        <div>
                                            <h3 className="font-bold text-white text-base leading-tight">{venue.venueName}</h3>
                                            <p className="text-white/50 text-xs mt-0.5">{typeLabel} · {venue.suburb}</p>
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9, rotate: 90 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                        onClick={onClose}
                                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 transition-colors"
                                    >
                                        <X size={15} />
                                    </motion.button>
                                </div>

                                <div className="grid grid-cols-3 gap-2 px-5 pb-4">
                                    {[
                                        { icon: <Thermometer size={13} />, value: temperature != null ? `${temperature}°` : '--', label: 'Temp' },
                                        { icon: <span className="text-xs">{sunLeft?.icon ?? '☀️'}</span>, value: sunLeft?.text ?? '--', label: 'Sun Left' },
                                        heatingStatus
                                            ? { icon: <Flame size={13} />, value: heatingStatus.text, label: heatingStatus.label, highlight: heatingStatus.active }
                                            : { icon: <Wind size={13} />, value: windSpeed != null ? `${windSpeed}` : '--', label: 'Wind km/h' },
                                    ].map((stat, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.1 + i * 0.05 }}
                                            className={`glass-stat rounded-xl p-2.5 text-center ${stat.highlight ? 'border-amber-400/30 bg-amber-400/10' : ''}`}
                                        >
                                            <div className={`flex items-center justify-center gap-1 mb-1 ${stat.highlight ? 'text-amber-400' : 'text-white/40'}`}>
                                                {stat.icon}
                                            </div>
                                            <div className={`text-xs font-bold leading-none ${stat.highlight ? 'text-amber-300' : 'text-white'}`}>{stat.value}</div>
                                            <div className="text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{stat.label}</div>
                                        </motion.div>
                                    ))}
                                </div>

                                {optimalWindow && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.25 }}
                                        className="mx-5 mb-3 px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center gap-2"
                                    >
                                        <span className="text-sm">☀️</span>
                                        <span className="text-xs text-amber-300 font-medium">Best time: <strong>{optimalWindow}</strong></span>
                                    </motion.div>
                                )}

                                {venue.tags && venue.tags.length > 0 && (
                                    <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                                        {venue.tags.slice(0, 6).map((tag, i) => (
                                            <motion.span
                                                key={i}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: 0.15 + i * 0.03, type: 'spring', stiffness: 300 }}
                                                className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-white/8 text-white/60 border border-white/10"
                                            >
                                                {tag}
                                            </motion.span>
                                        ))}
                                    </div>
                                )}

                                <div className="px-5 pb-3">
                                    <motion.button
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setExpanded(e => !e)}
                                        className="w-full flex items-center justify-between py-2 text-white/40 hover:text-white/70 transition-colors text-xs font-semibold"
                                    >
                                        <span>{expanded ? 'Less details' : 'More details'}</span>
                                        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
                                            <ChevronDown size={13} />
                                        </motion.span>
                                    </motion.button>

                                    <AnimatePresence>
                                        {expanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.28, ease: 'easeInOut' }}
                                                className="overflow-hidden"
                                            >
                                                <div className="grid grid-cols-3 gap-2 pt-2 pb-3">
                                                    {[
                                                        { icon: <Wind size={12} />, value: windSpeed != null ? `${windSpeed} km/h` : '--', label: 'Wind' },
                                                        { icon: <Shield size={12} />, value: uvIndex != null ? uvIndex : '--', label: 'UV Index' },
                                                        { icon: <Droplets size={12} />, value: isRaining ? 'Yes' : 'No', label: 'Rain' },
                                                    ].map((d, i) => (
                                                        <div key={i} className="glass-stat rounded-xl p-2.5 text-center">
                                                            <div className="text-white/30 flex justify-center mb-1">{d.icon}</div>
                                                            <div className="text-xs font-bold text-white">{d.value}</div>
                                                            <div className="text-[9px] text-white/30 mt-0.5 uppercase tracking-wider">{d.label}</div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mb-3">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">Sunstay Score</span>
                                                        <span className={`text-sm font-black bg-gradient-to-r ${scoreColor} bg-clip-text text-transparent`}>{sunstayScore}</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${sunstayScore}%` }}
                                                            transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
                                                            className={`h-full rounded-full bg-gradient-to-r ${scoreColor}`}
                                                        />
                                                    </div>
                                                </div>

                                                {venue.address && (
                                                    <div className="flex items-center gap-2 py-2 border-t border-white/8">
                                                        <MapPin size={12} className="text-white/30 flex-shrink-0" />
                                                        <span className="text-xs text-white/40 leading-snug">{venue.address}</span>
                                                    </div>
                                                )}

                                                {venue.typeCategory === 'ShortStay' && venue.nightlyPriceDemo && (
                                                    <div className="py-2 text-xs text-amber-300 font-semibold">
                                                        {venue.nightlyPriceDemo} · Max {venue.guests} guests
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                <div className="px-5 pb-5 flex gap-2">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.95, y: 1 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-shadow"
                                    >
                                        <Calendar size={15} />
                                        <span>Book Now</span>
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.9, rotate: 10 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                                        onClick={() => {
                                            if (navigator.share) {
                                                navigator.share({ title: `${venue.venueName} on Sunstay`, url: window.location.href });
                                            } else {
                                                navigator.clipboard.writeText(window.location.href);
                                            }
                                        }}
                                        className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-white/70 transition-colors border border-white/10"
                                    >
                                        <Share2 size={15} />
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
            )}
        </AnimatePresence>
    );
};

export default VenueCard;
