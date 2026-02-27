import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import SunCalc from 'suncalc';
import { Sun, Moon, Clock, Sparkles } from 'lucide-react';

const SunSimulator = ({ venue, photoUrl }) => {
    const [time, setTime] = useState(new Date().getHours() + new Date().getMinutes() / 60);
    const [hapticEnabled, setHapticEnabled] = useState(true);

    const venueCoords = { lat: venue.lat || -37.8136, lon: venue.lng || 144.9631 };

    const sunData = useMemo(() => {
        const date = new Date();
        date.setHours(Math.floor(time), (time % 1) * 60, 0, 0);

        try {
            const position = SunCalc.getPosition(date, venueCoords.lat, venueCoords.lon);
            const times = SunCalc.getTimes(date, venueCoords.lat, venueCoords.lon);

            // Convert azimuth (-pi to pi) and altitude (-pi/2 to pi/2)
            const altitudeDeg = position.altitude * (180 / Math.PI);
            const azimuthDeg = position.azimuth * (180 / Math.PI) + 180; // normalized to 0-360

            return {
                altitude: altitudeDeg,
                azimuth: azimuthDeg,
                isDaylight: altitudeDeg > 0,
                isGoldenHour: altitudeDeg > 0 && altitudeDeg < 10,
                sunrise: times.sunrise,
                sunset: times.sunset
            };
        } catch (e) {
            return { altitude: 45, azimuth: 180, isDaylight: true, isGoldenHour: false };
        }
    }, [time, venueCoords.lat, venueCoords.lon]);

    const handleTimeChange = (e) => {
        const newTime = parseFloat(e.target.value);
        setTime(newTime);
        if (hapticEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
            // Subtle tick for smooth dragging
            if (Math.floor(newTime) !== Math.floor(time)) {
                navigator.vibrate(5);
            }
        }
    };

    const getRecommendation = () => {
        if (!sunData.isDaylight) return "Perfect for late-night cocktails 🍸";
        if (sunData.isGoldenHour) return "Golden Hour! Peak photo conditions 📸";
        if (time >= 8 && time <= 11) return "Ideal for morning sunlight 🥐";
        if (time >= 12 && time <= 14) return "Direct sun exposure ☀️";
        if (time >= 15 && time <= 18) return "Relaxed afternoon shade 🍷";
        return "Ideal conditions for your visit";
    };

    const formatTime = (t) => {
        const h = Math.floor(t);
        const m = Math.round((t - h) * 60);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    // Calculate shadow styles based on sun position
    const shadowStyles = useMemo(() => {
        if (!sunData.isDaylight) return { opacity: 0.6, background: 'rgba(0,0,0,0.5)' };

        // Shadow length increases as altitude decreases
        const shadowOpacity = Math.max(0.1, 0.4 - (sunData.altitude / 90) * 0.3);
        const shadowLength = Math.max(0, (90 - sunData.altitude) / 2);
        const shadowAngle = sunData.azimuth + 180; // Shadow is opposite to sun

        return {
            opacity: shadowOpacity,
            filter: `blur(${shadowLength / 5}px)`,
            transform: `skewX(${Math.min(45, shadowLength)}deg) rotate(${shadowAngle}deg)`
        };
    }, [sunData]);

    return (
        <div className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" />
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Sun Simulator</h3>
                </div>
                <div className="px-3 py-1 bg-amber-50 rounded-full border border-amber-100 shadow-sm">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter">
                        {formatTime(time)}
                    </span>
                </div>
            </div>

            {/* Simulated Venue View */}
            <div className="relative aspect-video rounded-2xl overflow-hidden mb-6 bg-slate-100 border border-gray-100 group">
                <img
                    src={photoUrl || "https://images.unsplash.com/photo-1549443542-99086fd59379?auto=format&fit=crop&q=80&w=800"}
                    alt="Venue View"
                    className="w-full h-full object-cover transition-all duration-700"
                    style={{
                        filter: sunData.isDaylight
                            ? `brightness(${0.8 + (sunData.altitude / 90) * 0.4}) saturate(${1 + (sunData.isGoldenHour ? 0.5 : 0)})`
                            : `brightness(0.3) saturate(0.5) contrast(1.2)`
                    }}
                />

                {/* Golden Hour Overlay */}
                <motion.div
                    animate={{ opacity: sunData.isGoldenHour ? 0.4 : 0 }}
                    className="absolute inset-0 bg-gradient-to-t from-orange-500/50 to-amber-200/20 mix-blend-overlay pointer-events-none"
                />

                {/* Night Overlay */}
                <motion.div
                    animate={{ opacity: sunData.isDaylight ? 0 : 0.4 }}
                    className="absolute inset-0 bg-indigo-950/40 pointer-events-none"
                />

                {/* Interactive Shadow Overlay - High Fidelity Azimuth Logic */}
                <div
                    className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out"
                    style={{
                        background: sunData.isDaylight
                            ? `rgba(0, 0, 0, ${Math.max(0.1, 0.5 - (sunData.altitude / 90) * 0.4)})`
                            : 'rgba(15, 23, 42, 0.4)',
                        clipPath: sunData.isDaylight
                            ? `polygon(0% 100%, 100% 100%, 
                               ${50 + Math.sin((sunData.azimuth * Math.PI) / 180) * 50}% ${50 + Math.cos((sunData.azimuth * Math.PI) / 180) * (90 - sunData.altitude)}%,
                               ${50 - Math.sin((sunData.azimuth * Math.PI) / 180) * 50}% ${50 - Math.cos((sunData.azimuth * Math.PI) / 180) * (90 - sunData.altitude)}% )`
                            : 'none',
                        filter: `blur(${Math.max(4, (90 - sunData.altitude) / 5)}px)`,
                        mixBlendMode: 'multiply'
                    }}
                />

                {/* Sun Arc Path */}
                <div className="absolute inset-x-0 -top-4 bottom-0 pointer-events-none opacity-40">
                    <svg viewBox="0 0 400 200" className="w-full h-full">
                        <path d="M 50 180 A 150 120 0 0 1 350 180" stroke="white" strokeWidth="1" strokeDasharray="4 4" fill="none" />
                        <motion.g
                            animate={{
                                x: 50 + (time / 24) * 300,
                                y: 180 - Math.sin((time / 24) * Math.PI) * 150
                            }}
                            transition={{ type: 'spring', damping: 20 }}
                        >
                            {sunData.isDaylight ? (
                                <circle r="8" fill="#fbbf24" className="filter blur-[2px] drop-shadow-lg" />
                            ) : (
                                <circle r="6" fill="#e2e8f0" className="filter blur-[1px]" />
                            )}
                        </motion.g>
                    </svg>
                </div>

                {/* Real-time Recommendation Badge */}
                <div className="absolute bottom-3 left-3 right-3">
                    <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 shadow-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {sunData.isDaylight ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-indigo-400" />}
                            <span className="text-[11px] font-bold text-gray-800">{getRecommendation()}</span>
                        </div>
                        <Sparkles size={12} className="text-amber-400 animate-pulse" />
                    </div>
                </div>
            </div>

            {/* Interactive Slider */}
            <div className="px-2">
                <div className="relative h-12 flex items-center mb-1">
                    <input
                        type="range"
                        min="0"
                        max="23.99"
                        step="0.01"
                        value={time}
                        onChange={handleTimeChange}
                        className="w-full h-1.5 bg-gray-100 rounded-full appearance-none cursor-pointer accent-amber-500"
                    />
                </div>
                <div className="flex justify-between px-1">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Dawn</span>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Midday</span>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Dusk</span>
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Midnight</span>
                </div>
            </div>

            <p className="mt-4 text-[10px] text-gray-400 text-center font-medium italic">
                Simulated for {venue.venueName}'s orientation on {new Date().toLocaleDateString('en-AU', { month: 'long', day: 'numeric' })}
            </p>
        </div>
    );
};

export default SunSimulator;
