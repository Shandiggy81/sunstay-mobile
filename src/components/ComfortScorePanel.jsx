import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Activity, ShieldCheck, Thermometer, Wind, Droplets, Info } from 'lucide-react';
import { getSunScoreLabel } from '../util/sunScore';

const ComfortScorePanel = ({ venue, sunstayScore, weather }) => {
    const scoreInfo = getSunScoreLabel(sunstayScore);
    const temp = Math.round(weather?.main?.temp || 20);
    const humidity = weather?.main?.humidity || 50;
    const windSpeed = weather?.wind?.speed || 5;

    // Categorized factors for the "Breakdown"
    const factors = [
        { label: 'Thermal Comfort', value: temp > 18 && temp < 26 ? 100 : 70, icon: Thermometer, color: 'text-orange-500' },
        { label: 'Wind Protection', value: windSpeed < 10 ? 95 : 60, icon: Wind, color: 'text-blue-500' },
        { label: 'Humidity Balance', value: humidity > 40 && humidity < 60 ? 100 : 80, icon: Droplets, color: 'text-cyan-500' },
        { label: 'Sun Exposure', value: sunstayScore, icon: Sparkles, color: 'text-amber-500' },
    ];

    return (
        <div className="space-y-6 text-gray-800">
            <div className="flex items-center gap-3 mb-2">
                <Activity className="text-emerald-500" size={20} />
                <h3 className="text-lg font-black uppercase tracking-tight">Intelligence Breakdown</h3>
            </div>

            {/* Hero Score visualization */}
            <div className="relative h-48 w-full rounded-[40px] bg-gradient-to-br from-gray-900 to-gray-800 overflow-hidden flex items-center justify-center border border-white/10 shadow-2xl">
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-emerald-500/30 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border border-emerald-500/20 rounded-full animate-ping" style={{ animationDuration: '4s' }} />
                </div>

                <div className="relative z-10 text-center">
                    <motion.p
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="text-7xl font-black text-white"
                    >
                        {sunstayScore}
                    </motion.p>
                    <p className={`text-xs font-black uppercase tracking-[0.3em] mt-2 ${scoreInfo.color.replace('bg-', 'text-')}`}>
                        {scoreInfo.label}
                    </p>
                </div>

                <div className="absolute bottom-6 left-0 right-0 px-8 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-emerald-400" size={14} />
                        <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Verified Logic</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="text-amber-400" size={14} />
                        <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Live Sync</span>
                    </div>
                </div>
            </div>

            {/* Factors list */}
            <div className="space-y-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Proprietary Factors</p>
                <div className="grid grid-cols-1 gap-3">
                    {factors.map((factor, i) => (
                        <motion.div
                            key={i}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center ${factor.color}`}>
                                    <factor.icon size={20} />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-800">{factor.label}</p>
                                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight">Contributing Weight: {i === 3 ? '40%' : '20%'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-black text-gray-800">{factor.value}%</p>
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${factor.value}%` }}
                                        className={`h-full ${factor.color.replace('text-', 'bg-')}`}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Note about logic */}
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-2xl">
                <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                    The Sunstay Comfort Score is a proprietary index combining environmental data with spatial venue characteristics.
                </p>
            </div>
        </div>
    );
};

export default ComfortScorePanel;
