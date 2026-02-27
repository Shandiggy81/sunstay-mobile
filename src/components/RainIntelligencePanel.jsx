import React from 'react';
import { motion } from 'framer-motion';
import { CloudRain, Droplets, MapPin, Info, ArrowUpRight } from 'lucide-react';
import { getRainTiming, getRainSuggestion, getRainWindowFinder, isRainSafe } from '../data/rainIntelligence';

const RainIntelligencePanel = ({ venue, weather }) => {
    const timing = getRainTiming(weather);
    const suggestion = getRainSuggestion(venue, weather);
    const windowFinder = getRainWindowFinder(weather);
    const rainSafe = isRainSafe(venue);

    // Mock radar data for visual effect
    const radarData = [
        { time: '12:00', intensity: 0 },
        { time: '13:00', intensity: 20 },
        { time: '14:00', intensity: 60 },
        { time: '15:00', intensity: 40 },
        { time: '16:00', intensity: 10 },
        { time: '17:00', intensity: 0 },
    ];

    return (
        <div className="space-y-6 text-gray-800">
            <div className="flex items-center gap-3 mb-2">
                <CloudRain className="text-blue-500" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight">Precipitation Pulse</h3>
            </div>

            {/* Current Status */}
            <div className={`p-6 rounded-3xl ${timing.active ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'} border shadow-inner flex flex-col items-center text-center`}>
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-3xl shadow-sm mb-4">
                    {timing.active ? '🌧️' : '☁️'}
                </div>
                <h4 className="text-xl font-black text-gray-800">{timing.label}</h4>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Live Venue Radar</p>

                {suggestion && (
                    <div className="mt-4 p-3 bg-white/80 rounded-2xl border border-blue-100/50 shadow-sm">
                        <p className="text-xs font-bold text-blue-600 leading-tight">{suggestion}</p>
                    </div>
                )}
            </div>

            {/* Radar Simulation (Visual WoW Factor) */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Expected Intensity</p>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <span className="text-[10px] font-black text-blue-500 uppercase">Live</span>
                    </div>
                </div>

                <div className="flex items-end justify-between h-20 gap-2 px-1">
                    {radarData.map((data, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 gap-2">
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: `${data.intensity}%` }}
                                className={`w-full rounded-t-lg ${data.intensity > 50 ? 'bg-blue-600' : 'bg-blue-400'}`}
                            />
                            <span className="text-[8px] font-black text-gray-400 uppercase">{data.time}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Dry Window Finder */}
            <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                        <Droplets className="text-emerald-500" size={18} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Dry Window Finder</p>
                        <p className="text-sm font-black text-gray-800">{windowFinder}</p>
                    </div>
                </div>
                <button className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-emerald-500 shadow-sm active:scale-90 transition-transform">
                    <ArrowUpRight size={16} />
                </button>
            </div>

            {/* Venue Specific Advice */}
            <div className="p-5 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <MapPin size={14} className="text-blue-500" />
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">At {venue.venueName}</h4>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-600">Covered Seating</span>
                        <span className={`text-[10px] font-black uppercase ${rainSafe ? 'text-emerald-500' : 'text-orange-500'}`}>
                            {rainSafe ? 'Available' : 'Limited'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-600">Indoor Transition</span>
                        <span className="text-[10px] font-black text-emerald-500 uppercase">Seamless</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-600">Drainage Rating</span>
                        <span className="text-[10px] font-black text-blue-500 uppercase">Premium</span>
                    </div>
                </div>
            </div>

            {/* Note */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
                <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                    Sunstay utilizes micro-climate hyper-local data. Regional forecasts may vary.
                </p>
            </div>
        </div>
    );
};

export default RainIntelligencePanel;
