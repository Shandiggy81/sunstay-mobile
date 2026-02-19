import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Sun, Cloud, Wind, CloudRain, Star, Share2, CheckCircle } from 'lucide-react';
import { calculateHourComfort, findBestWindow } from '../data/timelineIntelligence';

const HourlyTimeline = ({ venue, hourlyData }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [showShareSuccess, setShowShareSuccess] = useState(false);

    const bestWindow = useMemo(() => findBestWindow(hourlyData, venue), [hourlyData, venue]);

    if (!hourlyData || hourlyData.length === 0) return null;

    const currentHour = hourlyData[activeIndex];
    const comfortScore = calculateHourComfort(currentHour, venue);

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-emerald-500 bg-emerald-50 border-emerald-100';
        if (score >= 60) return 'text-amber-500 bg-amber-50 border-amber-100';
        return 'text-orange-500 bg-orange-50 border-orange-100';
    };

    const handleShare = () => {
        const text = `${venue.venueName} looks perfect ${bestWindow.label}! ☀️ Book now on Sunstay.`;
        navigator.clipboard.writeText(text);
        setShowShareSuccess(true);
        setTimeout(() => setShowShareSuccess(false), 2000);
    };

    return (
        <div className="flex flex-col gap-4 p-4 bg-white/40 backdrop-blur-md rounded-3xl border border-white/50 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Interactive Timeline</span>
                </div>
                <button
                    onClick={handleShare}
                    className="p-2 hover:bg-white rounded-xl transition-all text-gray-400 hover:text-amber-500 flex items-center gap-1.5"
                >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Share</span>
                </button>
            </div>

            {/* Main Stats Display */}
            <div className="grid grid-cols-2 gap-3 mb-2">
                <div className={`p-3 rounded-2xl border transition-all ${getScoreColor(comfortScore)}`}>
                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Comfort Level</div>
                    <div className="flex items-end gap-1">
                        <span className="text-2xl font-black">{comfortScore}%</span>
                        <span className="text-[10px] font-bold mb-1">{comfortScore >= 80 ? 'Optimal' : comfortScore >= 60 ? 'Good' : 'Avoid'}</span>
                    </div>
                </div>
                <div className="p-3 bg-white/60 rounded-2xl border border-white/80 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Predicted at {new Date(currentHour.dt * 1000).getHours() % 12 || 12}{new Date(currentHour.dt * 1000).getHours() >= 12 ? 'pm' : 'am'}</div>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-gray-800">{currentHour.temp}°C</span>
                        <span className="text-sm font-bold text-gray-500 capitalize">{currentHour.weather[0].main}</span>
                    </div>
                </div>
            </div>

            {/* Timeline Slider */}
            <div className="relative pt-6 pb-2 px-2">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                    {hourlyData.map((h, i) => {
                        const score = calculateHourComfort(h, venue);
                        return (
                            <div
                                key={i}
                                className={`h-full ${score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-amber-400' : 'bg-orange-400'}`}
                                style={{ width: `${100 / hourlyData.length}%`, opacity: activeIndex === i ? 1 : 0.3 }}
                            />
                        );
                    })}
                </div>

                <div className="flex justify-between items-center mt-4">
                    {hourlyData.map((h, i) => {
                        const hour = new Date(h.dt * 1000).getHours();
                        const isActive = activeIndex === i;
                        return (
                            <button
                                key={i}
                                onClick={() => setActiveIndex(i)}
                                className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'scale-110' : 'opacity-40 hover:opacity-100'}`}
                            >
                                <span className={`text-[9px] font-black ${isActive ? 'text-amber-500' : 'text-gray-400'}`}>
                                    {hour % 12 || 12}{hour >= 12 ? 'p' : 'a'}
                                </span>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-amber-400 shadow-lg' : 'bg-white shadow-sm'}`}>
                                    {h.weather[0].main === 'Clear' ? <Sun className={`w-4 h-4 ${isActive ? 'text-white' : 'text-amber-500'}`} /> :
                                        h.weather[0].main === 'Clouds' ? <Cloud className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} /> :
                                            <CloudRain className={`w-4 h-4 ${isActive ? 'text-white' : 'text-blue-500'}`} />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Recommendation Footer */}
            <AnimatePresence mode="wait">
                {bestWindow && (
                    <motion.div
                        key="recommendation"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-2 p-3 bg-gradient-to-r from-amber-400/10 to-orange-500/10 rounded-2xl border border-amber-200/50 flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-400 rounded-xl flex items-center justify-center shadow-lg shadow-amber-200 shrink-0">
                                <Star className="w-5 h-5 text-white fill-white" />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Recommended Window</div>
                                <div className="text-xs font-bold text-gray-800">{bestWindow.label} (Score: {bestWindow.score})</div>
                            </div>
                        </div>
                        <button className="px-3 py-2 bg-amber-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all">
                            Lock In
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showShareSuccess && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl font-black flex items-center gap-2"
                    >
                        <CheckCircle className="w-5 h-5" />
                        Copied to clipboard!
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default HourlyTimeline;
